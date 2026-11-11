# Steering

[Back to README](../../README.md) · [Reference index](README.md)

The **constitution** defines how code is written everywhere. **Steering** is the
selectable, phase-aware layer for explicit project decisions: architecture
boundaries, examples, code style, repository flow and process checks.

Steering rules are contracts. They can be enabled, assigned to phases, cited as
evidence and overridden per project. They are not hidden prompt text.

## Constitution vs steering

| Layer | Scope | Typical content |
|---|---|---|
| Constitution | Always applies | Engineering principles, quality bars, project rules |
| Steering | Selected by phase | Architecture boundaries, code examples, style, repository flow |
| Persona | Selected by role | Mission, decision rights, review focus |

A deviation from the constitution normally requires an ADR. A blocking steering
rule must be followed or explicitly waived with an owner and expiry.

## Rule format

Each rule is a Markdown file with YAML front matter:

```md
---
id: project-api-boundaries
title: API boundaries
summary: HTTP handlers do not contain domain rules.
kind: architecture
authority: blocking
phases: [discovery, assessment, logic_review]
tags: [architecture, api]
examples:
  - path: examples/typescript/handler.ts
    title: "Thin handler"
    language: typescript
---
# Rule
HTTP handlers translate transport concerns and call an application service.
Domain rules live in the domain/application layer.

# Checks
- A handler contains no business branching.
- Input validation is explicit.
- Errors cross the boundary as typed results.

# Evidence
- The PRD/TRD boundary section.
- The reviewed handler and its tests.
```

Kinds: `architecture`, `code_style`, `example`, `repository`, `process`,
`custom`. Authority: `advisory` or `blocking`. The sections `Rule`, `Checks`,
`Evidence` and `Exceptions` are the recommended shape.

Examples are paths relative to the rule file. A project file with the same `id`
overrides a skill default. `extends` is optional. The generated
`.orchid/steering/README.md` is a starter.

## Core defaults

The nine core rules are enabled by default:

| Rule | Kind | Default phases | What it steers |
|---|---|---|---|
| `architecture-boundaries` | architecture | discovery → logic review | Inward dependencies and explicit ports/adapters |
| `solid-principles` | architecture | discovery → logic review | SRP, OCP, LSP, ISP and DIP applied pragmatically |
| `dependency-inversion-container` | architecture | discovery → logic review | Explicit composition roots and optional DI containers |
| `code-style` | code_style | discovery, assessment, build, code review, logic review | Linter, formatter, type checker and static analysis |
| `code-examples` | example | discovery → logic review | Small, current snippets; project examples become binding after migration approval |
| `repository-flow` | repository | discovery → logic review | Branch, review, merge and release flow |
| `saga-pattern` | architecture | discovery → logic review | Distributed steps, compensation, idempotency and recovery |
| `discovery-steering` | process | discovery | Turns constraints into requirements and acceptance evidence |
| `logic-review-steering` | process | logic review | Verifies every active rule against integrated behaviour |

The shipped examples cover TypeScript, Go, Python, PHP, Rust, Java and Ruby under
`.skill/steering/examples/`.

## Optional presets

Optional rules live in `.skill/steering/available-presets/`. See
[Patterns](patterns.md) for what each one means and when to select it.

- **Architecture:** `architecture-hexagonal`, `architecture-onion`,
  `architecture-clean`, `architecture-ddd`, `architecture-cqrs`,
  `architecture-event-driven`
- **Repository:** `repository-trunk-based`, `repository-gitflow`,
  `repository-xp-mainline`
- **Code style:** `code-style-typescript`, `code-style-go`, `code-style-python`,
  `code-style-php`, `code-style-rust`, `code-style-java`, `code-style-ruby`,
  `code-style-sonarqube`
- **Process:** `discovery-steering`, `logic-review-steering`

Enable at most one architecture preset and one repository preset. Code-style
presets may be combined when the project uses several languages; enable only the
tools the project actually enforces.

```bash
orchid-sdd setup --yes \
  --steering-preset architecture-hexagonal \
  --steering-preset repository-trunk-based
```

The core `repository-flow` rule defers to an active repository preset. Choosing
`repository-xp-mainline` changes the branch flow and requires matching
`execution`/release configuration plus an ADR.

## Phase mapping

`steering.phases.<phase>` is an ordered list of active rule IDs:

```yaml
steering:
  phases:
    discovery:
      - architecture-boundaries
      - solid-principles
      - dependency-inversion-container
      - code-style
      - code-examples
      - repository-flow
      - saga-pattern
      - discovery-steering
    logic_review:
      - architecture-boundaries
      - solid-principles
      - dependency-inversion-container
      - code-style
      - code-examples
      - repository-flow
      - saga-pattern
      - logic-review-steering
```

A rule may declare default `phases`, but the phase mapping is authoritative.

```bash
orchid-sdd steering list
orchid-sdd steering list --phase logic_review
orchid-sdd steering show architecture-boundaries --examples
orchid-sdd steering context --phase discovery
```

`steering context --phase P` returns the ordered rules, source files, example paths
and the artifact path where the agent records evidence. The gate event records
the rule IDs that were active.

## Suggested discovery rules

Add these to the project or use the shipped `discovery-steering` rule:

- **boundary fit** — which ports/contracts are touched;
- **repository fit** — branch, release and environment impact;
- **style evidence** — which gates will prove compliance;
- **example fit** — the closest approved snippet;
- **conflict check** — requirements that contradict a blocking rule.

Record the result in `discovery/steering.md`; G2 can cite that file.

## Suggested logic-review rules

Use `logic-review-steering`:

- rule coverage — every active blocking rule has a verdict;
- evidence freshness — evidence comes from the integrated target, not a throwaway
  prompt branch;
- scope integrity — no deleted tests or hidden suppressions;
- exception integrity — waivers name an owner and expiry;
- behavioural fit — delivered behaviour still matches the requirement.

Record the result in `reviews/steering-review.md`; G6 can cite that file.

## Overrides

Override a rule by creating a project file with the same `id`:

```md
---
id: architecture-boundaries
title: Architecture boundaries
authority: blocking
phases: [discovery, assessment, build, code_review, logic_review]
---
# Rule
...
```

And/or override metadata in `orchid-sdd.yml`:

```yaml
steering:
  enabled: [architecture-boundaries, solid-principles, code-examples]
  overrides:
    architecture-boundaries:
      authority: blocking
      phases: [discovery, assessment, build, logic_review]
    code-examples:
      file: .orchid/steering/code-examples.md
  phases:
    discovery: [architecture-boundaries, code-examples]
    logic_review: [architecture-boundaries, code-examples]
```

Rules are resolved by ID:

```text
inline overrides → project files → search_paths → skill defaults
```

Run `orchid-sdd doctor` after editing. It rejects unknown, disabled or duplicate
references, and validates example paths.

## Migration and code examples

During migration the agent proposes project-specific examples for every
significant language, waits for explicit approval, then writes them under
`.orchid/steering/examples/` and creates a blocking
`.orchid/steering/code-examples.md` override.

Build and code review must follow those examples. A deviation requires an ADR.
The proposal is recorded in `.orchid/migration/CODE-EXAMPLES-PROPOSAL.md`; a
refusal leaves the default rule unchanged.

## Related reference

- [Patterns](patterns.md)
- [Configuration: steering](configuration.md#steering)
- [Customization: steering](customization.md#steering-rules)
- [Full design specification](../orchid-sdd-design.md)
