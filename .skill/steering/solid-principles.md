---
id: solid-principles
title: SOLID principles
summary: Keep responsibilities, contracts, and dependencies small and replaceable.
kind: architecture
authority: advisory
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [solid, srp, ocp, lsp, isp, dip, design]
---
# Rule

Apply SOLID as a set of questions, not as a reason to add layers or abstractions:

- **Single responsibility:** a unit should have one reason to change. “One file” is not the
  same as “one responsibility”.
- **Open/closed:** extend behaviour through explicit extension points, composition, or ports
  rather than editing every caller.
- **Liskov substitution:** an implementation must honour the contract and failure modes of the
  interface it implements. A replacement must not introduce surprise exceptions or weaker
  guarantees.
- **Interface segregation:** prefer small role-specific contracts over one broad interface.
- **Dependency inversion:** high-level policy should not depend on low-level I/O details;
  both should depend on explicit contracts.

An abstraction needs a current consumer and a reason to exist. If it makes the change harder to
read or test, the design is not yet justified.

# Checks

- Can each changed unit be described by one responsibility?
- Does a new extension point replace a known variation, rather than a hypothetical one?
- Do implementations preserve the interface contract, including errors and empty states?
- Are interfaces shaped for their consumers instead of exposing a full provider API?
- Are dependencies explicit at the boundary rather than reached through globals or service
  locators?
- Is the design testable without a real framework, database, or network?

# Evidence

Record the affected responsibilities, contracts, and dependency direction in
`discovery/steering.md`, `assessment/steering.md`, and `reviews/steering-review.md`. Mention any
deliberate exception and its reason; do not use SOLID as a slogan.
