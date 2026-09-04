# Steering rules

Steering rules are selectable, phase-aware contracts for **how** a project wants work shaped.
They complement the constitution:

- the constitution is the baseline for how code is written;
- a steering rule is an explicit project decision that can be enabled, disabled, and mapped to
  phases such as Discovery and Logic Review.

Each rule is a Markdown file with YAML front matter. The front matter is the machine contract;
the body is the human contract.

```md
---
id: my-rule
title: My rule
summary: One sentence a reviewer can cite.
kind: architecture # architecture | code_style | example | repository | process | custom
authority: blocking # advisory | blocking
phases: [discovery, logic_review]
tags: [architecture, boundaries]
examples:
  - path: examples/typescript/my-rule.ts
    title: "Approved shape"
    language: typescript
---
# Rule
...
# Checks
...
# Evidence
...
```

Rules are resolved by ID from `.skill/steering/` (defaults), then project search paths such as
`.orchid/steering/` and `domains/*/steering/`. A project file with the same `id` overrides the
default; `extends` is optional. Enable a rule in `steering.enabled` and assign it to a phase in
`steering.phases`.

```bash
orchid-sdd steering list
orchid-sdd steering list --phase discovery
orchid-sdd steering show architecture-boundaries
orchid-sdd steering context --phase logic_review
```

The shipped `presets/` are optional. Enable only the architecture, style-tool, and repository
patterns the project has actually chosen; enabling several competing presets creates
contradictory steering.
