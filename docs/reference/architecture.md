# Architecture

[Back to README](../../README.md) · [Reference index](README.md)

orchid-sdd has one agent contract and one deterministic CLI. Harness support is
packaging, not a fork.

## Two layers

| Layer | Contains | Owner |
|---|---|---|
| **Skill package** | `SKILL.md`, `commands/`, `.skill/` defaults, `cli/` | Versioned with orchid-sdd; never contains project data |
| **Project workspace** | `orchid-sdd.yml`, `.orchid/`, `.knowledge/`, docblocks, code | Your repository/workspace |

`setup`/`migrate` provision the project workspace from the defaults; the skill
package is upgraded independently. Project overrides live under `.orchid/` and
never edit the skill package.

## Explicit-only invocation

The skill never auto-triggers. It runs only when the invocation carries:

- `/orchid-sdd` (OpenCode / standalone skill),
- `/orchid-sdd:run` (Claude Code plugin),
- an explicit `orchid-sdd <command>` CLI call.

The root `SKILL.md`, plugin command and installed skill all carry
`disable-model-invocation: true`. Hosts that cannot enforce this should be
configured to require explicit invocation.

## Actors

| Actor | Responsibilities |
|---|---|
| **Human** | Approve scope and gates, settle trade-offs, accept risk, final judge |
| **Agent / orchestrator** | Product/technical analysis, Gherkin, negotiation, planning, subagent delegation, adversarial CR, logic review, handover, Git coordination |
| **CLI** | Config validation, setup/migration scaffold, state + events, manifest/index projection, `record`/`recall`/`lint`, steering resolution, gate recording, workspace validation, iteration snapshots, wave worktrees/reconciliation |
| **Subagents** | One implementation prompt or one independent review each, in a fresh context |

The CLI **never invents semantic memory** and never edits application code.
During normal iterations, the agent never edits `.knowledge/**` or the manifest by
hand; it writes through `record`. Migration is the deliberate exception, where
legacy material is reorganised after backup.

### Agent updates

During task execution, the coding agent’s messages are for the user, not a
transcript. Keep them to the shortest useful update: one outcome line, at most
three material details, then one next action or question. Expand only when asked
or when a decision needs evidence.

The wording is shaped for the phase: intent gives goal and success measure;
discovery gives flow and exceptions; assessment gives recommendation and risk;
planning gives prompt order; build gives changes and verification; review gives
verdict and findings; close gives what shipped and what remains.

Use plain-language phase, gate and prompt labels, explain IDs when they appear,
and avoid raw paths, JSON, manifests, internal routing sources and exhaustive rule
lists. For example, say “intent approval gate (G1)” and “development prompt P-003
(token rotation)”, not bare `G1` or `P-003`. Details remain available on demand
through the inspect commands.

## State, events and projections

```text
action → event (append-only JSONL) → state.json
                                  → manifest.jsonld
                                  → core indexes
                                  → recall.json (cache, git-ignored)
```

- Events are the source of truth for audit.
- `state.json` is the current cursor: phase, gates, prompts, runs, waves.
- The manifest and core indexes are deterministic projections.
- `resume` replays events to rebuild state; handoffs are portable checkpoints.
- `recall.json` is generated and ignored; a missing cache is rebuilt on demand.

Every state mutation and event append takes an exclusive lease at
`.orchid/locks/state.lock`. The lease records owner, PID, host, purpose and
expiry. A live owner blocks with a diagnostic; a crashed owner or expired lease is
reclaimed. Nested calls in one CLI process reuse the lease reentrantly. The event
log therefore has a single writer, and parallel agents cannot race the manifest,
matrix or indexes.

## The loop

```text
setup → start → discover → assess → plan → build → review → close → handover
  G0      G1        G2        G3      G4      G5       G6       G7       G8
```

Each phase produces artifacts and a gate. The agent owns the substance; the CLI
records the decision. Human gates are explicit; “the command succeeded” is not
proof of approval. See [Phases and gates](phases.md).

## Memory loop

```text
agent → record → events/*.jsonl → manifest.jsonld + index/*.json
       └─ index/recall.json (generated, ignored) → recall → agent
code anchor → recall → docblock → ADR/spec/plan
```

Every memory node has a UUIDv7, a short description, topics, provenance and
optional relations. Significant code carries one
`ORCHID-MEM: <uuid> — <short behaviour>` anchor; the explanation and history live
in a UUID-named docblock. See [Memory model](memory.md).

## Prompts and review

The agent decomposes accepted decisions into prompt contracts:

- one reviewable outcome;
- dependencies and disjoint write scopes;
- tests and executable acceptance commands;
- personas, effort, optional `dependency_refs`;
- a type (`build`, `test`, `spike`).

Implementation and adversarial review run in separate agents. Code review is
independent; the PM logic review verifies behaviour against PRD/TRD/Gherkin and
the active steering rules. The CLI records state and validates contracts; it does
not spawn agents or judge semantics.

Model routing is declarative: each phase or prompt has an effort level
(`low`…`ultra`) mapped to an expected agent/model. `route` compares the expectation
with the current identity; `models.mismatch: block` makes `prompt start` refuse a
confirmed mismatch. The CLI never switches models automatically. Handoffs preserve
the active routing so `resume` can re-check it on another harness.

## Waves and isolation

A wave is an independently executable slice of the prompt DAG. `wave start`:

1. validates dependency readiness and disjoint write scopes;
2. freezes a base commit per repository;
3. creates one worktree and branch per prompt;
4. marks prompts `ready`.

`prompt start` enforces `execution.max_parallel`. `wave reconcile` merges the
committed branches in wave order, optionally runs tests, removes worktrees and
branches, and records the result. Already merged prompts are skipped on retry.
Spikes use `spike/P-###` and are discarded, never merged. See
[Phases and gates](phases.md#g5-build-and-code-review) and
[Configuration: execution](configuration.md#execution).

## Workspaces

Workspace mode keeps one root-owned knowledge base and audit trail over nested Git
repositories. The root config registers repos; each repo gets an `extends`
fragment for tests, personas and constitution. The CLI validates fragments but
does not merge them into the root config. See [Workspace mode](workspace.md).

## Related reference

- [Phases and gates](phases.md)
- [Memory model](memory.md)
- [Configuration](configuration.md)
- [Full design specification](../orchid-sdd-design.md)
