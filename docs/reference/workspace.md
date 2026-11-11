# Workspace mode

[Back to README](../../README.md) · [Reference index](README.md)

If the project root contains several nested Git repositories, orchid-sdd runs in
**workspace mode**. The root owns one `.knowledge`, one state, one manifest and one
audit trail; each nested repo is a unit of work.

```bash
orchid-sdd setup --workspace --profile monorepo
```

Use `--single` to ignore nested repos deliberately.

## What setup writes

The root config registers every repo:

```yaml
workspace:
  enabled: true
  repos:
    - id: orchid-api
      path: services/orchid-api
      profile: backend
      test_commands:
        unit: ".venv/bin/python -m pytest tests/ -x"
      personas: [SECURITY]
    - id: orchid-web
      path: apps/orchid-web
      profile: frontend
```

Each repo receives a small `orchid-sdd.yml` fragment with `extends`:

```yaml
extends: ../../orchid-sdd.yml

project:
  name: orchid-api
  profile: backend

execution:
  test_commands:
    unit: ".venv/bin/python -m pytest tests/ -x"
    integration: ".venv/bin/python -m pytest tests/ -x -m integration"
```

Allowed fragment keys: `extends` (required), `project`, `execution`, `personas`,
`constitution`, `sources`. The fragment cannot set root-owned paths or
`workspace`.

The CLI validates fragments and treats them as repo-specific policy for the
agent. It does **not** merge them into the root config.

## Commands

| Operation | Command |
|---|---|
| Detect and enable | `orchid-sdd setup --workspace --profile monorepo` |
| Stay single-repo | `orchid-sdd setup --single ...` |
| See repo state | `orchid-sdd status` |
| Validate workspace | `orchid-sdd doctor` |
| Baseline memory | `orchid-sdd record --scope project --repo <id> ...` |
| Filter recall | `orchid-sdd recall auth --repo <id>` |
| List dependencies | `orchid-sdd dependencies list [--repo ID] [--status S] [--kind K] [--json]` |
| Validate dependencies | `orchid-sdd dependencies check [--json]` |
| Freeze Git state | `orchid-sdd close --approve` |

`status` shows each repo's branch, HEAD and dirty count. `start` enforces a clean
tree across the root and enabled repos; use `--allow-dirty` deliberately.
`close` records each repo's HEAD in the iteration snapshot and the repo index.

## Cross-repo dependencies

Cross-repo edges are tracked explicitly in
`.orchid/cross-repo-dependencies.md`. The template is
`.skill/templates/artifacts/cross-repo-dependencies.md`.

Add a `DEP-###` row as soon as an edge is discovered. A prompt that touches the
edge lists the row IDs in its front matter:

```yaml
dependency_refs: [DEP-001, DEP-004]
```

`prompt validate` checks the IDs against the ledger; `prompt show --json` exposes
them. During code review, open every row that touches a changed repo and check:

- contract and version;
- failure mode and fallback;
- deployment order;
- consumer/provider regression evidence.

The generated index is `.knowledge/index/cross-repo-dependencies.json`; run
`orchid-sdd index` after editing the ledger.

`dependencies list --json` and `dependencies check --json` return:

```json
{ "ok": true, "rows": [], "errors": [], "warnings": [] }
```

When the ledger is invalid, `ok` is `false`, `rows` is empty and the exit code is
1.

## Workers, worktrees and state

- Wave worktrees are created per repo from a frozen base.
- All `orchid-sdd` state lives at the workspace root.
- Run the CLI against the root, or pass `--root <workspace-root>`, even while
  editing a file inside a nested repo or a prompt worktree.
- Per-repo tests are used by `wave reconcile --test` when configured; there is no
  silent fallback to the root project's test command.

## Limitations

- The CLI does not automate per-repo commits, merges or submodule gitlinks.
- `close` records HEADs; the orchestrator performs Git operations.
- One active iteration per workspace root.
- Repo fragments are validated policy, not merged configuration.
- Cross-repo semantic completeness is the agent's responsibility.

## Related reference

- [Configuration: workspace entries](configuration.md#workspace-repo-entries)
- [CLI: workspace commands](cli.md#workspace-multi-repo)
- [Migration](migration.md)
- [Full design specification](../orchid-sdd-design.md)
