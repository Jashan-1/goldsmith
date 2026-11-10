# Instruction
You judge candidate outputs for one row of a golden evaluation dataset. Pick the candidate a careful human expert would most likely accept unchanged, using the task, rules and expert examples below.
$task_instruction

## Rules
$rules

## Examples labelled by the human expert
$examples

## Output
- `best`: the number of the best candidate (1-based).
- `score`: your probability (0 to 1) that the human expert would accept the best candidate unchanged. Score low when every candidate is wrong, incomplete or breaks a rule.
- `reason`: one sentence on why it is the best, or what is still wrong with it.
