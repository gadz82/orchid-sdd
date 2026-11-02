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

- An inline comment is optional; when present, it contains only the minimum context needed to
  explain *why* the code exists, why the choice is safe, or which non-obvious invariant it
  protects. It never restates *what* the code does.
- Keep behaviour comments at or below 500 characters; omit them when the code is self-evident.
- Never use comments as changelogs, author/date stamps, prompt logs, ADR lists, or copied
  history. Those belong in the docblock and manifest.
- Significant units carry exactly one `ORCHID-MEM: <uuidv7> — <short behaviour description>`
  anchor and one UUID-named docblock. The anchor is the only memory/history reference in code.
- The docblock records `Behavior`, `Why`, `Invariants`, `Failure modes`, `History`, and
  `Tests`; `History` names the ADR, specification, requirement, or scenario that explains the
  current state.
- Generated code never invents or copies a UUID. Mint one with `orchid-sdd new-uuid`, record the
  `CodeUnit`, write the docblock, and run `orchid-sdd lint`.
- Never edit `.knowledge/**` or the manifest by hand.

## Definition of done

- Acceptance criteria and tests pass in a clean environment.
- Adversarial review has no open critical or high findings.
- The anchor, docblock, and index resolve (`orchid-sdd lint`).
- The prompt matrix is updated and the change is explainable in the handover.
