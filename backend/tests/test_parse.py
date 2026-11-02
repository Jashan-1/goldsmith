from pathlib import Path

import pytest

from goldsmith.ingest.parse import (
    MAX_ROWS,
    FieldMapping,
    IngestError,
    build_row_fields,
    parse_file,
    propose_mapping,
    row_text,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return parse_file(name, (FIXTURES / name).read_bytes())


@pytest.mark.parametrize(
    ("name", "fmt", "rows", "input_col", "ref_col"),
    [
        ("support_tickets.csv", "csv", 16, "text", "label"),
        ("prompts.jsonl", "jsonl", 8, "prompt", "completion"),
        ("qa.csv", "qa", 8, "question", "answer"),
        ("chat.jsonl", "chat", 6, "messages", None),
    ],
)
def test_detect_and_propose(name: str, fmt: str, rows: int, input_col: str, ref_col: str | None):
    parsed = load(name)
    assert parsed.format == fmt
    assert len(parsed.records) == rows
    mapping = propose_mapping(parsed)
    assert mapping is not None
    assert mapping.input == [input_col]
    assert mapping.reference_output == ref_col
    assert not mapping.problems(parsed.columns)


def test_unknown_columns_get_no_guess():
    assert propose_mapping(load("unknown_columns.csv")) is None


def test_chat_last_assistant_turn_becomes_reference():
    parsed = load("chat.jsonl")
    fields = build_row_fields(parsed, FieldMapping(input=["messages"], metadata=["id"]))
    assert fields[0]["reference_output"] == "Sorry about that. Can you share your order number?"
    assert [m["role"] for m in fields[0]["input"]["messages"]] == ["system", "user"]
    assert fields[0]["meta"] == {"id": "c1"}
    # Ends on a user turn: nothing to split off.
    assert fields[5]["reference_output"] is None
    assert row_text(fields[1]["input"]) == "user: How do I cancel my plan?"


def test_build_rows_csv():
    parsed = load("support_tickets.csv")
    mapping = FieldMapping(input=["text"], reference_output="label", metadata=["priority"])
    first = build_row_fields(parsed, mapping)[0]
    assert first == {
        "input": {"text": "I was charged twice for my subscription this month"},
        "reference_output": "billing",
        "meta": {"priority": "high"},
    }


def test_mapping_problems():
    m = FieldMapping(input=["a"], reference_output="a", metadata=["zzz"])
    assert m.problems(["a", "b"]) == ["Unknown column: zzz", "Each column can be used only once."]


@pytest.mark.parametrize(
    ("name", "content", "message"),
    [
        ("x.csv", b"", "empty"),
        ("x.jsonl", b'{"a": 1}\nnot json\n', "Line 2 is not valid JSON"),
        ("x.jsonl", b"[1, 2]\n", "Line 1 is not a JSON object"),
        ("x.jsonl", b'{"messages": "hi"}\n', "messages"),
        ("x.csv", b"a,b\n", "no data rows"),
        ("x.csv", b"\xff\xfe\x00", "UTF-8"),
        ("x.csv", b"q\n" + b"x\n" * (MAX_ROWS + 1), "limit is 5000"),
    ],
)
def test_bad_files(name: str, content: bytes, message: str):
    with pytest.raises(IngestError, match=message):
        parse_file(name, content)
