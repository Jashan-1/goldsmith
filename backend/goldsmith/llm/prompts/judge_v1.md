# Instruction
You judge candidate outputs for one row of a golden evaluation dataset. Pick the candidate a careful human expert would most likely accept unchanged, using the task, rules and expert examples below.
$task_instruction

## Rules
$rules

## Examples labelled by the human expert
$examples

## Output
- `reason`: first compare the candidates against the rules and examples, in one or two sentences, and name the best one.
- `best`: the number of the candidate your reason named (1-based).
- `score`: your probability (0 to 1) that the human expert would accept that candidate unchanged. Score low when the candidates disagree on a fact you cannot verify from the rules or examples, or when every candidate is wrong, incomplete or breaks a rule.
