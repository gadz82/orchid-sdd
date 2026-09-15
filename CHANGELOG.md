# Changelog

## Unreleased

Product rename:

- Renamed the product, CLI, config file, skill, plugin, commands, routes, generated files,
  tests, and documentation to `orchid-sdd`.

Claude Code packaging:

- Added a Claude Code plugin adapter at `.claude-plugin/plugin.json` with an explicit
  `/orchid-sdd:run` command and a skill pointer to the canonical `SKILL.md`.
- Added `.claude-plugin/marketplace.json`, `claude-commands/run.md`, and
  `claude-skills/orchid-sdd/SKILL.md`.
- Added `bin/orchid-sdd`, a bare-name wrapper for Claude Code's plugin `PATH`.
- Kept the OpenCode adapter and portable CLI operational; the root contract and OpenCode
  command only gained the `/orchid-sdd:run` explicit path and `disable-model-invocation`.
- Expanded all nine shipped personas with concise active contracts and detailed reference
  dossiers under `docs/personas/`, plus structural tests.
- Documented gate execution versus human authorization: the agent normally runs the CLI
  command, but human gates must not be auto-passed.
- Added `skills.sh.json` for the Vercel Agent Skills catalog and documented local
  `npx skills add` installation; full workflow still requires local Node/Git access.
- Renamed the npm package to `orchid-sdd`; it installs the `orchid-sdd` binary.
- Added explicit `skill install --agent opencode|claude-code|generic` with project/global
  targets, `--dest`, `--force`, `--dry-run`, and no `postinstall` side effects.
- Added a profile matrix test covering backend, frontend, infra, monorepo, and custom
  personas, test commands, constitution packs, and `doctor` results.
- Added first-class steering rules: Markdown contracts with front matter for architecture,
  code examples, code style, repository flow, and custom process rules.
- Added `steering.enabled`, `steering.search_paths`, `steering.overrides`, and
  `steering.phases`; setup seeds six core rules and `.orchid/steering/README.md`.
- Added `steering list|show|context`, phase-aware steering output, gate audit metadata, and
  steering validation in `doctor` and `diff`.
- Applied steering to Discovery and Logic Review with `discovery/steering.md` and
  `reviews/steering-review.md` evidence artifacts, plus optional architecture, style, and
  repository presets.
- Added a seven-step, plain-language setup wizard with a steering step for core rules,
  optional presets, and Discovery/Logic Review application.
- Added agent-friendly setup flags: `--steering-preset`, `--no-steering`,
  `--no-steering-discovery`, `--no-steering-logic-review`, and `--json`.

## 0.2.0 — 2026-10-28

Workspace and migration:

- Root-owned workspace mode for nested Git repositories; one `.knowledge`, state,
  manifest, and audit at the workspace root.
- Per-repo `orchid-sdd.yml` overrides with `extends`, profile, test commands, and
  personas; nested setup is refused.
- Workspace detection, per-repo Git state, clean-tree guard for `start`, and workspace
  snapshots at closure.
- Project-scoped memory (`record --scope project`) and `--repo`; project memories are
  included in every manifest and `repos.json` index.
- `migrate scan|backup|init|status|finalize`; backups to `.orchid-migration-bck/<timestamp>`
  with `BACKUP.json`; LLM reconstruction plan and prompts.
- Migration uses Git/file history and legacy knowledge; `finalize` moves the project to
  `phase: ready`.

## 0.1.0 — 2026-10-28

Initial M0 foundation:

- Portable zero-dependency Node CLI (`orchid-sdd`).
- Setup wizard with backend, frontend, infra, monorepo, and custom profiles.
- Interactive setup wizard (TTY) plus flags; `--persona` accepts canonical IDs and aliases.
- Profile constitution packs copied into `.orchid/constitution/_profile/` and included.
- Configurable workspace paths in the wizard and via `--knowledge-folder`,
  `--docblocks-folder`, `--constitution-folder`, and `--customizations-folder`.
- Persona management in the wizard (enable catalog, create custom, override existing),
  `--persona-file`, project persona resolution by ID, and `persona list|show`.
- Config schema validation with unknown-key errors.
- Append-only events, generated manifest, and topic/question/code-anchor/requirement/
  dependency/timeline indexes.
- `record`, `index`, `recall`, `lint`, `doctor`, `status`, `resume`, `diff`, `migrate`.
- Gate-aware lifecycle: start, discover, assess, plan, build, review, close, handover,
  abandon.
- UUID-keyed docblocks, `ORCHID-MEM` anchors, 500-char comment lint.
- Default personas (PM with PO alias, DEV, QE, TECH_LEAD, ARCHITECT, DBA, DEVOPS,
  SECURITY, UX) and default constitution.
- Explicit-only `SKILL.md` and OpenCode command adapter.
- `node:test` integration suite.
