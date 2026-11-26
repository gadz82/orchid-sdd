# Agent contexts

[Back to README](../../README.md) · [Reference index](README.md)

orchid-sdd maintains **two separate agent-context flows**. They have different
owners, different content, and different lifecycles. Mixing them is the failure
mode this feature exists to prevent.

| Flow | Owner | Location | Read by |
|---|---|---|---|
| **Project context** | You | `AGENTS.md`, nested `AGENTS.md` | Any agent, with or without orchid-sdd |
| **Development context** | orchid-sdd | `.orchid/agents/agents/**/AGENTS.md` | The orchid-sdd orchestrator |

The project context must stay useful when orchid-sdd is not installed. The
development context is optimised for orchid-sdd operations and must not become a
copy of the project docs.

---

## Project context

### What setup does

`orchid-sdd setup`:

1. creates the root `AGENTS.md` when missing;
2. appends the managed `<!-- orchid-sdd:begin -->` block when it is missing;
3. replaces **only** the bytes between the managed markers on later syncs;
4. leaves every byte outside the block untouched;
5. never rewrites nested `AGENTS.md` files.

The managed block contains the cold-agent memory contract and the reminder that
project guidance belongs in the project files, not in the development context.

### Nested files

Nested `AGENTS.md` files are first-class:

- they are detected during `setup`, `migrate scan`, and `agents init`;
- their folders become development-context domains automatically;
- their content is preserved under `.orchid/agents/sources/project/` while the
  switch is active;
- `agents project sync` records their hashes but does not edit them;
- `agents project add <dir>` creates a non-destructive skeleton when a domain
  deserves its own context.

### End-of-iteration maintenance

The agent updates the root and relevant nested project files with durable
knowledge: architecture, commands, conventions, boundaries, and recurring
pitfalls. Then:

```bash
orchid-sdd agents project sync
```

The command refreshes the managed block, writes
`.orchid/agents/project-context.json`, and records the project hash. `close`
uses that evidence when `agents.maintenance: required`.

Never write orchid-sdd runtime instructions outside the managed block. The
project context is not the place for prompt IDs, gate workflows, or internal CLI
state.

---

## Development context

### Dataset layout

```text
.orchid/agents/
├── contexts.yml                 # folder → development context mapping
├── agents/
│   ├── root/AGENTS.md           # orchestrator contract + project facts
│   ├── src-api/AGENTS.md        # folder-scoped domain context
│   └── ...
├── sources/
│   ├── SOURCES.json             # detected agent sources
│   ├── project/AGENTS.md        # preserved project files
│   └── agent/...                # CLAUDE.md, .cursor rules, ...
├── MANIFEST.json                # targets, languages, hashes
├── project-context.json         # project AGENTS.md hashes
└── runtime/                     # activation/backups, Git-ignored
```

`contexts.yml` uses the
[`agent-contexts`](https://www.npmjs.com/package/agent-contexts) manifest shape:

```yaml
version: "1"
name: "acme-orchid-development"
description: "orchid-sdd development contexts"
mappings:
  ".":
    context_source: ./agents/root/AGENTS.md
    description: orchestrator context
  "src/api":
    context_source: ./agents/src-api/AGENTS.md
    description: API domain context
```

- Keys are project-relative POSIX folders; `.` is the root.
- `context_source` is relative to `.orchid/agents/` and must stay inside that
  folder, so the contexts repository remains self-contained.
- A target whose folder no longer exists is skipped as drifted.
- Add a mapping and run `agents sync` to introduce a new domain. User-curated
  mappings whose source is not an orchid-generated file are preserved; only
  generated targets are refreshed.

### Generation

`setup`, `migrate init`, `agents init`, and `agents sync` build the dataset from:

- **existing agent context**: root and nested `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, Cursor rules, and Copilot instructions. Local-only stores such as
  `.serena/memories` are deliberately not copied: they are often Git-ignored and
  may contain local or sensitive notes. Add them explicitly under
  `.orchid/agents/` if you want them in the dataset;
- **the codebase**: detected languages, file counts, representative files, and
  conventional package/service folders.

Root guidance is extracted into a clearly subordinate “Imported project
guidance” section. Full originals are always preserved under `sources/`; the
development context never needs to read a switched-away project file.

Generation is idempotent:

- missing files are created;
- existing curated files are kept;
- the managed facts block (`<!-- orchid-sdd:facts:begin -->`) is refreshed;
- `agents init --force` regenerates the generated files (use deliberately: it
  discards curation).

### Activation and restoration

With `agents.switch: on_start` (default), `orchid-sdd start` switches every
mapped folder to its development context:

- existing project files are backed up;
- the visible `AGENTS.md` files become the development context;
- state records the mode, targets, link names, and dataset hash;
- an `agents.activated` event is appended.

`orchid-sdd agents off` restores the project files and removes generated locks,
caches, and activation journals. `abandon`, `close`, and `doctor --fix` also
restore the switch when appropriate.

Activation uses one of two modes:

| Mode | When | Behaviour |
|---|---|---|
| `library` | `agent-contexts` is resolvable and no foreign `contexts.lock` exists | Symlinks/copies through the library, lockfile, cache, `.bak` backups |
| `native` | Library missing, `agents.mode: native`, or a foreign lock exists | Deterministic copy with a runtime journal under `.orchid/agents/runtime/` |

`agents.mode: auto` (default) prefers the library. Set `agents.mode: native` for
fully dependency-free operation. `ORCHID_AGENTS_MODE=native` is the escape hatch
for one invocation.

The switch never edits your project files; it only hides them for the duration
of the task.

### Prompt context packs

`prompt start` selects the root development context plus every domain context
whose folder matches the prompt’s `scope.write`, and writes the result to
`<iteration>/execution/runs/<run>/context.md`. Hand that file to the implementer
or reviewer instead of the project `AGENTS.md`; the state and run record point
to it as `context`.

### Prompt boundary

Development prompts must not own agent-context files. Put `AGENTS.md` and
`.orchid/agents/**` only in the end-of-iteration maintenance flow, never in a
prompt `scope.write`. `prompt validate` reports an error and `prompt start`
refuses the prompt, because such a write would race the maintenance step and
produce merge conflicts.

### Git safety

The switch replaces **tracked** files for the duration of an iteration. That is
visible to Git as a modification, even though orchid-sdd ignores it in its own
clean-tree and wave checks. Therefore:

- run `orchid-sdd agents off` before any manual `git add`, commit, rebase, or
  branch operation outside the orchid-sdd flow;
- never commit a switched `AGENTS.md`: it starts with
  `<!-- orchid-sdd:development-context -->`;
- never commit `contexts.lock`, `.contexts/`, `.orchid/agents/runtime/`, or
  `AGENTS.md.bak*`;
- the generated CI workflow includes a **Guard agent context** step that fails
  when a switched context or `contexts.lock` is committed;
- `orchid-sdd doctor` fails when it finds a tracked `AGENTS.md` containing the
  development marker, or tracked `contexts.lock`/`.contexts` state.

The local lock is excluded through `.git/info/exclude` only while orchid-sdd
owns the switch. A user-managed `contexts.lock` is never hidden or modified.

### Copy mode and Windows

On filesystems without symlink support (for example Windows without Developer
Mode), `agent-contexts` falls back to file copies automatically. To exercise or
force the copy path:

```bash
ORCHID_AGENTS_COPY=1 orchid-sdd agents on
```

Copy mode is fully supported: repeated `agents sync` refreshes the copies, and
`agents off` restores the originals and removes generated `.bak.N` copies. The
test suite covers the copy path explicitly; native mode covers the
no-dependency path.

### Performance

`setup`, `agents init`, and `agents sync` scan the repository for agent sources
and code domains. The scan skips dependency/build/vendor folders and is capped
per walk; on very large monorepos, keep the workspace registry focused and use
`agents.max_targets` to bound the nested contexts. `agents sync` is the only
command that re-scans during an iteration.

### Maintenance during an iteration

While the switch is active, `agents sync` refreshes the dataset and re-links it.
It does **not** record project maintenance, because the project files are still
hidden. Update development context files whenever a fact changes:

- entry points and integration seams;
- build/test commands and known flaky checks;
- invariants and non-obvious failure modes;
- folder-specific conventions that the root context does not cover.

### End-of-iteration sequence

```bash
orchid-sdd agents off              # restore project AGENTS.md files
# update root + nested project AGENTS.md
# update .orchid/agents/agents/**/AGENTS.md
orchid-sdd agents project sync     # project hash evidence
orchid-sdd agents sync             # development dataset hash evidence
orchid-sdd close --approve
```

`close` checks, when `agents.maintenance: required`:

1. the switch is off;
2. `agents project sync` and `agents sync` both ran for the current iteration;
3. the development dataset hash still matches `agents sync`;
4. the project `AGENTS.md` hash still matches `agents project sync`.

`agents.maintenance: warn` reports the same findings without blocking. `off`
disables the check. `close --approve --skip-agents` is the explicit exception.

---

## Commands

```bash
# Development context
orchid-sdd agents init [--force]
orchid-sdd agents sync [--note TEXT]
orchid-sdd agents on|off
orchid-sdd agents status
orchid-sdd agents list
orchid-sdd agents show [TARGET]

# Project context
orchid-sdd agents project list
orchid-sdd agents project sync
orchid-sdd agents project add DIR [--title TEXT]
```

All inspection commands accept `--json`. Mutating commands take the state lease.

## Configuration

```yaml
agents:
  enabled: true
  folder: ".orchid/agents"
  link_names: [AGENTS.md]     # link names for the switch
  nested: true                # detect folder-scoped domains
  max_targets: 12
  switch: on_start            # on_start | manual | off
  maintenance: required       # required | warn | off
  mode: auto                  # auto | library | native
```

New projects generated by `setup` use `maintenance: required`. Existing configs
without an `agents` key inherit the non-breaking `warn` default. Set
`enabled: false` or `setup --no-agents` to opt out entirely.

Single-invocation overrides:

- `ORCHID_AGENTS_MODE=native|library|auto` — override `agents.mode`;
- `ORCHID_AGENTS_COPY=1` — force library copy mode instead of symlinks.

## Files and Git

Commit:

- `.orchid/agents/contexts.yml`
- `.orchid/agents/agents/**`
- `.orchid/agents/sources/**`
- `.orchid/agents/MANIFEST.json`
- `.orchid/agents/project-context.json`
- project `AGENTS.md` files
- `orchid-sdd.yml`

Ignore (the managed `.gitignore` block does this):

- `.orchid/agents/runtime/`
- `.contexts/`
- `**/AGENTS.md.bak*`

`contexts.lock` is machine-specific when generated from the local
`.orchid/agents` source. orchid-sdd excludes it through `.git/info/exclude`
only for the duration of the switch, so a pre-existing user-managed
`contexts.lock` is never hidden or modified. Never commit an orchid-generated
activation lock or its backups.

## Failure handling

| Symptom | Action |
|---|---|
| Switch active without an iteration | `orchid-sdd agents off`, then `doctor` |
| `contexts.lock` is not ours | orchid-sdd falls back to native; leave the lock untouched |
| `AGENTS.md` is a user symlink | orchid-sdd selects native mode so the link itself is backed up and restored |
| `.bak` files remain | `orchid-sdd agents off`; if state is lost, `doctor --fix` |
| Dataset stale | `orchid-sdd agents sync` |
| A switched `AGENTS.md` was committed | Run `orchid-sdd agents off`, restore the project file, and commit again; `doctor` and CI fail on the marker |
| `contexts.lock`/`.contexts` tracked | Remove them from the index; they are local activation state |
| Prompt writes agent context | Remove `AGENTS.md`/`.orchid/agents` from `scope.write`; use the end-of-iteration flow |
| Close blocked | Run the end-of-iteration sequence above |
| Curated context overwritten | Restore from Git; use `agents init --force` only deliberately |
