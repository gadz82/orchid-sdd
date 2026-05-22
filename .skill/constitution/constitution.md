# orchid-sdd constitution

This file is the source of truth for **how** code is written. The spec is the source of truth for **what** is built.

## Precedence

1. Safety, legal, and security obligations.
2. Explicit human instruction recorded in an ADR.
3. This constitution and its project overrides.
4. Accepted spec and ADRs.
5. Persona guidance.

A conflict is surfaced, never silently resolved. Any deviation requires an ADR.

## Non-negotiables

- Validate input at the boundary; return typed errors.
- Never log secrets, tokens, passwords, or personal data.
- Every behaviour change ships with tests that can fail.
- New dependencies need an ADR and a maintenance owner.
- Public contracts are versioned; breaking changes are explicit.
- Data migrations are reversible or have a tested rollback.

## Comments and memory

- Behaviour comments explain *why*, never restate the code.
- A behaviour comment is at most 500 characters; omit it when the code is self-evident.
- Significant units carry one `ORCHID-MEM: <uuid>` anchor and one UUID-named docblock.
- The anchor is metadata, not an explanation. History belongs in the docblock and manifest.
- Never edit `.knowledge/**` or the manifest by hand.

## Definition of done

- Acceptance criteria and tests pass in a clean environment.
- Adversarial review has no open critical or high findings.
- The anchor, docblock, and index resolve (`orchid-sdd lint`).
- The prompt matrix is updated and the change is explainable in the handover.
