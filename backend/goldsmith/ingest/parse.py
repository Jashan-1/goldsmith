"""Turn an uploaded file into records, propose a field mapping, and build row fields."""

import csv
import io
import json
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 5000

INPUT_NAMES = [
    "input",
    "question",
    "prompt",
    "query",
    "instruction",
    "user_input",
    "messages",
    "text",
]
OUTPUT_NAMES = [
    "expected_output",
    "reference_output",
    "reference",
    "expected",
    "answer",
    "output",
    "response",
    "completion",
    "label",
    "target",
    "ground_truth",
]


class IngestError(ValueError):
    """A problem with the user's file; the message is shown to them."""


class FieldMapping(BaseModel):
    input: list[str] = Field(min_length=1)
    reference_output: str | None = None
    metadata: list[str] = []

    def problems(self, columns: list[str]) -> list[str]:
        used = [
            *self.input,
            *([self.reference_output] if self.reference_output else []),
            *self.metadata,
        ]
        unknown = sorted(set(used) - set(columns))
        errors = [f"Unknown column: {c}" for c in unknown]
        if len(used) != len(set(used)):
            errors.append("Each column can be used only once.")
        return errors


@dataclass
class ParsedFile:
    format: str  # csv | jsonl | qa | chat
    columns: list[str]
    records: list[dict[str, Any]]


def parse_file(filename: str, content: bytes) -> ParsedFile:
    if len(content) > MAX_BYTES:
        raise IngestError("File is larger than 10 MB.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise IngestError("File must be UTF-8 text.") from e
    if not text.strip():
        raise IngestError("File is empty.")

    name = filename.lower()
    is_jsonl = name.endswith((".jsonl", ".ndjson")) or (
        not name.endswith(".csv") and text.lstrip().startswith("{")
    )
    records = _parse_jsonl(text) if is_jsonl else _parse_csv(text)
    if not records:
        raise IngestError("File has no data rows.")
    if len(records) > MAX_ROWS:
        raise IngestError(f"File has {len(records)} rows; the limit is {MAX_ROWS}.")

    columns = list(dict.fromkeys(k for r in records for k in r))
    lower = {c.lower() for c in columns}
    if "messages" in columns:
        _validate_chat(records)
        fmt = "chat"
    elif lower & {"question", "query"} and "answer" in lower:
        fmt = "qa"
    else:
        fmt = "jsonl" if is_jsonl else "csv"
    return ParsedFile(fmt, columns, records)


def _parse_csv(text: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or not any(f.strip() for f in reader.fieldnames):
        raise IngestError("CSV needs a header row.")
    try:
        # Drop columns from ragged rows (DictReader puts extras under None).
        return [{k: v for k, v in row.items() if k is not None} for row in reader]
    except csv.Error as e:
        raise IngestError(f"CSV parse error: {e}") from e


def _parse_jsonl(text: str) -> list[dict[str, Any]]:
    records = []
    for n, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            raise IngestError(f"Line {n} is not valid JSON.") from e
        if not isinstance(obj, dict):
            raise IngestError(f"Line {n} is not a JSON object.")
        records.append(obj)
    return records


def _validate_chat(records: list[dict[str, Any]]) -> None:
    for n, r in enumerate(records, start=1):
        msgs = r.get("messages")
        ok = (
            isinstance(msgs, list)
            and msgs
            and all(isinstance(m, dict) and "role" in m and "content" in m for m in msgs)
        )
        if not ok:
            raise IngestError(f"Row {n}: `messages` must be a non-empty list of {{role, content}}.")


def propose_mapping(parsed: ParsedFile) -> FieldMapping | None:
    """Name-based guess. None means no input column was recognised."""
    by_lower = {c.lower().strip(): c for c in parsed.columns}
    inp = next((by_lower[n] for n in INPUT_NAMES if n in by_lower), None)
    if inp is None:
        return None
    ref = next((by_lower[n] for n in OUTPUT_NAMES if n in by_lower and by_lower[n] != inp), None)
    meta = [c for c in parsed.columns if c not in (inp, ref)]
    return FieldMapping(input=[inp], reference_output=ref, metadata=meta)


def build_row_fields(parsed: ParsedFile, mapping: FieldMapping) -> list[dict[str, Any]]:
    out = []
    for r in parsed.records:
        fields: dict[str, Any] = {
            "input": {c: r.get(c) for c in mapping.input},
            "reference_output": r.get(mapping.reference_output)
            if mapping.reference_output
            else None,
            "meta": {c: r.get(c) for c in mapping.metadata},
        }
        # Chat with no reference column: the final assistant turn is the reference.
        msgs = fields["input"].get("messages")
        if parsed.format == "chat" and mapping.reference_output is None and isinstance(msgs, list):
            if len(msgs) > 1 and msgs[-1].get("role") == "assistant":
                fields["input"]["messages"] = msgs[:-1]
                fields["reference_output"] = msgs[-1]["content"]
        out.append(fields)
    return out


def row_text(input_: dict[str, Any]) -> str:
    """Plain-text view of a row's input, used for embeddings and prompts."""
    parts: list[str] = []
    for key, value in input_.items():
        if key == "messages" and isinstance(value, list):
            parts.extend(f"{m.get('role')}: {m.get('content')}" for m in value)
        elif len(input_) == 1:
            parts.append(str(value))
        else:
            parts.append(f"{key}: {value}")
    # shortcut: truncates very long inputs to stay under the embedding token limit.
    return "\n".join(parts)[:20000]
