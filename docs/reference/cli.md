# CLI reference

[Back to README](../../README.md) · [Reference index](README.md)

Run `orchid-sdd <command>` from the project root, or add `--root DIR` to target
another project. Inspection commands accept `--json`; `orchid-sdd --help` is the
authoritative surface.

```bash
orchid-sdd --root /path/to/project status
orchid-sdd --root /path/to/project doctor --ci
```

When the agent has only a checkout or an installed skill, replace `orchid-sdd`
with `node <path>/bin/orchid-sdd.mjs`.

## Choose your path

| If you are… | Start with |
|---|---|
| Installing for the first time | [Installation](installation.md), then `setup` |
| Setting up a single repository | `orchid-sdd setup` |
| Setting up a multi-repo workspace | `orchid-sdd setup --workspace --profile monorepo` |
| Converting an existing project with `.knowledge`/ADRs | `orchid-sdd migrate scan`, then `migrate init` |
| Returning after a break | `orchid-sdd status`; use `resume` if state is inconsistent |

## Setup and health

| Operation | Command | Use case |
|---|---|---|
| Guided setup | `orchid-sdd setup` | First install; asks profile, paths, personas, steering, routing |
| Automated setup | `orchid-sdd setup --profile backend --yes` | Bootstrap or CI without prompts |
| Agent-friendly setup | `orchid-sdd setup --yes --profile backend --project acme --json` | Explicit answers plus a machine-readable result |
| Choose steering presets | `orchid-sdd setup --yes --steering-preset architecture-hexagonal --steering-preset repository-trunk-based` | Select architecture and repository presets |
| Disable steering | `orchid-sdd setup --yes --no-steering` | Start without steering rules |
| Name the project | `orchid-sdd setup --project acme --yes` | Avoid a directory-derived name |
| Workspace setup | `orchid-sdd setup --workspace --profile monorepo` | Root contains nested Git repos |
| Force single-repo mode | `orchid-sdd setup --single ...` | Ignore nested repos at the root |
| Custom paths | `orchid-sdd setup --knowledge-folder knowledge --docblocks-folder docs/blocks ... --yes` | Keep artifacts outside defaults |
| Add/override personas | `orchid-sdd setup --persona UX --persona-file QA.md --yes` | Enable a catalog persona or add a project one |
| Inspect steering | `orchid-sdd steering list [--phase P]` | See effective rules, authority and source |
| Apply phase steering | `orchid-sdd steering context --phase discovery` | Emit the rules the agent must apply and cite |
| Preview writes | `orchid-sdd setup --dry-run` | See every file before writing |
| Reconfigure | `orchid-sdd setup --force ...` | Overwrite config and reset state; back up first |
| Claude Code plugin (local) | `claude --plugin-dir .` | Load this repository as a plugin; invoke `/orchid-sdd:run` |
| Claude Code plugin (marketplace) | `claude plugin marketplace add gadz82/orchid-sdd` then `claude plugin install orchid-sdd@orchid-sdd` | Install a published copy |
| Install agent skill | `orchid-sdd skill install --agent opencode` | Copy a self-contained skill + CLI into the agent directory |
| Validate Claude plugin | `claude plugin validate .` | Check manifest and components |
| Preflight | `orchid-sdd doctor` | Validate config, paths, personas, steering, sources |
| Offline CI check | `orchid-sdd doctor --ci` | CI without network or credentials |
| Online source probe | `orchid-sdd doctor --online` | Check Git sources; MCP is validated but not probed |
| Repair infrastructure | `orchid-sdd doctor --fix` | Create missing dirs, manifest and context |
| Strict validation | `orchid-sdd doctor --strict` | Treat warnings as errors |
| Inspect overrides | `orchid-sdd diff [--content]` | Compare project edits with skill defaults |

## Iteration

| Operation | Command | Use case |
|---|---|---|
| See where you are | `orchid-sdd status [--json]` | Phase, gates, memory, steering, workspace repos, next action |
| Start a feature | `orchid-sdd start "Add passkey login to the customer portal"` | Create the iteration and artifact tree |
| Technical-only change | `orchid-sdd start "Rotate the CI signing key" --technical-only` | No fictional product story |
| Tune rigor | `orchid-sdd start "..." --rigor S\|M\|L` | Collapse or expand the process |
| Skip clean-tree guard | `orchid-sdd start "..." --allow-dirty` | Deliberate migration/pilot work only |
| Record a gate | `orchid-sdd gate pass G1 --evidence intent/prd.md` | Record approval/evidence; the agent usually runs it after the human approves |
| Record a blocker | `orchid-sdd gate fail G2 --note "missing Gherkin"` | Stop the phase with a reason |
| Gate overview | `orchid-sdd gate status` | Show all gate states |
| Advance to discovery | `orchid-sdd discover` | Requires G1; reports active steering and the phase artifact |
| Advance to assessment | `orchid-sdd assess` | Requires G2 and Gherkin |
| Advance to planning | `orchid-sdd plan` | Requires G3 |
| Advance to build | `orchid-sdd build` | Requires G4; the agent runs prompts |
| Prepare a parallel wave | `orchid-sdd wave start W4` | Create one worktree per ready prompt; no prompt runs yet |
| Inspect a wave | `orchid-sdd wave status [W4]` | Show ready/running/done prompts and worktrees |
| Reconcile a wave | `orchid-sdd wave reconcile W4 [--test]` | Merge done branches, verify, clean worktrees |
| Abort a wave | `orchid-sdd wave abort W4` | Remove its worktrees/branches and mark failures |
| Advance to logic review | `orchid-sdd review` | Requires G5 and prompts done/waived; reports steering |
| Close | `orchid-sdd close --approve` | Archive transients, freeze snapshot, record repo HEADs |
| Handover review | `orchid-sdd handover` | Verify the tutorial before approval |
| Accept handover | `orchid-sdd handover --approve` | Mark the iteration complete |
| Abandon | `orchid-sdd abandon "descoped for this quarter"` | Archive without a release |
| Recover state | `orchid-sdd resume` | Replay events and accept the latest handoff |

## Waves

Waves are the parallel execution unit. A wave is an independently executable
slice of the prompt DAG.

```bash
# Prepare worktrees and mark prompts ready
orchid-sdd wave start 1

# Start up to execution.max_parallel prompts
orchid-sdd prompt start P-001 --step implement
orchid-sdd prompt start P-002 --step implement

# Complete each prompt after tests and CR
orchid-sdd prompt complete P-001 --note "tests and CR passed"
orchid-sdd prompt complete P-002 --note "tests and CR passed"

# Merge, test and clean up
orchid-sdd wave reconcile 1 --test
```

`wave start` validates dependencies and disjoint write scopes, freezes one base
commit per affected repository, creates one worktree and branch per prompt, and
marks the prompts `ready`. It does not launch agents.

`wave reconcile` merges committed prompt branches in wave order, optionally runs
the effective unit test command, removes worktrees and branches, and records the
result. A merge conflict or failed test leaves the wave failed; fix the branch or
test and rerun the same command. Already merged prompts are not merged again.

`wave abort` removes the remaining worktrees and branches and marks the wave
failed. It does not rewrite commits that a partial reconcile already merged.

Spike prompts use `spike/P-###`; reconciliation copies their findings under
`assessment/spikes/` and discards the branch instead of merging it.

See [Phases and gates](phases.md) for the build flow and
[Configuration](configuration.md#execution) for `max_parallel` and isolation.

## Memory

| Operation | Command | Use case |
|---|---|---|
| Record a requirement | `orchid-sdd record --type Requirement --alias R-001 --description "..." --topics auth,passkeys,login --artifact intent/prd.md` | Seed traceable intent |
| Record a decision | `orchid-sdd record --type Decision --alias ADR-001 --description "..." --topics auth,rollout --artifact assessment/adr/ADR-001.md` | Preserve why a choice was made |
| Record a code unit | `orchid-sdd record --type CodeUnit --id <uuid> --description "..." --topics auth,code --code src/auth.ts#login --artifact docs/knowledge/docblocks/<uuid>.md` | Link code to its reasoning |
| Baseline memory | `orchid-sdd record --scope project --repo <id> ...` | Facts that survive iterations |
| Link nodes | `orchid-sdd record ... --relation implements:urn:uuid:...` | Build the graph explicitly |
| Find context | `orchid-sdd recall auth` | Resolve a topic, question, path, alias or UUID |
| Recall a dependency | `orchid-sdd recall DEP-001` | Resolve a ledger row and its related ADR/test nodes |
| Filter by repo | `orchid-sdd recall auth --repo orchid` | Workspace-scoped retrieval |
| Follow a dependency chain | `orchid-sdd recall DEP-001 --hops 2` | CR-time two-hop expansion |
| Cap results | `orchid-sdd recall auth --limit 10` | Bound matches and dependency rows (1–100, default 20) |
| Compact context pack | `orchid-sdd recall auth --summary --budget 1200` | One-line summaries, trimmed to a byte budget |
| Full node | `orchid-sdd recall <id> --full` | Hydrate the complete node |
| Search history | `orchid-sdd recall auth --history all` | `recent` (default, last 3) / `all` / `none` |
| Rebuild indexes | `orchid-sdd index` | After recording/editing artifacts |
| Verify indexes | `orchid-sdd index --check` | CI drift check |
| Validate anchors/docs | `orchid-sdd lint` | Anchors, descriptions, docblock History, comment limit |
| Lint for CI | `orchid-sdd lint --check` | Fail the build on drift |
| Mint an ID | `orchid-sdd new-uuid` | Anchor and docblock identity |

`record` flags: `--type`, `--description`, `--topics`, `--questions`, `--artifact`,
`--code`, `--alias`, `--relation`, `--scope`, `--repo`, `--status`, `--actor`,
`--iteration`, `--id`, `--json`.

See [Memory model](memory.md) for node types, docblocks and the recall index.

## Personas

| Operation | Command | Use case |
|---|---|---|
| List effective personas | `orchid-sdd persona list` | See IDs, authority, enabled state and source |
| Inspect one persona | `orchid-sdd persona show DBA` | Read mission, phases, aliases and instructions |
| Machine-readable | `orchid-sdd persona list --json` | Automation or dashboards |
| Add/override in setup | `orchid-sdd setup --persona UX --persona-file QA.md` | Enable catalog or project persona |
| Project override | `.orchid/personas/<ID>.md` | Durable role customisation |

See [Personas](personas.md).

## Steering

| Operation | Command | Use case |
|---|---|---|
| List rules | `orchid-sdd steering list` | Show architecture, style, example, repository and process rules |
| Filter by phase | `orchid-sdd steering list --phase logic_review` | See only the rules active in a phase |
| Inspect one rule | `orchid-sdd steering show architecture-boundaries` | Read the rule body, authority, phases and examples |
| Include examples | `orchid-sdd steering show architecture-boundaries --examples` | Print referenced snippets |
| Phase context | `orchid-sdd steering context --phase discovery` | Give the agent the active rule pack and evidence artifact |
| Machine-readable | `orchid-sdd steering list --json` | Automation or dashboards |

See [Steering](steering.md) and [Patterns](patterns.md).

## Model routing

| Operation | Command | Use case |
|---|---|---|
| Resolve a phase | `orchid-sdd route --phase assessment` | Show expected effort, agent and model |
| Resolve a prompt | `orchid-sdd route --phase build --prompt P-001` | Apply a prompt-level effort override |
| Check the runtime | `orchid-sdd route --phase assessment --current-agent opencode --current-model openai/gpt-4.1` | Compare expected and current identity |
| Machine-readable | `orchid-sdd route --phase assessment --json` | Automation or harness adapters |

Routing is task-size-aware. `effort` (`low`, `medium`, `high`, `extra-high`,
`ultra`) is mapped to an expected agent/model in `models.efforts`; phase defaults
come from `models.phases`, and individual prompts can override them in
`models.prompts` or in the prompt contract.

```bash
orchid-sdd route --phase build --prompt P-003
orchid-sdd route --phase build --prompt P-003 \
  --current-agent claude-code \
  --current-model anthropic/claude-opus-4
```

The route command never switches models or agents. It reports `match`, `mismatch`,
`unknown` or `unassigned`; the agent must relay a non-match to the user. With
`models.mismatch: block`, `prompt start` refuses a confirmed mismatch. Handoffs
preserve the active prompt, run, step and routing, so `resume` on a new harness
can compare the expected identity with the one actually running.

See [Models and efforts](configuration.md#models-and-efforts) and
[Prompt execution and handoff](#prompt-execution-and-handoff).

## Prompt execution and handoff

| Operation | Command | Use case |
|---|---|---|
| Start a development prompt | `orchid-sdd prompt start P-001 --step implement` | Record the active run and its first step |
| Advance a step | `orchid-sdd prompt step P-001 --step tests` | Record a safe internal step |
| Complete a prompt | `orchid-sdd prompt complete P-001 --note "..."` | Mark the prompt and its run done |
| Fail or waive | `orchid-sdd prompt fail P-001 --note "..."` / `prompt waive P-001` | Record the terminal state |
| Inspect state | `orchid-sdd prompt list --json` / `prompt show P-001` | Reconstruct the current run |
| Validate prompt contracts | `orchid-sdd prompt validate [--json]` | Check fields, `depends_on` and `dependency_refs` |
| Save a handoff | `orchid-sdd handoff prepare --reason "switch model"` | Write a portable checkpoint |
| Inspect handoffs | `orchid-sdd handoff list --json` | Find a saved checkpoint |
| Resume normally | `orchid-sdd resume` | Rebuild state and automatically accept the latest handoff |
| Accept explicitly | `orchid-sdd handoff accept <id> --current-agent ...` | Record that a new harness resumed a specific checkpoint |

Prompt events are append-only and `resume` rebuilds prompt/run state from them.
By default, `resume` also finds and accepts the latest handoff for the active
iteration. Use `--handoff <id>` to pick one or `--no-handoff` to restore state
only. Handoff is separate from the final human `handover`: it preserves the active
prompt, run, step, routing, workspace state and last event for another harness.

## Workspace (multi-repo)

| Operation | Command | Use case |
|---|---|---|
| Enable workspace mode | `orchid-sdd setup --workspace --profile monorepo` | Root contains nested Git repos |
| Stay single-repo | `orchid-sdd setup --single ...` | Ignore nested repos deliberately |
| See repo state | `orchid-sdd status` | Branch, HEAD and dirty count per repo |
| Customise a repo | edit `<repo>/orchid-sdd.yml` (`extends` only) | Per-repo tests, personas, constitution |
| Validate workspace | `orchid-sdd doctor` | Paths, git presence, fragments, personas |
| Baseline memory | `orchid-sdd record --scope project --repo <id> ...` | Cross-iteration repo knowledge |
| Clean-tree guard | `orchid-sdd start "..."` / `--allow-dirty` | Refuse mixed work; override deliberately |
| Freeze Git state | `orchid-sdd close --approve` | Snapshot each repo's HEAD |
| Track cross-repo dependencies | edit `.orchid/cross-repo-dependencies.md` | Reusable ledger for CR, planning and logic review |
| List/filter dependencies | `orchid-sdd dependencies list [--repo ID] [--status S] [--kind K] [--json]` | Discover open or per-repo edges |
| Validate the ledger | `orchid-sdd dependencies check [--json]` | Fail on missing columns, bad status, unknown repos |
| Nested setup | *(refused)* | Run setup at the workspace root |

See [Workspace mode](workspace.md).

## Migration

| Operation | Command | Use case |
|---|---|---|
| Scan | `orchid-sdd migrate scan [--json] [--output PATH]` | Read-only topology, knowledge and Git report |
| Backup | `orchid-sdd migrate backup` | Copy legacy assets to `.orchid-migration-bck/<timestamp>/` |
| Scaffold | `orchid-sdd migrate init [--profile P] [--single] [--dry-run]` | Backup + root config + repo overrides + plan |
| Preview | `orchid-sdd migrate init --dry-run` | See the backup/scaffold plan; writes nothing |
| Status | `orchid-sdd migrate status [--json]` | Stage, backup path, repos |
| Finalize | `orchid-sdd migrate finalize` | Validate manifest, write report, `phase: ready` |
| Force overwrite | `orchid-sdd migrate init --force` | Existing config; backup happens first |
| Skip backup | `--skip-backup` | Discouraged; only with an external backup |

See [Migration](migration.md).

## Inspect and recover

| Operation | Command | Use case |
|---|---|---|
| Help | `orchid-sdd --help` | Full command surface |
| Version | `orchid-sdd --version` | Check CLI compatibility |
| Next action | `orchid-sdd status` | Read phase, gates, blockers and next step |
| Override diff | `orchid-sdd diff [--content]` | Compare project files with skill defaults |
| Resume | `orchid-sdd resume` | Replay events and accept the latest handoff |
| Repair | `orchid-sdd doctor --fix` | Missing dirs, manifest and context |
| Migration stage | `orchid-sdd migrate status` | Resume an interrupted migration |
| Deliberate override | `--force` / `--allow-dirty` | Bypass a check deliberately; document why |

## Typical flows

**First feature in a single repo**

```bash
orchid-sdd setup --profile backend --yes
orchid-sdd doctor
orchid-sdd start "Add passkey login to the customer portal"
orchid-sdd gate pass G1 --evidence intent/prd.md
orchid-sdd discover
# ... assess, plan, build, review ...
orchid-sdd close --approve
# Agent: "Do you want to start the technical handover?"
orchid-sdd handover --approve
```

**Multi-repo workspace**

```bash
orchid-sdd setup --workspace --profile monorepo
orchid-sdd status
orchid-sdd start "Add a health endpoint to orchid-api"   # commit/stash first
```

**Legacy project or workspace**

```bash
orchid-sdd migrate scan --json
orchid-sdd migrate init --profile monorepo
# execute .orchid/migration/PLAN.md and prompts with the agent
orchid-sdd index && orchid-sdd lint && orchid-sdd doctor
orchid-sdd migrate finalize
orchid-sdd start "<first real feature>"
```

**Recovery**

```bash
orchid-sdd status
orchid-sdd resume
orchid-sdd doctor --fix
orchid-sdd index --check
orchid-sdd migrate status
```

## Related reference

- [Installation and agent setup](installation.md)
- [Phases and gates](phases.md)
- [Configuration](configuration.md)
- [Memory model](memory.md)
- [Workspace mode](workspace.md)
