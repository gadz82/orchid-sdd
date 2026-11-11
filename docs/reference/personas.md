# Personas

[Back to README](../../README.md) · [Reference index](README.md)

Personas are explicit roles with a mission, phase assignments and decision
rights. They prevent the orchestrator from collapsing product, engineering, test,
security and operational judgement into one voice.

A persona is not a separate agent by itself. It is a contract the orchestrator
loads into an agent or subagent when that role acts.

## Default cast

| Persona | Role | Default authority | Detailed dossier |
|---|---|---|---|
| **PM / PO** | Product meaning, scope, acceptance and priority | Blocking on business meaning | [`PM.md`](../personas/PM.md) |
| **DEV** | Implementation, design and technical trade-offs | Advisory | [`DEV.md`](../personas/DEV.md) |
| **QE** | Test strategy, failure modes and evidence | Blocking on test gaps | [`QE.md`](../personas/QE.md) |

`PM` is the unified product/PO role; `PO` resolves as its alias.

## Optional catalog

| Persona | Role | Default authority | Detailed dossier |
|---|---|---|---|
| **TECH_LEAD** | Feasibility, architecture and delivery risk | Blocking on feasibility | [`TECH_LEAD.md`](../personas/TECH_LEAD.md) |
| **ARCHITECT** | Boundaries, contracts and long-term structure | Advisory | [`ARCHITECT.md`](../personas/ARCHITECT.md) |
| **DBA** | Data model, migrations, performance and integrity | Blocking on data changes | [`DBA.md`](../personas/DBA.md) |
| **DEVOPS** | Runtime, deployment, observability and operations | Blocking on infrastructure | [`DEVOPS.md`](../personas/DEVOPS.md) |
| **SECURITY** | Threats, authz, secrets and high-risk findings | Blocking on high findings | [`SECURITY.md`](../personas/SECURITY.md) |
| **UX** | Flows, accessibility, copy and usability | Advisory | [`UX.md`](../personas/UX.md) |

The dossiers contain ownership boundaries, phase behaviour, decision rights,
required inputs/outputs, review rubrics, anti-patterns, handoffs and example
findings. They are reference material, not additional gate authority.

## How personas are selected

- `personas.enabled` is the project cast. A disabled persona cannot be assigned to
  a phase or a review.
- `personas.overrides.<ID>` can change `authority`, `phases` or load a specific
  file.
- Phase casts are configured under `phases.<phase>.personas`.
- A prompt can list the personas that should participate in its work.
- Review routing can map path globs to reviewer personas.
- In workspace mode, a repository can add personas in its own fragment.

Resolution order:

```text
inline overrides → project files → personas.search_paths → skill defaults
```

Project persona files are merged by ID over the skill defaults. `aliases` and
`extends` resolve through the same map.

## Inspect personas

```bash
orchid-sdd persona list
orchid-sdd persona show DBA
orchid-sdd persona list --json
```

`persona list` shows the effective ID, authority, phases, enabled state and
source. `persona show` prints the mission, phase behaviour, aliases and operating
instructions.

## Add a custom persona

Create `.orchid/personas/QA.md`:

```md
---
id: QA
name: Quality Advocate
mission: Challenge vague acceptance criteria and weak test evidence.
phases: [assessment, code_review]
authority: blocking
tags: [quality, testing]
aliases: []
---
# Operating instructions
- Require a failing test before a bug fix.
- Challenge assertions that cannot fail.
```

Enable it in `orchid-sdd.yml`:

```yaml
personas:
  enabled: [PM, DEV, QE, QA]
```

Then validate:

```bash
orchid-sdd doctor
orchid-sdd persona list
```

The file can also be loaded explicitly:

```yaml
personas:
  overrides:
    DEV:
      file: .orchid/personas/custom-dev.md
      authority: blocking
```

## Override an existing persona

Create a project file with the same `id`:

```md
---
id: DEV
name: DEV
mission: Deliver small, tested, reversible changes.
phases: [assessment, build, code_review]
authority: blocking
---
# Operating instructions
- Prefer the simplest design that passes the acceptance command.
- Escalate a scope change instead of hiding it in the implementation.
```

If the ID is already enabled, no config change is needed. `orchid-sdd diff`
shows how the override differs from the skill default.

## Add a persona to one repo

1. create the persona file;
2. add the ID to the root `personas.enabled`;
3. list it in `workspace.repos[].personas` for the repo where it should act.

The root remains authoritative for paths, knowledge and audit.

## Related reference

- [Configuration: personas](configuration.md#personas)
- [Customization: personas](customization.md#custom-personas)
- [Persona dossier index](../personas/README.md)
- [Full design specification](../orchid-sdd-design.md)
