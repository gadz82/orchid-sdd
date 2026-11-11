# orchid-sdd reference

This directory contains the detailed operator and configuration reference. The
project README is the short introduction and entry point.

| Document | What it covers |
|---|---|
| [Installation and agent setup](installation.md) | Requirements, npm/checkout/plugin installs, OpenCode, Claude Code, Codex and generic agents, quick start |
| [CLI reference](cli.md) | Every command family, common options, typical flows and recovery commands |
| [Phases and gates](phases.md) | The lifecycle from intent to handover, gate ownership, artifacts and approvals |
| [Memory model](memory.md) | Events, manifest, indexes, `record`, `recall`, anchors, docblocks and lint |
| [Personas](personas.md) | Default cast, optional roles, custom personas, authority and phase mapping |
| [Steering](steering.md) | Constitution vs steering, rule format, core rules, phase context and overrides |
| [Patterns](patterns.md) | Architecture, repository and language presets shipped as steering rules |
| [Configuration](configuration.md) | Complete `orchid-sdd.yml` reference, model/effort routing and resolution order |
| [Customization](customization.md) | Personas, steering, constitution, templates, workspace overrides and how to add a phase |
| [Workspace mode](workspace.md) | Root-owned multi-repo execution and cross-repo dependency tracking |
| [Migration](migration.md) | Converting an existing project or workspace without losing its history |
| [Operations](operations.md) | Repository layout, tests, benchmark, CI checks and known limits |
| [Architecture](architecture.md) | How the skill, CLI, state, agents and subagents fit together |
| [Design document](../orchid-sdd-design.md) | Full behavioural specification and decision log |

The agent-facing contract is [`SKILL.md`](../../SKILL.md). If the CLI and a
document disagree, `orchid-sdd --help` and the CLI source are authoritative.
