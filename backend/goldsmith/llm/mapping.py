import json
import logging

from goldsmith.ingest.parse import FieldMapping, ParsedFile, propose_mapping
from goldsmith.llm.provider import get_provider, load_prompt

logger = logging.getLogger(__name__)


def suggest_mapping(parsed: ParsedFile) -> FieldMapping:
    """Heuristics first; one LLM call only if they fail. Never raises: the user confirms anyway."""
    guess = propose_mapping(parsed)
    if guess is not None:
        return guess
    sample = [{k: str(v)[:200] for k, v in r.items()} for r in parsed.records[:3]]
    user = json.dumps({"columns": parsed.columns, "sample_records": sample}, ensure_ascii=False)
    try:
        mapping = get_provider().structured(load_prompt("propose_mapping_v1"), user, FieldMapping)
        if not mapping.problems(parsed.columns):
            return mapping
    except Exception:
        logger.warning("LLM mapping suggestion failed", exc_info=True)
    return FieldMapping.model_construct(input=[], reference_output=None, metadata=parsed.columns)
