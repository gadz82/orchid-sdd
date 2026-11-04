## [0.3.2](https://github.com/gadz82/orchid-sdd/compare/v0.3.1...v0.3.2) (2026-11-04)


### Bug Fixes

* **skill:** enrich governance contracts and preset examples ([84793d0](https://github.com/gadz82/orchid-sdd/commit/84793d0d417456f735478aa987ca5320b0e9240c))

## [0.3.1](https://github.com/gadz82/orchid-sdd/compare/v0.3.0...v0.3.1) (2026-11-04)


### Bug Fixes

* **skill:** enforce feature branch choice and prompt branch cleanup ([b6d8c45](https://github.com/gadz82/orchid-sdd/commit/b6d8c45bf0b4e2a232a2041ba47dc9dbea2ef319))

# [0.3.0](https://github.com/gadz82/orchid-sdd/compare/v0.2.1...v0.3.0) (2026-11-03)


### Bug Fixes

* **release:** publish skill prompt updates ([5b631b5](https://github.com/gadz82/orchid-sdd/commit/5b631b53673444bd8bf9ebbb7e14cff0027de2ae))
* **release:** sync CLI and plugin versions [skip ci] ([71d48bb](https://github.com/gadz82/orchid-sdd/commit/71d48bb5e97cf8f79b463db4ef80821bc60f0bc7))


### Features

* **skill:** prompt for approval and technical handover [skip ci] ([7d68609](https://github.com/gadz82/orchid-sdd/commit/7d68609a3536fa7d0416f3aaa32f8f54dbfeffbd))

## [0.2.1](https://github.com/gadz82/orchid-sdd/compare/v0.2.0...v0.2.1) (2026-11-03)


### Bug Fixes

* **release:** run tests before npm publish ([fa23001](https://github.com/gadz82/orchid-sdd/commit/fa230011b2bc29ad666e383269e9b4dcda2486d0))

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
  `steering.phases`; setup seeds nine core rules and `.orchid/steering/README.md`.
- Added `steering list|show|context`, phase-aware steering output, gate audit metadata, and
  steering validation in `doctor` and `diff`.
- Applied steering to Discovery and Logic Review with `discovery/steering.md` and
  `reviews/steering-review.md` evidence artifacts, plus optional architecture, style, and
  repository presets.
- Made the default style rule language- and tool-agnostic. Added examples for TypeScript,
  Go, Python, PHP, Rust, Java, and Ruby.
- Added core SOLID, dependency inversion/DI container, and SAGA steering rules.
- Added optional DDD, CQRS, event-driven, and language-specific style presets.
- Added declarative `models` routing: effort levels, phase and development-prompt
  assignments, agent/model mappings, and `route` detection with unknown/mismatch alerts.
  Effort definitions are opt-in; undefined efforts fall back to `default_effort`, or
  `unassigned` if the default has no mapping.
- Added current identity detection through explicit flags/environment, with `match`,
  `mismatch`, `unknown`, and `unassigned` states. The CLI never switches models or agents.
- Added prompt execution state (`prompt start|step|complete|fail|waive`), run/attempt events,
  matrix status updates, and replay through `resume`.
- Added an optional wizard step that guides phase efforts and effort-to-agent/model mappings.
- Added portable `handoff prepare/list/show/accept` checkpoints for switching harnesses without
  automatic model or agent replacement.
- Added automatic latest-handoff acceptance to `resume`, with `--handoff` and `--no-handoff`
  controls.
- Made coding-agent task updates human-readable and terse: one outcome line, material details
  shaped by phase, explained IDs, and a clear next action; raw IDs, paths, JSON, and internal
  source keys stay out of user-facing narration.
- Added deterministic legacy-knowledge restructuring to `migrate init`: after backup, the
  legacy tree is moved into `input/legacy/`, leaving the active knowledge folder in the
  orchid-sdd layout; the backup remains the rollback copy.
- Added an explicit generated-code comment contract: inline comments carry only the minimum
  why/invariant, significant units carry one `ORCHID-MEM` anchor, and history lives in the
  linked UUID docblock. `lint` now requires a non-empty anchor description.
- Added an eight-step, plain-language setup wizard with steering and optional model-routing
  steps.
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
