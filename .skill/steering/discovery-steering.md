---
id: discovery-steering
title: Apply steering during discovery
summary: Turn steering constraints into requirements, questions, and acceptance evidence before G2.
kind: process
authority: blocking
phases: [discovery]
tags: [discovery, requirements, gherkin, constraints]
---
# Rule

Discovery is where steering becomes testable. The PM must read every active rule before
finalizing requirements and must convert each applicable rule into one of:

- a requirement or Gherkin acceptance criterion;
- a question in the questionnaire;
- a documented assumption with risk;
- an explicit ADR-backed exception.

A rule that is not applicable must say why. “Not applicable” without a reason is not evidence.
Discovery does not review implementation style; it records the constraints that later phases
will verify.

# Checks

- Read `steering context --phase discovery` and every referenced rule file.
- Identify architecture boundaries, repository workflow constraints, style gates, and examples
  that affect the requirement.
- Add rule IDs to the relevant requirement, scenario, or questionnaire.
- Ask the user only where the steering rule leaves a genuine product or risk choice.
- Record deferred decisions as assumptions and state how logic review will detect them.
- Write `discovery/steering.md` with: rule ID, applicability, constraint, evidence/owner.
- Do not invent a technical solution in a PM-owned discovery artifact.

# Suggested discovery rules

- **Boundary fit:** which ports, contracts, or adapters does this requirement touch?
- **Repository fit:** which branch, release, or environment flow does the change require?
- **Style evidence:** which automated gates will prove the change meets the project’s style?
- **Example fit:** which example or pattern is the closest approved shape?
- **Conflict check:** does any requirement contradict a blocking steering rule?

# Evidence

The discovery gate may cite `discovery/steering.md` as G2 evidence. The file must be specific
enough that a reviewer can map a requirement to a rule and see the planned proof.
