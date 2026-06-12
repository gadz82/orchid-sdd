# Evals

Scenarios that need a model or harness, not a unit test:

| Scenario | Expected |
|---|---|
| `help me plan this feature` | The skill does **not** load. |
| `/orchid-sdd start "..."` | The skill loads and runs the command. |
| Vague title (`improve auth`) | Clarifying questions, no iteration started. |
| Missing required MCP source | `doctor` blocks before intent; degraded mode requires confirmation. |
| Conflicting PRD/decision | Questionnaire + ADR; no silent merge. |
| CR seeded defect | Review blocks; fix loop or escalation. |
| Overlapping prompt write scopes | Planner rejects the wave. |

The static half of the invocation guard is asserted in `tests/setup.test.mjs`.
