"""LLM labelling of non-seed rows, with an uncertainty score per row. Independent of FastAPI."""

import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from string import Template
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, create_model
from sqlalchemy import case, select, update
from sqlalchemy.orm import Session

from goldsmith.config import settings
from goldsmith.core.rules import current_rule_set
from goldsmith.core.uncertainty import (
    combine,
    label_disagreement,
    nearest_distance,
    percentile_ranks,
    status_for,
    text_disagreement,
)
from goldsmith.ingest.parse import row_text
from goldsmith.llm.provider import LLMProvider, get_provider, load_prompt
from goldsmith.models import Correction, Job, Label, Project, Row

HUMAN_SOURCES = ("human_seed", "human_review")
DECIDABLE = ("auto_accepted", "needs_review")  # statuses the threshold may flip
PROMPT_NAME = "label_v1"

TASK_INSTRUCTIONS = {
    "classification": "Choose the single best label for the row from: $labels. "
    "If unsure, still choose the closest label and lower your confidence.",
    "qa": "Write the ideal reference answer to the question or input in the row.",
    "chat": "Write the ideal next assistant reply to the conversation in the row.",
}


class LabellingError(RuntimeError):
    pass


class LabelOutput(BaseModel):
    expected_output: str
    rationale: str
    rules_applied: list[str]
    rule_concerns: list[str]
    confidence: float


def label_schema(labels: list[str] | None) -> type[LabelOutput]:
    """Classification restricts the output to labels the human already used in seeds."""
    if not labels:
        return LabelOutput
    choice: Any = Literal[tuple(labels)]
    return create_model("LabelOutput", __base__=LabelOutput, expected_output=(choice, ...))


@dataclass
class RowResult:
    row: Row
    outputs: list[LabelOutput] = field(default_factory=list)
    disagreement: float | None = None
    error: str | None = None


def build_instructions(
    task_type: str, rules: list[dict[str, Any]], seeds: list[tuple[Row, Any]], labels: list[str]
) -> str:
    rule_lines = "\n".join(f"- [{r['id']}] ({r['kind']}) {r['text']}" for r in rules)
    examples = "\n\n".join(
        f"### Example {i}\nRow:\n```\n{row_text(row.input)}\n```\nExpected output: {output}"
        for i, (row, output) in enumerate(seeds, start=1)
    )
    task = Template(TASK_INSTRUCTIONS[task_type]).safe_substitute(labels=", ".join(labels))
    return Template(load_prompt(PROMPT_NAME)).substitute(
        task_instruction=task,
        rules=rule_lines or "(no rules yet)",
        examples=examples,
    )


def similar_corrections(db: Session, project_id: uuid.UUID, vector: Any, k: int = 5) -> str:
    """Up to k past corrections on similar rows, as prompt text. Approvals carry no lesson."""
    hits = db.execute(
        select(Correction, Row)
        .join(Row, Correction.row_id == Row.id)
        .where(
            Row.project_id == project_id,
            Correction.embedding.is_not(None),
            Correction.action != "approve",
        )
        .order_by(Correction.embedding.cosine_distance(vector))
        .limit(k)
    ).all()
    lines = []
    for c, row in hits:
        change = (
            f"instruction: {c.instruction_text}"
            if c.action == "instruction"
            else "rejected the row"
            if c.action == "reject"
            else f"changed it to: {c.after}"
        )
        lines.append(
            f"- Row: {row_text(row.input)[:500]}\n  Model said: {c.before}\n  Reviewer {change}"
        )
    return "\n".join(lines)


def user_message(row: Row, corrections: str) -> str:
    parts = []
    if corrections:
        parts.append(f"## Past reviewer corrections on similar rows\n{corrections}")
    parts.append(f"## Row to label\n```\n{row_text(row.input)}\n```")
    return "\n\n".join(parts)


def _label_one(
    provider: LLMProvider,
    row: Row,
    instructions: str,
    message: str,
    schema: type[LabelOutput],
    samples: int,
    is_classification: bool,
) -> RowResult:
    result = RowResult(row)
    try:
        # First sample at temperature 0 is the label; extra samples measure disagreement.
        result.outputs = [provider.structured(instructions, message, schema, temperature=0)]
        result.outputs += [
            provider.structured(instructions, message, schema, temperature=0.7)
            for _ in range(samples - 1)
        ]
        texts = [o.expected_output for o in result.outputs]
        if samples > 1:
            result.disagreement = (
                label_disagreement(texts)
                if is_classification
                else text_disagreement(np.array(provider.embed(texts)))
            )
    except Exception as e:  # one bad row shouldn't sink the whole job
        result.error = str(e) or type(e).__name__
    return result


def rows_to_label(db: Session, project_id: uuid.UUID, row_ids: list[str] | None) -> list[Row]:
    """Non-seed, non-duplicate rows whose current label (if any) isn't a human one."""
    human = select(Label.row_id).where(Label.is_current, Label.source.in_(HUMAN_SOURCES))
    query = select(Row).where(
        Row.project_id == project_id,
        Row.duplicate_of.is_(None),
        Row.is_seed.is_(False),
        Row.embedding.is_not(None),
        Row.id.not_in(human),
    )
    if row_ids is not None:
        query = query.where(Row.id.in_([uuid.UUID(r) for r in row_ids]))
    return list(db.scalars(query.order_by(Row.created_at, Row.row_index)))


def run_labelling(db: Session, job: Job, progress: Callable[[int], None]) -> None:
    project = db.get_one(Project, job.project_id)
    samples = 1 if job.payload.get("cheap") else max(1, settings.label_samples)

    seeds = db.execute(
        select(Row, Label.expected_output)
        .join(Label, Label.row_id == Row.id)
        .where(Row.project_id == project.id, Label.is_current, Label.source == "human_seed")
        .order_by(Row.cluster_id, Row.row_index)
    ).all()
    if not seeds:
        raise LabellingError("Label at least one seed first.")
    rule_set = current_rule_set(db, project.id)
    rules = rule_set.rules if rule_set else []
    is_classification = project.task_type == "classification"
    labels = sorted({str(out) for _, out in seeds}) if is_classification else []
    schema = label_schema(labels or None)
    instructions = build_instructions(project.task_type, rules, [(r, o) for r, o in seeds], labels)

    targets = rows_to_label(db, project.id, job.payload.get("row_ids"))
    if not targets:
        return
    messages = {
        row.id: user_message(row, similar_corrections(db, project.id, row.embedding))
        for row in targets
    }

    provider = get_provider()
    results: list[RowResult] = []
    with ThreadPoolExecutor(max_workers=settings.label_concurrency) as pool:
        futures = [
            pool.submit(
                _label_one,
                provider,
                row,
                instructions,
                messages[row.id],
                schema,
                samples,
                is_classification,
            )
            for row in targets
        ]
        for done, future in enumerate(as_completed(futures), start=1):
            results.append(future.result())
            progress(int(95 * done / len(futures)))

    ok = [r for r in results if r.error is None]
    failed = [r for r in results if r.error is not None]
    if not ok:
        raise LabellingError(f"Every row failed to label. First error: {failed[0].error}")

    novelty = percentile_ranks(
        nearest_distance(
            np.array([r.row.embedding for r in ok]), human_reference_vectors(db, project.id)
        )
    )
    weights = settings.uncertainty_weights
    db.execute(
        update(Label)
        .where(Label.row_id.in_([r.row.id for r in ok]), Label.is_current)
        .values(is_current=False)
    )
    for result, nov in zip(ok, novelty, strict=True):
        first = result.outputs[0]
        confidence = min(1.0, max(0.0, first.confidence))
        signals = {
            "disagreement": result.disagreement,
            "rule_concerns": 1.0 if first.rule_concerns else 0.0,
            "novelty": nov,
            "confidence": 1 - confidence,
        }
        uncertainty = combine(signals, weights)
        db.add(
            Label(
                row_id=result.row.id,
                rule_set_version=rule_set.version if rule_set else 0,
                expected_output=first.expected_output,
                rationale=first.rationale,
                source="llm",
                status=status_for(uncertainty, project.review_threshold),
                uncertainty=uncertainty,
                uncertainty_breakdown={
                    "signals": signals,
                    "weights": weights,
                    "samples": [o.expected_output for o in result.outputs],
                    "stated_confidence": confidence,
                    "rules_applied": first.rules_applied,
                    "rule_concerns": first.rule_concerns,
                    "prompt": PROMPT_NAME,
                },
            )
        )
    if failed:
        job.error = (
            f"{len(failed)} of {len(results)} rows failed to label; run labelling again to retry. "
            f"First error: {failed[0].error}"
        )


def human_reference_vectors(db: Session, project_id: uuid.UUID) -> Any:
    vectors = db.scalars(
        select(Row.embedding)
        .join(Label, Label.row_id == Row.id)
        .where(Row.project_id == project_id, Label.is_current, Label.source.in_(HUMAN_SOURCES))
    ).all()
    return np.array(vectors) if vectors else np.zeros((0, 1))


def apply_threshold(db: Session, project: Project) -> None:
    """Re-split LLM labels into review / auto-accept from stored scores. No LLM calls."""
    project_rows = select(Row.id).where(Row.project_id == project.id)
    db.execute(
        update(Label)
        .where(
            Label.row_id.in_(project_rows),
            Label.is_current,
            Label.source == "llm",
            Label.status.in_(DECIDABLE),
        )
        .values(
            status=case(
                (Label.uncertainty >= project.review_threshold, "needs_review"),
                else_="auto_accepted",
            )
        )
    )
