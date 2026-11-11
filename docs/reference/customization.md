# Customization

[Back to README](../../README.md) · [Reference index](README.md)

orchid-sdd is designed to be customized without forking the skill. The project
owns its configuration, personas, steering, constitution, templates and workspace
overrides; the skill package owns defaults and the CLI.

## Customization surfaces

| Surface | Where | How to customize | Consumed by |
|---|---|---|---|
| Project settings | `orchid-sdd.yml` | Edit values; `orchid-sdd doctor` validates | CLI + agent |
| Artifact paths | `knowledge_folder`, `docblocks_folder`, `constitution_folder`, `customizations_folder` | Setup flags or config; move data deliberately | CLI |
| Personas | `.orchid/personas/<ID>.md` + `personas.enabled` | Create a file, enable the ID, set authority/phases | CLI + agent |
| Persona overrides | `personas.overrides.<ID>` | `authority`, `phases` or `file` | CLI + agent |
| Steering rules | `.orchid/steering/*.md` + `steering.enabled` | Create a rule, enable it, map it to phases | CLI + agent |
| Steering overrides | `steering.overrides.<ID>` | `authority`, `phases` or `file` | CLI + agent |
| Constitution | `constitution_folder` | Add rules, compose with `@include`, keep the profile pack | Agent + CR |
| Templates | `customizations_folder`, mirroring `.skill/templates` | Override a PRD/TRD/prompt/CR/handover template | Agent; `diff` audits |
| AGENTS contract | `AGENTS.md` | Managed block is written by setup; add project guidance outside it | Agent |
| Workspace registry | `workspace.repos[]` | Add/remove repos, profiles, tests, personas | CLI + agent |
| Repo overrides | `<repo>/orchid-sdd.yml` | `extends` + allowed keys only | CLI + agent |
| External sources | `sources[]` | Declare MCP/Git/local sources; `doctor --online` | CLI + agent |
| Execution policy | `execution.*` | Isolation, test commands, parallelism, fix loops | Agent; clean-tree by CLI |
| Review policy | `reviews.*` | Batch/per-prompt, routing, block severities, logic cap | Agent |
| Governance | `governance.*` | Approvals, rigor, title limit, ADR triggers | CLI + agent |
| Migration | `migrate` flags + `.orchid/migration` | Profile, paths, single/workspace, backup | CLI + agent |

## Profiles

`project.profile` is a **setup preset**, not a runtime switch. The bundled profiles
are `backend`, `frontend`, `infra`, `monorepo` and `custom`; each seeds personas,
test commands and constitution includes.

Choose one at setup. Changing the value later does not regenerate those files;
edit the dependent surfaces or rerun setup deliberately. The profile ID set is
fixed; use `custom` for project-specific needs and customize config, personas and
constitution directly.

## Custom personas

See [Personas](personas.md) for the complete contract and examples. The short
version:

1. create `.orchid/personas/QA.md` with `id: QA`;
2. add `QA` to `personas.enabled`;
3. run `orchid-sdd doctor` and `orchid-sdd persona list`.

To override an existing persona, use the same `id`. `personas.overrides` can also
point at a file, change authority or reassign phases.

## Constitution

The project constitution lives at `constitution_folder` (default
`.orchid/constitution`). The generated `constitution.md` already includes the
skill default and profile pack; add project includes and rules below them:

```md
@include guidelines/api.md
@include testing/contracts.md

## Project rules
- All public API changes require an OpenAPI diff.
```

A deviation from a constitution rule requires an ADR
(`constitution.require_adr_for_deviation`). The generated `_profile/` pack is
setup-owned; put team edits in the project folder, not there.

## Steering rules

Steering rules are **selectable** contracts. The constitution applies everywhere;
a steering rule is an explicit project decision that can be enabled, assigned to
phases and cited at a gate.

The catalog is split by lifecycle, not by type:

- `.skill/steering/default-presets/` — the nine core rules setup enables;
- `.skill/steering/available-presets/` — optional architecture, repository,
  code-style and process rules.

Both resolve through the same ID registry and override mechanism. See
[Steering](steering.md) for the rule format and [Patterns](patterns.md) for what
each preset means.

Create a project rule:

```md
---
id: project-api-boundaries
title: API boundaries
summary: HTTP handlers do not contain domain rules.
kind: architecture
authority: blocking
phases: [discovery, assessment, logic_review]
tags: [architecture, api]
examples:
  - path: examples/typescript/handler.ts
    title: "Thin handler"
    language: typescript
---
# Rule
...
# Checks
...
# Evidence
...
```

Then enable it and map it to phases:

```yaml
steering:
  enabled:
    - project-api-boundaries
  phases:
    discovery: [project-api-boundaries]
    logic_review: [project-api-boundaries]
```

A project file with the same `id` overrides a default. Run `doctor` after editing;
it rejects unknown, disabled or duplicate references and validates example paths.

### Migration and code examples

During migration the agent proposes project-specific examples for every
significant language, waits for explicit approval, then writes them under
`.orchid/steering/examples/` and creates a blocking
`.orchid/steering/code-examples.md` override. Build and code review must follow
those examples; a deviation requires an ADR.

## Template overrides

Templates are identified by their **logical path** inside `.skill/`. Override one
by placing a file at the same path under `customizations_folder`. The shipped
artifact set is PRD, TRD, Gherkin, questionnaire, ADR, prompt, CR, handover and
tour; profile presets are JSON under `.skill/templates/profiles/`.

With default paths:

```text
.skill/templates/artifacts/prd.md       →  .orchid/custom/templates/artifacts/prd.md
.skill/templates/artifacts/prompt.md    →  .orchid/custom/templates/artifacts/prompt.md
.skill/templates/artifacts/cr.md        →  .orchid/custom/templates/artifacts/cr.md
```

`orchid-sdd diff --content` shows what differs from the skill defaults. Skill
upgrades do not overwrite project files; merge changes deliberately. Overrides are
file-level: `extends`/`merge` front matter is a design convention, not
automatically resolved by the CLI. Keep project overrides self-contained and use
`diff` to audit them.

## Workspace repo overrides

A workspace repo gets a small `orchid-sdd.yml` fragment:

```yaml
# workspace-py/orchid/orchid-sdd.yml
extends: ../../orchid-sdd.yml

project:
  name: orchid
  profile: backend

execution:
  test_commands:
    unit: ".venv/bin/python -m pytest tests/ -x"
    integration: ".venv/bin/python -m pytest tests/ -x -m integration"

personas:
  enabled: [TECH_LEAD, SECURITY]
```

Allowed fragment keys: `extends` (required), `project`, `execution`, `personas`,
`constitution`, `sources`. The root config remains authoritative for paths,
knowledge, workspace and audit. See [Workspace mode](workspace.md).

## Adding a phase

The phase set is part of the skill contract, not a runtime config key. This is
deliberate: gates, state, steering, model routing, artifacts and the agent
contract all depend on a stable lifecycle.

Before adding a phase, try these lower-risk alternatives:

1. **Add a steering rule** and map it to an existing phase (for example a
   `security-review` rule under `code_review` or `logic_review`).
2. **Model the work as a prompt type** (`build`, `test`, `spike`) inside build.
3. **Add a review artifact** and cite it at an existing gate.
4. **Add a project checklist** to the constitution or `AGENTS.md`.

A genuinely new phase is a skill-package change. It requires code, schema, docs
and tests to move together. The touchpoints are:

| Area | File / symbol |
|---|---|
| Phase enum | `PHASE_NAMES` in `cli/config.mjs` |
| Phase command mapping | `PHASES` in `cli/phases.mjs` |
| Agent next action | `nextAction()` in `cli/phases.mjs` |
| Gate list | `GATES` in `cli/store.mjs` and the gate-name regex in `cli/phases.mjs` |
| CLI dispatch and help | `cli/cli.mjs` |
| Setup/steering phase validation | `cli/setup.mjs`, `cli/steering.mjs` |
| Config/page defaults | `DEFAULT_CONFIG` and `renderConfig()` in `cli/config.mjs` |
| Steering phase map | seeded `steering.phases` in `cli/config.mjs` |
| State schema | `.skill/schemas/state.schema.json` (if the gate set changes) |
| Agent contract | `SKILL.md` |
| Human docs | this directory and `docs/orchid-sdd-design.md` |
| Tests | config validation, phase commands, gates, lifecycle, steering, models |

### Worked example: a `security_review` phase

Suppose you want a human security gate between logic review and closure. The
current gate sequence is G6 logic review → G7 closure → G8 handover. Inserting a
security phase means renumbering the last two gates:

```text
G6 logic review
G7 security review   (new)
G8 closure           (was G7)
G9 handover          (was G8)
```

This is a **breaking change** for existing projects because `state.gates` keys are
persisted. The complete change set is:

1. Add `security_review` to `PHASE_NAMES` in `cli/config.mjs`.
2. Add `G9` to `GATES` in `cli/store.mjs` and widen the gate-name regex in
   `cli/phases.mjs` from `G[0-8]` to `G[0-9]`.
3. Add the command mapping in `PHASES`:
   ```js
   security: { target: "security_review", gate: "G6" }
   ```
   The command is allowed after logic review has passed G6.
4. Add a `nextAction` string for the new phase.
5. Change `close` to require both G6 (logic review) and G7 (security review), and
   to set G8 instead of G7.
6. Change `handover` to require and set G9.
7. Add the command to `cli/cli.mjs` dispatch and help.
8. Add the phase to `DEFAULT_CONFIG`/`renderConfig()` and the seeded
   `steering.phases` map.
9. Update `SKILL.md`, the design document and the reference docs.
10. Add tests that prove the gate order and that a wrong predecessor is refused.
11. Provide a state migration for existing projects:
    - old G7 (closure) → new G8;
    - old G8 (handover) → new G9;
    - new G7 is the security gate;
    - an in-flight iteration may need to be closed or abandoned before migrating.

If you do not need human sign-off, do not add a phase. Add a blocking
`security-review` steering rule, write `reviews/security-review.md`, and make it
part of G6 evidence. That gives the same enforcement without changing the gate
numbering.

## Recipes

| I want to… | Do this |
|---|---|
| Add a persona | Create `.orchid/personas/QA.md`, add `QA` to `personas.enabled`, run `doctor` |
| Override a persona | Create `.orchid/personas/DEV.md` with `id: DEV`; tune authority/phases/body |
| Inspect full role detail | Read `docs/personas/<ID>.md` and run `persona show <ID>` |
| Add a persona to one repo | Create the file, add the ID to root `personas.enabled`, then list it in `workspace.repos[].personas` |
| Change test commands | Edit `execution.test_commands` at root or in the repo fragment |
| Add a constitution rule | Add a file under `constitution_folder` and `@include` it |
| Add a steering rule | Create `.orchid/steering/<id>.md`, add it to `steering.enabled` and the relevant `steering.phases` lists |
| Override a steering rule | Create `.orchid/steering/<id>.md` with the same `id`; `diff` shows the override |
| Apply rules to Discovery | Put the IDs in `steering.phases.discovery`; write `discovery/steering.md` |
| Apply rules to Logic Review | Put the IDs in `steering.phases.logic_review`; write `reviews/steering-review.md` |
| Override a template | Put it under `.orchid/custom/<logical-path>`; run `diff --content` |
| Batch CR for small work | Set `reviews.adversarial.mode: batch` |
| Route reviews by path | Add globs under `reviews.adversarial.routing` |
| Change reviewer counts | Edit `reviews.adversarial.by_rigor` |
| Add a workspace repo | Add a `workspace.repos[]` entry and a repo `orchid-sdd.yml` with `extends` |
| Move knowledge before iteration 1 | Use setup path flags, or edit config and move the directory |
| Convert legacy knowledge | `migrate scan` → `migrate init` → agent prompts → `migrate finalize` |
| See effective values | `doctor`, `status`, `persona list`, `steering list`, `diff`, `index --check` |
| Run checks in CI | `doctor --ci`, `lint --check`, `index --check` |

## Upgrade and safety rules

- Do not edit `.skill/` in a target project; it is the skill package, not project
  data.
- Project overrides live in `.orchid/` and survive skill upgrades.
- `setup --force` overwrites `orchid-sdd.yml`, rewrites repo fragments and
  recreates `.orchid/state.json` (resetting the lifecycle); back up or use `diff`
  first. It refuses to discard an active iteration or wave.
- `migrate init` always backs up legacy assets before writing (unless
  `--skip-backup`).
- After config edits: `doctor` (and `doctor --fix` for the config hash).
- After persona edits: `persona list` and `doctor`.
- After anchor/docblock edits: `lint`.
- After artifact edits: `index --check`.
- After skill upgrades: `diff` to check overrides against the new defaults and
  merge deliberately.

## Related reference

- [Configuration](configuration.md)
- [Personas](personas.md)
- [Steering](steering.md)
- [Patterns](patterns.md)
- [Workspace mode](workspace.md)
- [Full design specification](../orchid-sdd-design.md)
