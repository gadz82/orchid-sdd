# Patterns

[Back to README](../../README.md) · [Reference index](README.md)

orchid-sdd ships patterns as **steering presets**, not code generators. A preset
turns a project decision into reviewable rules, examples and evidence that the
agent must apply during discovery, planning, build and review.

Enable presets at setup or add them to `orchid-sdd.yml` later:

```bash
orchid-sdd setup --yes \
  --steering-preset architecture-hexagonal \
  --steering-preset repository-trunk-based
```

The shipped rules live under `.skill/steering/available-presets/`. See
[Steering](steering.md) for the rule format and how to override or map them to
phases.

## Architecture patterns

Choose at most one architecture preset. The core
`architecture-boundaries`, `solid-principles` and
`dependency-inversion-container` rules remain active; the preset adds the explicit
shape for the project.

| Preset | Use it when | What it makes explicit |
|---|---|---|
| `architecture-hexagonal` | The domain must be isolated from transport, persistence and external providers | Ports/adapters, inbound/outbound boundaries, composition root |
| `architecture-onion` | You want concentric layers with the domain at the centre | Dependency direction, application/domain split, infrastructure at the edge |
| `architecture-clean` | Use cases and entities must be independent of frameworks | Entities, use cases, interface adapters, frameworks/drivers |
| `architecture-ddd` | The business domain has meaningful bounded contexts and ubiquitous language | Aggregates, entities, value objects, domain services, context boundaries |
| `architecture-cqrs` | Reads and writes have different models or scaling needs | Command/query split, write model, read projections, consistency rules |
| `architecture-event-driven` | Components communicate through events or asynchronous flows | Event contracts, delivery semantics, idempotency, ordering, failure handling |

These are not mutually exclusive in every detail, but enabling contradictory
presets makes review evidence ambiguous. Pick the one that describes the actual
architecture; document deliberate deviations in an ADR.

### Related defaults

- `architecture-boundaries` — dependencies point inward; ports/adapters are explicit.
- `solid-principles` — pragmatic SRP/OCP/LSP/ISP/DIP checks.
- `dependency-inversion-container` — composition root and optional DI container.
- `saga-pattern` — distributed steps, compensation, idempotency and recovery.

## Repository flows

Choose at most one repository preset:

| Preset | Use it when | What it changes |
|---|---|---|
| `repository-trunk-based` | Short-lived branches, frequent integration, feature flags | Small batches, fast review, merge to trunk |
| `repository-gitflow` | Scheduled releases and maintained release branches | `main`/`develop`, release/hotfix flow |
| `repository-xp-mainline` | The team intentionally integrates continuously to mainline | Direct/short-lived integration, strong automated gates and matching release policy |

The core `repository-flow` rule defers to the active repository preset. Selecting
`repository-xp-mainline` changes the branch flow and requires matching
`execution`/release configuration plus an ADR, because it weakens the default
“no direct mainline during build” guard.

## Code-style patterns

Code-style presets are language/toolchain-specific. They complement the generic
`code-style` rule and may be combined when the project uses several languages.

| Preset | Typical checks |
|---|---|
| `code-style-typescript` | Type checking, lint/format, module boundaries |
| `code-style-go` | `gofmt`, `go vet`, lint, error handling conventions |
| `code-style-python` | Ruff/Black/isort/type checking and test layout |
| `code-style-php` | PHP-CS-Fixer/PHPStan and framework conventions |
| `code-style-rust` | `rustfmt`, Clippy, ownership/error conventions |
| `code-style-java` | Formatter, static analysis and build-tool conventions |
| `code-style-ruby` | RuboCop and test/style conventions |
| `code-style-sonarqube` | Sonar quality gate, duplication and coverage rules |

Enable only tools the project actually runs. A rule that cannot be enforced
should be advisory or omitted; otherwise reviewers will produce evidence nobody
can reproduce.

## Distributed workflow: saga

`saga-pattern` is a core architecture rule for distributed transactions. It
steers:

- explicit steps and compensations;
- idempotency keys and retry safety;
- ordering and timeout semantics;
- failure isolation and recovery;
- observability of long-running flows.

Use it when a business action spans services or asynchronous steps. It is
independent of the architecture preset; a modular monolith can still have sagas.

## Process patterns

`discovery-steering` and `logic-review-steering` are process rules:

- **Discovery**: turn constraints into requirements and acceptance evidence.
- **Logic review**: verify every active rule against integrated behaviour, not
  against a throwaway branch.

They are enabled by default and are the recommended place to add project-specific
evidence checks.

## Choosing a set

A practical default:

```yaml
steering:
  enabled:
    - architecture-boundaries
    - solid-principles
    - dependency-inversion-container
    - code-style
    - code-examples
    - repository-flow
    - saga-pattern
    - discovery-steering
    - logic-review-steering
```

Then add:

1. one architecture preset that matches the real system;
2. one repository preset that matches the release process;
3. the code-style presets for the languages the project actually enforces;
4. project rules for decisions that are unique to this codebase.

If two rules conflict, do not silently keep both. Record an ADR or override the
rule with a narrower project decision.

## Related reference

- [Steering](steering.md)
- [Configuration: steering](configuration.md#steering)
- [Customization: steering rules](customization.md#steering-rules)
- [Full design specification](../orchid-sdd-design.md)
