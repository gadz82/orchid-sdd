# Migration

[Back to README](../../README.md) · [Reference index](README.md)

`migrate` converts an existing project, repo or workspace into an orchid-sdd
project without discarding its history. It is intentionally **agent-driven**: the
CLI scans, backs up and scaffolds; an LLM agent reconstructs semantic memory from
Git, specs and ADRs.

```bash
orchid-sdd migrate scan
orchid-sdd migrate backup
orchid-sdd migrate init --profile monorepo
orchid-sdd migrate status
orchid-sdd migrate finalize
```

## Commands

| Command | What it does |
|---|---|
| `migrate scan [--json] [--output PATH]` | Read-only topology, knowledge and Git report |
| `migrate backup` | Copy legacy assets to `.orchid-migration-bck/<timestamp>/` |
| `migrate init [--profile P] [--single] [--dry-run]` | Backup + root config + repo overrides + legacy restructure + plan |
| `migrate init --dry-run` | Show the plan; writes nothing |
| `migrate status [--json]` | Stage, backup path and repos |
| `migrate finalize` | Validate manifest, write report, set `phase: ready` |
| `migrate init --force` | Existing config; backup happens first |
| `--skip-backup` | Discouraged; only with an external backup |

## What init writes

`migrate init` writes:

```text
MIGRATION.md
.orchid/migration/
  scan.json
  PLAN.md
  prompts/
  STATUS.json
  CODE-EXAMPLES-PROPOSAL.md   # after the agent proposal
.orchid/agents/               # generated development contexts + preserved sources
.orchid-migration-bck/<timestamp>/
  BACKUP.json
  restore notes
  root/...
```

Legacy assets are copied to the backup: `.knowledge`, `AGENTS.md`,
config/state, `.serena/memories`, repo `AGENTS.md`/`.knowledge`. The legacy
knowledge tree is then restructured into `<knowledge_folder>/input/legacy/`
before scaffolding, so the active knowledge root matches the orchid-sdd layout
and the agent cannot skip reorganisation. The backup remains the rollback copy.

## Agent reconstruction plan

The generated plan instructs the agent to:

1. inventory ADRs, specs, plans, prompts and progress;
2. seed `Decision`/`Requirement`/`Scenario` nodes with `--scope project`;
3. reconstruct `CodeUnit` nodes and anchors from Git history and code;
4. analyse the existing code for every significant language, propose project
   code-style examples in
   `.orchid/migration/CODE-EXAMPLES-PROPOSAL.md`, and wait for explicit approval
   before writing anything under `.orchid/steering/examples/`;
5. after approval, create the blocking `.orchid/steering/code-examples.md`
   override and verify it with `doctor` and
   `steering context --phase build`;
6. maintain both agent-context flows (`05-agent-contexts.md`): curate the nested
   development context under `.orchid/agents/`, update the user-owned project
   `AGENTS.md` files without overwriting user prose, add nested project contexts
   only where a domain needs one, then run `agents project sync` and `agents
   sync`;
7. validate with `index`, `lint`, `doctor`, then `migrate finalize`.

`migrate init` preserves every existing `AGENTS.md` (root and nested) in the
backup and in `.orchid/agents/sources/project/`. `migrate scan` reports the
detected project files, additional agent sources, and the domains that will
receive nested development contexts. Generation is non-destructive; curated
files are never replaced unless `agents init --force` is used deliberately.

The proposed examples must cover every significant language, not only the most
common one. They are never generated before approval. If the user refuses, the
proposal records the decision and the default `code-examples` rule remains
unchanged.

## Finalize

```bash
orchid-sdd index
orchid-sdd lint
orchid-sdd doctor
orchid-sdd migrate finalize
```

`finalize` refreshes both agent-context flows, moves the project to
`phase: ready`, and writes the report; the next `orchid-sdd start` is the first
real iteration.

## Rollback

The backup is never deleted automatically. Restore from
`.orchid-migration-bck/<timestamp>/BACKUP.json` if the migration must be
reverted. Do not continue a migration on top of a partially restored tree.

## Limitations

- Semantic reconstruction is LLM work. The CLI guarantees scan, backup,
  scaffold and validation, not semantic completeness.
- Migration does not invent requirements or decisions without evidence.
- Per-repo commits, merges and submodule gitlinks remain orchestrator work.
- The backup is not pruned automatically; manage disk usage deliberately.

## Related reference

- [CLI: migration commands](cli.md#migration)
- [Workspace mode](workspace.md)
- [Memory model](memory.md)
- [Full design specification](../orchid-sdd-design.md)
