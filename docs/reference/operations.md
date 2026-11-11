# Operations

[Back to README](../../README.md) · [Reference index](README.md)

## Repository layout

```text
bin/orchid-sdd.mjs       portable entry
bin/orchid-sdd           bare-name wrapper for Claude Code's plugin PATH
cli/                     zero-dependency implementation
  config.mjs             defaults, validation, rendering, detection
  registry.mjs           profiles, personas, aliases, routing
  models.mjs             model/effort routing and identity checks
  prompts.mjs            prompt/run/step execution state
  handoff.mjs            portable execution checkpoints
  lock.mjs               mandatory state lease
  waves.mjs              wave scheduler, worktrees, reconciliation
  steering.mjs           steering resolution, validation, list/show/context
  store.mjs              state, events, projection, indexes, snapshots
  setup.mjs              setup wizard outputs
  workspace.mjs          nested-repo detection, per-repo config, Git state
  migration.mjs          scan, backup, scaffold, finalize
  persona.mjs            persona list/show
  doctor.mjs             preflight
  memory.mjs             record, index, recall, lint
  phases.mjs             start, gates, phases, close, abandon, handover, resume
  cli.mjs                dispatch
.claude-plugin/          Claude Code plugin manifest and marketplace
claude-commands/run.md   Claude Code explicit `/orchid-sdd:run` entry
claude-skills/orchid-sdd/ Claude Code skill pointer to canonical SKILL.md
commands/orchid-sdd.md   OpenCode adapter (`/orchid-sdd`)
skills.sh.json           Vercel skills ecosystem repository page config
.skill/
  constitution/          default source of truth for how code is written
  personas/              PM, DEV, QE + optional catalog
  steering/              default-presets, available-presets, examples
  templates/profiles/    backend, frontend, infra, monorepo, custom
  templates/artifacts/   PRD, TRD, Gherkin, questionnaire, ADR, prompt, CR, handover
  schemas/               config, state, event, manifest, prompt, report, steering
SKILL.md                 portable explicit-only agent contract
docs/orchid-sdd-design.md
docs/personas/           detailed persona reference dossiers
docs/reference/          this reference manual
tests/                    node:test integration tests
```

## CI checks

```bash
orchid-sdd doctor --ci
orchid-sdd index --check
orchid-sdd lint --check
npm test
```

`doctor --ci` avoids network access. `doctor --online` additionally probes Git
sources; MCP sources are validated but not probed.

`index --check` verifies that the manifest and versioned indexes match the event
log. `lint --check` verifies anchors, descriptions, docblock `History` and inline
comment limits.

## Tests

```bash
npm test
```

The suite exercises setup, doctor, config validation, the memory loop, lint,
gates, the full lifecycle, abandon, history recall, resume, workspace detection,
project-scoped memory, clean-tree guards, migration backup/scaffold/finalize, the
Claude Code plugin manifest, skill installation, persona dossier consistency,
steering setup/resolution, phase context, model effort resolution and mismatch
alerts, prompt/run state, handoff checkpoints, project rule overrides, npm skill
installation, every profile’s personas/tests/constitution pack, the recall index
and its history modes, deterministic alias resolution, parallel waves, worktrees,
reconciliation, retries, abort, leases and workspace wave isolation.

## Recall benchmark

`scripts/recall-bench.mjs` generates a synthetic closed-iteration history
(default 100 iterations × 500 nodes), rebuilds `.knowledge/index/recall.json`, and
reports index size, build time, recall p50/p95 for topic/alias/description
queries, hydrated snapshot count and heap usage. It is not part of `npm test`:

```bash
node scripts/recall-bench.mjs
node scripts/recall-bench.mjs --iterations 50 --nodes 200 --runs 10
```

## Known limits (v1.1)

- The YAML parser supports a constrained subset: block maps/sequences, inline
  lists/maps, quoted strings and comments. Block scalars (`|`, `>`) are rejected
  with a line number.
- The setup wizard covers profile, project name, artifact paths, workspace mode,
  persona enable/create/override, and steering core rules/presets. Persona
  triggers, aliases, advanced steering rules and source configuration remain file
  edits.
- Workspace mode owns knowledge at the root; it does not automate per-repo
  commits, merges or submodule gitlinks. `close` records each repo's HEAD but the
  orchestrator performs Git operations.
- Migration reconstruction is LLM work. The CLI guarantees scan/backup/scaffold/
  validation, not semantic completeness; the agent must provide evidence for
  every memory.
- `start` requires a clean tree across the root and enabled repos. `wave start`
  ignores state/runtime paths but refuses uncommitted code unless
  `--allow-dirty`.
- Wave execution requires `execution.isolation: worktree`; other isolation modes
  are rejected by `wave start`.
- Migration backups are never deleted automatically. Restore from `BACKUP.json`
  if needed.
- Steering semantic compliance is agent-level. The CLI validates rule references,
  examples and phase maps, and emits the phase pack/evidence path; it cannot prove
  that a reviewer followed a rule.
- Model/agent identity is host-specific. The CLI resolves expected routing and
  compares declared or environment-provided identity; it does not detect an
  unavailable model or switch agents.
- Prompt handoff is a checkpoint, not an automatic harness switch. Another agent
  must explicitly accept it and continue from the saved prompt/run state.
- MCP sources are validated but not probed (no MCP client adapter yet);
  `doctor --online` probes Git sources.
- The Claude Code plugin ships a top-level `bin/` so Claude Code can expose the
  CLI; claude.ai Chat and Cowork currently refuse plugins with that directory. The
  plugin command is namespaced as `/orchid-sdd:run`; bare `/orchid-sdd` remains
  the OpenCode/standalone invocation.
- Single-prompt worktree creation, agent spawning and single-prompt merges remain
  orchestrator-driven. Wave worktrees and reconciliation are CLI-driven; `close`
  does not run `git merge`.
- One active iteration per workspace root; multi-repo execution is supported, but
  per-repo Git remains orchestrator-driven.
- The phase set is fixed by the skill contract. Adding a phase is a code/docs/
  schema change, not a config toggle; see
  [Customization: adding a phase](customization.md#adding-a-phase).

## Related reference

- [Configuration](configuration.md)
- [Customization](customization.md)
- [Full design specification](../orchid-sdd-design.md)
