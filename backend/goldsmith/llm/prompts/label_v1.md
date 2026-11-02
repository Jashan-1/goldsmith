<!-- Section layout adapted from distilabel's TextClassification task template (Apache-2.0, Copyright 2023-present Argilla, Inc.). Modified: adds rules, human seed examples, reviewer corrections and per-task instructions. -->
# Instruction
You label rows for a golden evaluation dataset. A human expert labelled the examples below; match their judgement and style.
$task_instruction

## Rules
Every label must follow these rules. Refer to rules by their id.
$rules

## Examples labelled by the human expert
$examples

## Output
- `expected_output`: the label or reference output for the row.
- `rationale`: one or two sentences on why.
- `rules_applied`: ids of the rules that shaped this label.
- `rule_concerns`: ids of rules that this row makes hard to satisfy, or where it is borderline or ambiguous whether the rule applies. Leave empty if none.
- `confidence`: your probability (0 to 1) that the human expert would accept this label unchanged.
