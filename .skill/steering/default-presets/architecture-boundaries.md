---
id: architecture-boundaries
title: Architecture boundaries
summary: Domain and application code stay independent of frameworks, transport, persistence, and UI.
kind: architecture
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [architecture, boundaries, dependencies, ports]
examples:
  - path: ../examples/typescript/hexagonal-port.ts
    title: "Port and adapter boundary"
    language: typescript
  - path: ../examples/typescript/domain-service.ts
    title: "Domain service using a port"
    language: typescript
---
# Rule

The dependency direction is **inward**:

```text
UI / transport / persistence  →  application  →  domain
```

Domain code must not import frameworks, HTTP clients, ORMs, database drivers, UI libraries, or
provider SDKs. Application code may orchestrate domain behavior through explicit ports.
Adapters implement those ports and contain all I/O.

The choice of hexagonal, onion, or clean architecture is a project decision, not a licence
to mix them. If the project selects a named pattern, enable its preset rule and keep one
vocabulary for layers and boundaries.

# Checks

- Identify each boundary crossed by the change and the contract at that boundary.
- Verify that new domain code has no framework, transport, persistence, or vendor imports.
- Verify that adapters depend on ports, not the reverse.
- Check that cross-boundary data is passed through explicit types, not ad-hoc maps or ORM rows.
- Look for accidental coupling: shared mutable state, framework annotations in domain models,
  or business logic inside controllers, migrations, or UI components.
- If the change needs a new boundary, name the port, the adapter, and the owner in the design.

# Evidence

- Discovery: record affected boundaries, ports, and constraints in `discovery/steering.md`.
- Assessment: cite the boundary decision in `assessment/steering.md` and any ADR.
- Code review: cite file and symbol evidence in `reviews/steering.md`.
- Logic review: confirm behaviour crosses boundaries only through the agreed contracts.

# Exceptions

A deliberate deviation needs an ADR that names the rule, the reason, the blast radius, and the
review date. An exception for one prompt does not become a precedent for the next prompt.

# Discovery questions

- Which boundary does this requirement touch?
- Is the required contract already represented as a port or public type?
- Does the requirement force a framework concern into the domain?
- Which existing adapter or consumer will need to change?
