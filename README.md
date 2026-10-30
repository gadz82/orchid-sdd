# orchid-sdd

A portable, memory-backed, specification-driven development (SDD) skill for coding agents.

orchid-sdd turns an approved product and technical intent into a traceable graph of
memories, a dependency-ordered set of independent work prompts, and an audited change set
where significant code points back to the reasoning that produced it.

- **Design:** [`docs/orchid-sdd-design.md`](docs/orchid-sdd-design.md) (v0.5)
- **Agent contract:** [`SKILL.md`](SKILL.md)
- **Persona dossiers:** [`docs/personas/`](docs/personas/)
- **npm package:** `orchid-sdd` (installs the `orchid-sdd` command)
- **Claude Code plugin:** [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json)
- **OpenCode adapter:** [`commands/orchid-sdd.md`](commands/orchid-sdd.md)
- **Status:** M0 foundation + workspace/migration + Claude Code plugin (v0.2.0)

Invocation is **explicit-only**: the agent loads this skill when the user types
`/orchid-sdd` (OpenCode), `/orchid-sdd:run` (Claude Code plugin), or runs the
`orchid-sdd` CLI. It never auto-triggers.

## Runbook

Use `orchid-sdd <command>` from the project root; use `/orchid-sdd <command>` in OpenCode
or `/orchid-sdd:run <command>` when installed as a Claude Code plugin.
Add `--root DIR` to target another project; inspection commands accept `--json`.
The agent-facing workflow is in [`SKILL.md`](SKILL.md); this is the operator runbook.

**Deeper reference:** [Agent adapters](#agent-adapters) · [How it works](#how-it-works) ·
[Configuration](#configuration-reference) · [Customization](#customization) ·
[Workspace](#workspace-mode-multi-repo) · [Migration](#migration)

### Choose your path

| If you are… | Start with |
|---|---|
| Setting up a single repository | `orchid-sdd setup` |
| Setting up a multi-repo workspace | `orchid-sdd setup --workspace --profile monorepo` |
| Converting an existing project with `.knowledge`/ADRs | `orchid-sdd migrate scan`, then `migrate init` |
| Returning after a break | `orchid-sdd status`; use `resume` if state is inconsistent |

### Setup and health

| Operation | Command | Use case |
|---|---|---|
| Guided setup | `orchid-sdd setup` | First install; asks profile, paths, personas, steering |
| Automated setup | `orchid-sdd setup --profile backend --yes` | Bootstrap or CI without prompts |
| Agent-friendly setup | `orchid-sdd setup --yes --profile backend --project acme --json` | Explicit answers plus a machine-readable result |
| Choose steering presets | `orchid-sdd setup --yes --steering-preset architecture-hexagonal --steering-preset repository-trunk-based` | Select architecture and repository presets |
| Disable steering | `orchid-sdd setup --yes --no-steering` | Start without steering rules |
| Name the project | `orchid-sdd setup --project acme --yes` | Avoid a directory-derived name |
| Workspace setup | `orchid-sdd setup --workspace --profile monorepo` | Root contains nested Git repos |
| Force single-repo mode | `orchid-sdd setup --single ...` | Ignore nested repos at the root |
| Custom paths | `orchid-sdd setup --knowledge-folder knowledge --docblocks-folder docs/blocks ... --yes` | Keep artifacts outside defaults |
| Add/override personas | `orchid-sdd setup --persona UX --persona-file QA.md --yes` | Enable a catalog persona or add a project one |
| Inspect steering | `orchid-sdd steering list [--phase P]` | See effective rules, authority, and source |
| Apply phase steering | `orchid-sdd steering context --phase discovery` | Emit the rules the agent must apply and cite |
| Preview writes | `orchid-sdd setup --dry-run` | See every file before writing |
| Reconfigure | `orchid-sdd setup --force ...` | Overwrite config and reset state; back up first |
| Claude Code plugin (local) | `claude --plugin-dir .` | Load this repository as a plugin; invoke `/orchid-sdd:run` |
| Claude Code plugin (marketplace) | `claude plugin marketplace add <repo>` then `claude plugin install orchid-sdd@orchid-sdd` | Install a published copy |
| Install agent skill | `npx orchid-sdd skill install --agent opencode` | Copy a self-contained skill + CLI into the agent directory |
| Validate Claude plugin | `claude plugin validate .` | Check manifest and components |
| Preflight | `orchid-sdd doctor` | Validate config, paths, personas, steering, sources |
| Offline CI check | `orchid-sdd doctor --ci` | CI without network or credentials |
| Online source probe | `orchid-sdd doctor --online` | Check Git sources; MCP is validated but not probed |
| Repair infrastructure | `orchid-sdd doctor --fix` | Create missing dirs (including steering), manifest, context |
| Strict validation | `orchid-sdd doctor --strict` | Treat warnings as errors |
| Inspect overrides | `orchid-sdd diff [--content]` | Compare project edits with skill defaults |

### Iteration

| Operation | Command | Use case |
|---|---|---|
| See where you are | `orchid-sdd status [--json]` | Phase, gates, memory, steering, workspace repos, next action |
| Start a feature | `orchid-sdd start "Add passkey login to the customer portal"` | Create the iteration and artifact tree |
| Technical-only change | `orchid-sdd start "Rotate the CI signing key" --technical-only` | No fictional product story |
| Tune rigor | `orchid-sdd start "..." --rigor S\|M\|L` | Collapse or expand the process |
| Skip clean-tree guard | `orchid-sdd start "..." --allow-dirty` | Deliberate migration/pilot work only |
| Record a gate | `orchid-sdd gate pass G1 --evidence intent/prd.md` | Record approval/evidence; agent usually runs it after the human approves |
| Record a blocker | `orchid-sdd gate fail G2 --note "missing Gherkin"` | Stop the phase with a reason |
| Gate overview | `orchid-sdd gate status` | Show all gate states |
| Advance to discovery | `orchid-sdd discover` | Requires G1; reports active steering and the phase artifact |
| Advance to assessment | `orchid-sdd assess` | Requires G2 and Gherkin |
| Advance to planning | `orchid-sdd plan` | Requires G3 |
| Advance to build | `orchid-sdd build` | Requires G4; the agent runs prompts |
| Advance to logic review | `orchid-sdd review` | Requires G5 and prompts done/waived; reports steering |
| Close | `orchid-sdd close --approve` | Archive transients, freeze snapshot, record repo HEADs |
| Handover review | `orchid-sdd handover` | Generate/verify tutorial before approval |
| Accept handover | `orchid-sdd handover --approve` | Mark the iteration complete |
| Abandon | `orchid-sdd abandon "descoped for this quarter"` | Archive without a release |
| Recover state | `orchid-sdd resume` | Replay events after a crash or bad cursor |

### Memory

| Operation | Command | Use case |
|---|---|---|
| Record a requirement | `orchid-sdd record --type Requirement --alias R-001 --description "..." --topics auth,passkeys,login --artifact intent/prd.md` | Seed traceable intent |
| Record a decision | `orchid-sdd record --type Decision --alias ADR-001 --description "..." --topics auth,rollout --artifact assessment/adr/ADR-001.md` | Preserve why a choice was made |
| Record a code unit | `orchid-sdd record --type CodeUnit --id <uuid> --description "..." --topics auth,code --code src/auth.ts#login --artifact docs/knowledge/docblocks/<uuid>.md` | Link code to its reasoning |
| Baseline memory | `orchid-sdd record --scope project --repo <id> ...` | Facts that survive iterations (migration, architecture) |
| Link nodes | `orchid-sdd record ... --relation implements:urn:uuid:...` | Build the graph explicitly |
| Find context | `orchid-sdd recall auth` | Resolve a topic, question, path, alias, or UUID |
| Filter by repo | `orchid-sdd recall auth --repo orchid` | Workspace-scoped retrieval |
| Rebuild indexes | `orchid-sdd index` | After recording/editing artifacts |
| Verify indexes | `orchid-sdd index --check` | CI drift check |
| Validate anchors/docs | `orchid-sdd lint` | Anchors, docblocks, 500-char comments |
| Lint for CI | `orchid-sdd lint --check` | Fail the build on drift |
| Mint an ID | `orchid-sdd new-uuid` | Anchor and docblock identity |

`record` flags: `--type`, `--description`, `--topics`, `--questions`, `--artifact`,
`--code`, `--alias`, `--relation`, `--scope`, `--repo`, `--status`, `--actor`,
`--iteration`, `--id`, `--json`.

### Personas

| Operation | Command | Use case |
|---|---|---|
| List effective personas | `orchid-sdd persona list` | See IDs, authority, enabled state, source |
| Inspect one persona | `orchid-sdd persona show DBA` | Read mission, phases, aliases, instructions |
| Machine-readable | `orchid-sdd persona list --json` | Automation or dashboards |
| Add/override in setup | `orchid-sdd setup --persona UX --persona-file QA.md` | Enable catalog or project persona |
| Project override | `.orchid/personas/<ID>.md` | Durable role customization |

### Steering

| Operation | Command | Use case |
|---|---|---|
| List rules | `orchid-sdd steering list` | Show architecture, style, example, repository, and process rules |
| Filter by phase | `orchid-sdd steering list --phase logic_review` | See only the rules active in a phase |
| Inspect one rule | `orchid-sdd steering show architecture-boundaries` | Read the rule body, authority, phases, and examples |
| Include examples | `orchid-sdd steering show architecture-boundaries --examples` | Print referenced snippets |
| Phase context | `orchid-sdd steering context --phase discovery` | Give the agent the active rule pack and evidence artifact |
| Machine-readable | `orchid-sdd steering list --json` | Automation or dashboards |

### Workspace (multi-repo)

| Operation | Command | Use case |
|---|---|---|
| Enable workspace mode | `orchid-sdd setup --workspace --profile monorepo` | Root contains nested Git repos |
| Stay single-repo | `orchid-sdd setup --single ...` | Ignore nested repos deliberately |
| See repo state | `orchid-sdd status` | Branch, HEAD, dirty count per repo |
| Customize a repo | edit `<repo>/orchid-sdd.yml` (`extends` only) | Per-repo tests, personas, constitution |
| Validate workspace | `orchid-sdd doctor` | Paths, git presence, fragments, personas |
| Baseline memory | `orchid-sdd record --scope project --repo <id> ...` | Cross-iteration repo knowledge |
| Clean-tree guard | `orchid-sdd start "..."` / `--allow-dirty` | Refuse mixed work; override deliberately |
| Freeze Git state | `orchid-sdd close --approve` | Snapshot each repo's HEAD |
| Nested setup | *(refused)* | Run setup at the workspace root |

### Migration

| Operation | Command | Use case |
|---|---|---|
| Scan | `orchid-sdd migrate scan [--json] [--output PATH]` | Read-only topology, knowledge, Git report |
| Backup | `orchid-sdd migrate backup` | Copy legacy assets to `.orchid-migration-bck/<timestamp>/` |
| Scaffold | `orchid-sdd migrate init [--profile P] [--single] [--dry-run]` | Backup + root config + repo overrides + plan |
| Preview | `orchid-sdd migrate init --dry-run` | See the backup/scaffold plan; writes nothing |
| Status | `orchid-sdd migrate status [--json]` | Stage, backup path, repos |
| Finalize | `orchid-sdd migrate finalize` | Validate manifest, write report, `phase: ready` |
| Force overwrite | `orchid-sdd migrate init --force` | Existing config; backup happens first |
| Skip backup | `--skip-backup` | Discouraged; only with an external backup |

### Inspect and recover

| Operation | Command | Use case |
|---|---|---|
| Help | `orchid-sdd --help` | Full command surface |
| Version | `orchid-sdd --version` | Check CLI compatibility |
| Next action | `orchid-sdd status` | Read phase, gates, blockers, next step |
| Override diff | `orchid-sdd diff [--content]` | Compare project files with skill defaults |
| Resume | `orchid-sdd resume` | Replay events after a crash or bad cursor |
| Repair | `orchid-sdd doctor --fix` | Missing dirs, manifest, context |
| Migration stage | `orchid-sdd migrate status` | Resume an interrupted migration |
| Deliberate override | `--force` / `--allow-dirty` | Bypass a check deliberately; document why |

### Typical flows

**First feature in a single repo**

```bash
orchid-sdd setup --profile backend --yes
orchid-sdd doctor
orchid-sdd start "Add passkey login to the customer portal"
orchid-sdd gate pass G1 --evidence intent/prd.md
orchid-sdd discover
# ... assess, plan, build, review ...
orchid-sdd close --approve
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

## Requirements

- Node.js **20+**
- No runtime dependencies

The CLI is stdlib-only Node ESM. The npm package is `orchid-sdd` and installs the
`orchid-sdd` binary. It can also run from `bin/orchid-sdd.mjs`.

```bash
npm install -g orchid-sdd
orchid-sdd --version
```

For a one-off run:

```bash
npx orchid-sdd --version
```

## Quick start

In a target project:

```bash
orchid-sdd setup                       # interactive wizard (TTY)
orchid-sdd setup --profile backend --yes
orchid-sdd doctor
orchid-sdd start "Add passkey login to the customer portal for returning users"
```

`setup` asks for the profile, project name, the four workspace paths, workspace mode, persona
management, and steering. For automation, use `--profile`, `--project`, `--persona`, `--persona-file`, the
four `--*-folder` flags, and the steering flags with `--yes`. Steering defaults are enabled
automatically; edit `steering` in `orchid-sdd.yml` to select more presets or add project
rules later.

### What the wizard asks

The interactive wizard has seven short steps:

| Step | Question | What it means |
|---|---|---|
| 1 | Choose a profile | A starting preset for personas, tests, and constitution rules |
| 2 | Name the project | The name shown in orchid-sdd status and handover output |
| 3 | Choose file locations | Where knowledge, docblocks, constitution, and customizations live |
| 4 | Choose workspace mode | Whether the root contains several Git repositories |
| 5 | Choose who participates | PM, DEV, QE, plus any specialist or custom roles |
| 6 | Choose steering rules | Standing rules for architecture, examples, style, and repository flow |
| 7 | Review and create | Show every choice; nothing is written until you confirm |

Most choices are written to plain YAML and can be changed later; changing the profile itself
does not regenerate dependent files.

Step 6 explains the nine core rules, then offers one optional architecture preset, one
code-style preset, and one repository workflow preset. It also asks whether steering applies
to Discovery and Logic Review. Enter accepts the default; type `none` to skip an optional
preset. For a multi-language project, add more `--steering-preset` flags or list the chosen
style presets in `orchid-sdd.yml`.

Agents and CI should skip the prompts and pass explicit answers:

```bash
orchid-sdd setup \
  --yes \
  --profile backend \
  --project acme \
  --steering-preset architecture-hexagonal \
  --steering-preset repository-trunk-based \
  --json
```

Use `--no-steering` to disable steering, `--no-steering-discovery` or
`--no-steering-logic-review` to remove it from one phase, and `--json` to print a
machine-readable setup summary. `--yes` skips the wizard whenever an agent runs setup.

From this repository without installing:

```bash
node bin/orchid-sdd.mjs --root /path/to/project setup --yes --profile backend
```

`setup` generates:

```text
orchid-sdd.yml
.orchid/{state.json,constitution/,personas/,steering/,custom/}
.knowledge/{manifest.jsonld,events/,index/,context/,iterations/,input/,run-log/}
docs/knowledge/docblocks/
AGENTS.md (managed section)
.gitignore (managed section)
.github/workflows/orchid-sdd.yml
ORCHID-SDD.md
```

## Agent adapters

orchid-sdd has one contract and one deterministic CLI. Harness support is packaging, not a fork.

| Harness | Loaded contract | Invocation |
|---|---|---|
| **OpenCode** | Root `SKILL.md` + `commands/orchid-sdd.md` | `/orchid-sdd <command>` |
| **Claude Code plugin** | `.claude-plugin/plugin.json`, `claude-skills/orchid-sdd/SKILL.md`, `claude-commands/run.md` | `/orchid-sdd:run <command>` |
| **Vercel Agent Skills** | Root `SKILL.md` + `skills.sh.json`; local Node/Git required | `npx skills add <owner>/<repo> --skill orchid-sdd` |
| **Any other agent / CI** | `SKILL.md` + the `orchid-sdd` CLI | Explicit CLI call |

### Install the skill from npm

The npm package is `orchid-sdd`. It can place the portable skill and its local CLI into an
agent's skill directory explicitly; there is no `postinstall` side effect:

```bash
# Project-scoped OpenCode skill + /orchid-sdd command
npx orchid-sdd skill install --agent opencode

# Project-scoped Claude Code skill; invoke /orchid-sdd
npx orchid-sdd skill install --agent claude-code

# Global installations
npx orchid-sdd skill install --agent opencode --global
npx orchid-sdd skill install --agent claude-code --global

# Generic Agent Skills layout (.agents/skills)
npx orchid-sdd skill install --agent generic
```

Options: `--global` for a user-wide install, `--dest DIR` for a custom skill directory,
`--force` to replace an existing install, `--dry-run` to preview, and `--json` for
machine-readable output. Each install copies `SKILL.md`, the CLI, `.skill` defaults, and
`docs/personas` into a self-contained skill directory.

| Agent | Project destination | Global destination |
|---|---|---|
| OpenCode | `.opencode/skills/orchid-sdd` | `~/.config/opencode/skills/orchid-sdd` |
| Claude Code | `.claude/skills/orchid-sdd` | `~/.claude/skills/orchid-sdd` |
| Generic | `.agents/skills/orchid-sdd` | `~/.agents/skills/orchid-sdd` |

The OpenCode install also writes `.opencode/commands/orchid-sdd.md` (global:
`~/.config/opencode/commands/orchid-sdd.md`); the Claude Code install relies on the
project/personal skill command and does not overwrite `.claude/commands`. `--dest` copies
the skill only; it does not write an agent command file.

The copied skill includes its own CLI under `bin/`, but it does not add that directory to
`PATH`. For agents that do not expose the skill base path, either install the package
globally (`npm install -g orchid-sdd`) or invoke
`node <skill-dir>/bin/orchid-sdd.mjs`.

### Claude Code plugin

The repository root is a valid Claude Code plugin. The plugin skill is a thin pointer to
the canonical `SKILL.md`; the CLI remains the only implementation.

```bash
claude plugin validate .
claude --plugin-dir .          # load this checkout for one session
```

Then invoke:

```text
/orchid-sdd:run status
/orchid-sdd:run start "Add passkey login"
```

Claude Code namespaces plugin commands, so the plugin entry is `/orchid-sdd:run`; bare
`/orchid-sdd` remains the OpenCode/standalone entry. If a bare Claude Code command is
mandatory, install the root skill as a project/personal skill instead of a plugin.

For marketplace distribution, the repository includes
`.claude-plugin/marketplace.json`. After publishing:

```bash
claude plugin marketplace add <owner>/<repo>
claude plugin install orchid-sdd@orchid-sdd
```

The plugin skill, `/orchid-sdd:run` command, and portable `SKILL.md` all set
`disable-model-invocation: true`; the root `SKILL.md` guard also accepts
`/orchid-sdd:run`. The plugin is therefore explicit-only and never auto-triggers.

**Scope:** the plugin has a top-level `bin/` directory, which Claude Code uses to expose
the CLI on the Bash `PATH`. Current claude.ai Chat and Cowork builds refuse plugins with a
top-level `bin/`, so this adapter is intentionally **Claude Code-only**. The portable
`SKILL.md` + CLI path remains available for OpenCode and other agents. The plugin cache is
read-only; all state is written under the target project.

### OpenCode and other coding agents

OpenCode continues to use the root `SKILL.md` and `commands/orchid-sdd.md`; nothing under
`.claude-plugin/`, `claude-skills/`, or `claude-commands/` is required. Any other agent can load
`SKILL.md` and either put `bin/orchid-sdd` on `PATH` or call
`node bin/orchid-sdd.mjs`. The Claude Code package is additive.

### Vercel Agent Skills

The repository is discoverable by the Vercel `skills` CLI from the root `SKILL.md`:

```bash
npx skills add <owner>/<repo> --skill orchid-sdd -a opencode
```

`skills.sh.json` is the repository-page configuration that groups the root skill for the
skills.sh catalog. The CLI copies the full package, so the local CLI and `.skill` defaults
remain available. This works with local coding agents that have Node, shell, filesystem, and
Git access; it is not a hosted-agent or edge-runtime adapter. Explicit-only behavior depends
on the host honoring `disable-model-invocation`; use a host with invocation control when the
guard must be enforced.

## How it works

### Two layers

| Layer | Contains | Owner |
|---|---|---|
| **Skill package** | `SKILL.md`, `commands/`, `.skill/` defaults, `cli/` | Versioned with orchid-sdd; never contains project data |
| **Project workspace** | `orchid-sdd.yml`, `.orchid/`, `.knowledge/`, docblocks, code | Your repository/workspace |

`setup`/`migrate` provision the project workspace from the defaults; the skill package is
upgraded independently. Project overrides live under `.orchid/` and never edit the skill
package. The OpenCode command file and Claude Code plugin are thin adapters; other hosts
use `SKILL.md` plus the CLI.

### The loop

```text
setup → start → discover → assess → plan → build → review → close → handover
  G0      G1        G2        G3      G4      G5       G6       G7       G8
```

Each phase has a gate. The CLI records the gate, checks referenced evidence paths when
provided, or accepts a note as the reason. The agent is responsible for the substance.
Gates G1, G3, G4, G6, G7, and G8 require human approval; G2 requires it only if answers
changed scope.

Steering rules are resolved per phase. `discover` and `review` print the active rules and
point to `discovery/steering.md` or `reviews/steering-review.md`; the gate event records the
rule IDs that were active. The CLI validates references and examples, but the agent owns the
semantic verdict.

### Who does what

| Actor | Responsibilities |
|---|---|
| **Human** | Approve scope and gates, settle trade-offs, accept risk, final judge |
| **Agent / orchestrator** | Product/technical analysis, Gherkin, negotiation, prompt planning, code changes via subagents, adversarial CR, logic review, handover; Git worktrees/merges |
| **CLI** | Config validation, setup/migration scaffold, state + events, manifest/index projection, `record`/`recall`/`lint`, steering resolution, gate recording, workspace validation, iteration snapshots |
| **Subagents** | One implementation prompt or one review each, in a fresh context |

The CLI **never invents semantic memory** and never edits code. During normal iterations,
the agent never edits `.knowledge/**` or the manifest by hand; it writes through `record`.
Migration is the deliberate exception, where legacy material is reorganized after backup.

### The memory loop

```text
agent → `orchid-sdd record` → events/*.jsonl → manifest.jsonld + index/*.json → `recall` → agent
code anchor → `recall` → docblock → ADR/spec/plan
```

Every memory node has a UUIDv7, a ≤160-char description, 3–7 topics, provenance, and optional
relations. Nodes are either **iteration-scoped** (default) or **project-scoped**
(`--scope project`), the latter surviving across iterations and migrations.
Significant code carries a one-line `ORCHID-MEM: <uuid>` anchor; the full explanation lives
in a UUID-named docblock under `docblocks_folder`. `orchid-sdd lint` checks that anchors,
docblocks, nodes, and comment lengths agree.

### Prompts and review

The agent decomposes accepted decisions into prompt contracts (one reviewable outcome,
dependencies, disjoint write scopes, tests, acceptance commands). The CLI records state,
indexes the plan and matrix, but does not execute prompts. Implementation and adversarial
review run in separate agents; code review is independent, and the PM logic review verifies
behaviour against PRD/TRD/Gherkin. `close` archives transients and snapshots state; Git
merges remain orchestrator-driven.

### Workspace and migration

- **Workspace mode** keeps one orchid-sdd project at the root, with nested repos as units
  of work and small `extends` config fragments (§ Workspace mode).
- **Migration** converts an existing project/workspace: scan → backup → scaffold → LLM
  reconstruction → finalize (§ Migration).

---

## Configuration reference

The root `orchid-sdd.yml` is generated by `setup`/`migrate init` and validated by the CLI;
the published contract is `.skill/schemas/config.schema.json`. Unknown keys are errors.
Paths are relative to the project root and must not leave it. After editing, run
`orchid-sdd doctor`; use `doctor --fix` if it reports a stale config hash.

**“Acted on by” legend**

| Value | Meaning |
|---|---|
| **CLI** | The command reads, validates, or enforces it now |
| **Agent** | The orchestrator/`SKILL.md` consumes it; the CLI stores and validates it |
| **Policy** | A documented guardrail/convention; the current CLI does not mechanically enforce it |

### Project and paths

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `version` | `1` | Config schema version | CLI |
| `project.name` | project directory | Project identifier used in manifests | CLI |
| `project.profile` | `custom` (detected at setup) | `backend`, `frontend`, `infra`, `monorepo`, `custom`; setup preset for personas/tests/constitution | Setup |
| `project.default_branch` | `main` | Release target in agent workflows | Agent |
| `workspace.enabled` | `false` | Root-owned multi-repo mode | CLI/Agent |
| `workspace.repos` | `[]` | Registry of nested repos (see workspace fields) | CLI/Agent |
| `knowledge_folder` | `.knowledge` | Root memory: manifest, events, indexes, iterations, input | CLI |
| `docblocks_folder` | `docs/knowledge/docblocks` | UUID-named Markdown docblocks | CLI |
| `constitution_folder` | `.orchid/constitution` | Project constitution and overrides | CLI/Agent |
| `customizations_folder` | `.orchid/custom` | Template overrides mirroring `.skill/` | CLI (`diff`)/Agent |

Changing a path after data exists means moving the directory and keeping manifest artifact
references valid. Prefer setting paths at setup/migration time (`--knowledge-folder`, etc.).
Changing `project.profile` later does not regenerate personas, tests, or the profile
constitution pack; edit those surfaces directly or rerun setup deliberately.

### Knowledge and docblocks

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `knowledge.manifest` | `manifest.jsonld` | Generated root manifest filename | CLI |
| `knowledge.iteration_naming` | `{date}-{slug}` | Iteration directory convention; current CLI uses `YYYY-MM-DD-slug` | Policy |
| `knowledge.indexing` | topics, questions, code_anchors, requirements, dependencies, timeline, repos | Declared index set; the CLI currently writes the full built-in set (including `supersession` and `repos`) | CLI |
| `knowledge.bus_expiry_days` | `7` | Default TTL for ephemeral prompt messages | Policy |
| `knowledge.commit` | `true` | VCS policy: commit text knowledge, ignore live scratch | Policy |
| `docblocks.enabled` | `true` | Whether the project expects docblocks | Policy |
| `docblocks.layout` | `uuid` | Docblock filenames are memory UUIDs (`<uuid>.md`) | CLI (lint) |
| `docblocks.granularity` | `symbol` | `symbol` or `file` docblock granularity | Policy |
| `docblocks.max_behavior_comment_chars` | `500` | Max length of an inline behaviour comment (anchor excluded) | CLI (lint) |
| `docblocks.anchor_prefix` | `ORCHID-MEM` | Anchor convention; the linter currently matches `ORCHID-MEM` | Policy |
| `docblocks.require_docblock_for_anchor` | `true` | Every anchor must have a docblock | CLI (lint) |

### Personas

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `personas.enabled` | `[PM, DEV, QE]` | Root persona cast; disabled personas cannot be phase-cast or tagged | CLI/Agent |
| `personas.search_paths` | `.orchid/personas`, `domains/*/personas` | Project persona directories; one-level `*` | CLI |
| `personas.overrides.<ID>.authority` | persona default | `advisory` or `blocking` | CLI/Agent |
| `personas.overrides.<ID>.phases` | persona default | Phase list override | CLI/Agent |
| `personas.overrides.<ID>.file` | — | Load a persona file for this ID (relative to project root) | CLI |

Project personas are merged by ID over the skill defaults; `aliases` and `extends` resolve
through the same map. Use `orchid-sdd persona list` to see effective values and sources.

### Constitution

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `constitution.layers` | `[skill:default, profile, project]` | Intended resolution order: skill → profile pack → project | Agent |
| `constitution.require_adr_for_deviation` | `true` | A deviation from the constitution needs an ADR | Agent/Policy |
| `constitution.lock` | `true` | Policy flag: treat constitution changes as locked unless explicitly approved; no lock file is generated | Policy |

The project constitution lives at `constitution_folder`; `.orchid/constitution/_profile/`
contains the generated profile pack. Compose with `@include`; do not edit the skill default.

### Steering

Steering is the phase-aware layer for architecture, examples, language-agnostic style,
principles, and repository rules. The constitution remains the baseline for how code is
written; steering names the explicit project decisions that Discovery and Logic Review must
check. Rules are Markdown files with front matter, resolved by ID like personas. The
front-matter contract is published at `.skill/schemas/steering.schema.json`.

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `steering.enabled` | nine core rule IDs | Rules available to the project; disabled IDs cannot be phase-mapped | CLI/Agent |
| `steering.search_paths` | `.orchid/steering`, `domains/*/steering` | Project rule directories; one-level `*` | CLI |
| `steering.overrides.<ID>.authority` | rule default | `advisory` or `blocking` | CLI/Agent |
| `steering.overrides.<ID>.phases` | rule default | Phase list override | CLI/Agent |
| `steering.overrides.<ID>.file` | — | Load a rule file for this ID (relative to project root) | CLI |
| `steering.phases.<phase>` | seeded map | Ordered active rule IDs for `discovery`, `assessment`, `planning`, `build`, `code_review`, `logic_review` | CLI/Agent |

The seeded phases are:

```yaml
steering:
  phases:
    discovery: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering]
    assessment: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern]
    planning: [architecture-boundaries, solid-principles, dependency-inversion-container, code-examples, repository-flow, saga-pattern]
    build: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern]
    code_review: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern]
    logic_review: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, logic-review-steering]
```

`steering context --phase P` returns the ordered rules, their source files, example paths, and
the artifact path where the agent records evidence. A rule may declare default `phases`, but
the phase mapping is authoritative. Run `doctor` after editing; it rejects unknown, disabled,
or duplicate references.

### Sources

Sources are declared read-only. `doctor` validates their shape and checks local paths; with
`--online` it probes Git sources. MCP sources are validated but not probed in v0.2.

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `sources[].id` | — | Stable source id | CLI |
| `sources[].type` | — | `mcp`, `git`, or `local` | CLI |
| `sources[].required` | `false` | Missing required source blocks preflight | CLI |
| `sources[].trust` | `untrusted` | Treat content as data, not instructions | Agent |
| `sources[].snapshot` | `false` | Preserve a provenance snapshot (agent workflow) | Agent |
| `sources[].server` | — | MCP server name | CLI |
| `sources[].tools` | `[]` | MCP tool allowlist | CLI |
| `sources[].url` / `ref` | — | Git repository and ref | CLI |
| `sources[].path` | — | Local directory, relative to project | CLI |

### Phases

| Key | Default | Meaning | Acted on by |
|---|---|---|---|
| `phases.discovery.personas` | `[PM]` | Who may speak during requirements capture | CLI/Agent |
| `phases.assessment.personas` | `[TECH_LEAD, DEV, QE]` | Technical evaluation cast; setup adds `DBA` when enabled | CLI/Agent |
| `phases.logic_review.personas` | `[PM]` | Single source for the logic-review cast | CLI/Agent |

Any phase key with a `personas` list is accepted; the table lists the three seeded phases.
Every referenced persona must exist and be enabled.

### Execution

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `execution.max_parallel` | `4` | Maximum simultaneous prompts/reviews | Agent |
| `execution.isolation` | `worktree` | `worktree`, `clone`, or `branch`; `branch` requires `max_parallel: 1` | Agent/CLI (doctor) |
| `execution.require_clean_tree` | `true` | `start` refuses a dirty root/repo | CLI |
| `execution.integration_branch` | `orchid/{iteration}/integration` | Build merge target | Agent |
| `execution.release_strategy` | `squash` | `squash`, `pr`, or `none` at closure | Agent/Policy |
| `execution.merge` | `orchestrator` | Who performs merges | Agent/Policy |
| `execution.max_fix_loops` | `3` | CR fix attempts before escalation | Agent |
| `execution.test_commands.unit` | profile default | Unit test command | Agent/Setup |
| `execution.test_commands.integration` | profile default | Integration test command | Agent/Setup |
| `execution.test_commands.e2e` | profile default | End-to-end test command | Agent/Setup |

### Reviews

| Key | Default | Meaning / values | Acted on by |
|---|---|---|---|
| `reviews.adversarial.enabled` | `true` | Enable independent adversarial CR | Agent |
| `reviews.adversarial.independent_context` | `true` | Reviewer must not share the implementer context | Agent |
| `reviews.adversarial.mode` | `auto` | `per_prompt`, `batch`, or `auto` (batch for S) | Agent |
| `reviews.adversarial.min_reviewers` | `1` | Floor for reviewers | Agent |
| `reviews.adversarial.by_rigor` | `{S:1, M:1, L:2}` | Reviewer count per rigor | Agent |
| `reviews.adversarial.block_on` | `[critical, high]` | Severities that block merge | Agent |
| `reviews.adversarial.routing` | `{}` | Glob → persona IDs; `doctor` validates enabled personas | CLI/Agent |
| `reviews.logic.against` | `[prd, trd, gherkin]` | Artifacts the PM logic review checks | Agent |
| `reviews.logic.max_loops` | `2` | Logic-review iterations before follow-up/waiver | Agent |

### Budgets

| Key | Default | Meaning | Acted on by |
|---|---|---|---|
| `budgets.unit` | `tokens` | Unit used by the estimate/report | Policy |
| `budgets.per_iteration_warn` | `250000` | Warn threshold | Agent/CLI (validation) |
| `budgets.per_iteration_stop` | `600000` | Stop threshold; override only with explicit human approval | Agent/Policy |
| `budgets.per_prompt_warn` | `40000` | Per-prompt warning | Agent/Policy |

`doctor` checks that `warn < stop`. The orchestrator is responsible for respecting the
thresholds; the CLI does not currently meter tokens.

### Governance and telemetry

| Key | Default | Meaning | Acted on by |
|---|---|---|---|
| `governance.approvals` | intent, assessment, plan, logic_review, closure, handover | Human sign-off points | Agent/Policy |
| `governance.questionnaires` | `md` | Questionnaire format | Agent |
| `governance.max_questions_per_round` | `7` | Questionnaire batching limit | Agent |
| `governance.adr_required_for` | `[breaking_change, new_dependency, constitution_deviation, data_deletion]` | ADR triggers | Agent/Policy |
| `governance.title_max_chars` | `500` | Maximum title length | CLI (`start`) |
| `governance.rigor` | `auto` | `auto`, `light` (S), `standard` (M), `full` (L); `auto` starts at M and the agent may propose another level at G1; default when `start` has no `--rigor` | CLI |
| `telemetry.run_log` | `<knowledge>/run-log/` | Run metadata location | Setup/Policy |
| `telemetry.redact` | secrets, tokens, pii | Redaction policy for artifacts/logs | Policy |

### Workspace repo entries

| Field | Required | Meaning | Acted on by |
|---|---|---|---|
| `id` | yes | Stable lowercase repo id used by `record --repo`, `recall --repo`, and snapshots | CLI/Agent |
| `path` | yes | Repo path relative to the workspace root; must exist | CLI |
| `profile` | no (`custom`) | Per-repo profile preset | Setup/Agent |
| `enabled` | no (`true`) | Skip a repo without deleting its entry | CLI/Agent |
| `git` | no (`true`) | Expect `.git`; doctor errors if missing | CLI |
| `config` | no (`orchid-sdd.yml`) | Repo fragment filename | CLI |
| `test_commands` | no | Per-repo unit/integration/e2e commands | Agent |
| `personas` | no | Additional personas for that repo | CLI/Agent |
| `constitution` | no | Repo-relative constitution files; existence checked | CLI/Agent |
| `sources` | no | Repo-specific source declarations | CLI/Agent |

Repo fragment (`<repo>/orchid-sdd.yml`) allowed keys: `extends` (required), `project`,
`execution`, `personas`, `constitution`, `sources`. It cannot set root-owned paths or
`workspace`.

### Resolution order

```text
Config:      root orchid-sdd.yml is authoritative; workspace.repos[] declares repo
             metadata and repo fragments are validated repo policy for the agent
Personas:    inline overrides → project files → search_paths → skill defaults
Steering:    inline overrides → project files → search_paths → skill defaults
Constitution: project → profile pack → skill default (agent-level)
Templates:   .orchid/custom → .skill defaults (agent-level; `diff` audits)
```

The CLI does not merge repo fragments into the root config. It validates them and leaves
the fragment as the repo-specific policy the agent reads for work in that repo.

## Customization

orchid-sdd is designed to be customized without forking the skill. The project owns its
configuration, personas, steering, constitution, templates, and workspace overrides; the skill
package owns the defaults and the CLI.

### Customization surfaces

| Surface | Where | How to customize | Consumed by |
|---|---|---|---|
| Project settings | `orchid-sdd.yml` | Edit values; `orchid-sdd doctor` validates | CLI + agent |
| Artifact paths | `knowledge_folder`, `docblocks_folder`, `constitution_folder`, `customizations_folder` | Setup flags or config; move data deliberately | CLI |
| Personas | `.orchid/personas/<ID>.md` + `personas.enabled` | Create a file, enable the ID, set authority/phases | CLI + agent |
| Persona overrides | `personas.overrides.<ID>` | `authority`, `phases`, or `file` | CLI + agent |
| Steering rules | `.orchid/steering/*.md` + `steering.enabled` | Create a rule, enable it, map it to phases | CLI + agent |
| Steering overrides | `steering.overrides.<ID>` | `authority`, `phases`, or `file` | CLI + agent |
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

### Profiles

`project.profile` is a **setup preset**, not a runtime switch. The bundled profiles are
`backend`, `frontend`, `infra`, `monorepo`, and `custom`; each seeds personas, test
commands, and constitution includes. Choose one at setup. Changing the value later does
not regenerate those files; edit the dependent surfaces or rerun setup deliberately.
The profile ID set is fixed; use `custom` for project-specific needs and customize the
config, personas, and constitution directly.

### Custom personas

Create `.orchid/personas/QA.md`:

```md
---
id: QA
name: Quality Advocate
mission: Challenge vague acceptance criteria and weak test evidence.
phases: [assessment, code_review]
authority: blocking
tags: [quality, testing]
aliases: []
---
# Operating instructions
- Require a failing test before a bug fix.
- Challenge assertions that cannot fail.
```

Then enable it in `orchid-sdd.yml`:

```yaml
personas:
  enabled: [PM, DEV, QE, QA]
```

Run `orchid-sdd doctor` and `orchid-sdd persona list`. The shipped catalog also includes
`TECH_LEAD`, `UX`, `DBA`, `DEVOPS`, `ARCHITECT`, and `SECURITY`; `PM` is the unified
PM/PO role and `PO` resolves as its alias. To override an existing persona, use the same
`id` in `.orchid/personas/<ID>.md`; no config change is needed if it is already enabled.
`extends`, `aliases`, authority, phases, and per-repo persona additions are supported.

You can also point at a file explicitly:

```yaml
personas:
  overrides:
    DEV:
      file: .orchid/personas/custom-dev.md
      authority: blocking
```

### Shipped persona profiles

Every shipped persona has two layers:

- a concise **active contract** in `.skill/personas/<ID>.md`, loaded when the persona acts;
- a detailed **reference dossier** in [`docs/personas/`](docs/personas/), read when the role
  is active or when you are configuring a project override.

| Persona | Default | Authority | Detailed profile |
|---|---|---|---|
| PM / PO | Yes | Blocking on business meaning | [`PM.md`](docs/personas/PM.md) |
| DEV | Yes | Advisory | [`DEV.md`](docs/personas/DEV.md) |
| QE | Yes | Blocking on test gaps | [`QE.md`](docs/personas/QE.md) |
| TECH_LEAD | Optional | Blocking on feasibility | [`TECH_LEAD.md`](docs/personas/TECH_LEAD.md) |
| ARCHITECT | Optional | Advisory | [`ARCHITECT.md`](docs/personas/ARCHITECT.md) |
| DBA | Optional | Blocking on data changes | [`DBA.md`](docs/personas/DBA.md) |
| DEVOPS | Optional | Blocking on infrastructure | [`DEVOPS.md`](docs/personas/DEVOPS.md) |
| SECURITY | Optional | Blocking on high findings | [`SECURITY.md`](docs/personas/SECURITY.md) |
| UX | Optional | Advisory | [`UX.md`](docs/personas/UX.md) |

The dossiers contain ownership boundaries, phase behavior, decision rights, required inputs
and outputs, role-specific questions, review rubrics, anti-patterns, handoffs, triggers, and
example findings. They are reference material, not additional gate authority.

### Project constitution

The project constitution lives at `constitution_folder` (default `.orchid/constitution`).
The generated `constitution.md` already includes the skill default and profile pack; add
project includes and rules below them:

```md
@include guidelines/api.md
@include testing/contracts.md

## Project rules
- All public API changes require an OpenAPI diff.
```

A deviation from a constitution rule requires an ADR (`constitution.require_adr_for_deviation`).
The generated `_profile/` pack is setup-owned; put team edits in the project folder, not there.

### Steering rules

Steering rules are **selectable** contracts. The constitution applies everywhere; a steering
rule is an explicit project decision that can be enabled, assigned to phases, and cited at a
gate. Each rule is a Markdown file with YAML front matter:

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

Kinds are `architecture`, `code_style`, `example`, `repository`, `process`, and `custom`.
`authority` is `advisory` or `blocking`. The body is free Markdown; the sections `Rule`,
`Checks`, `Evidence`, and `Exceptions` are the recommended shape. Examples are paths relative
to the rule file. A project file with the same `id` overrides a default; `extends` is optional.
The generated `.orchid/steering/README.md` is a starter.

The nine core defaults are:

| Rule | Kind | Default phases | What it steers |
|---|---|---|---|
| `architecture-boundaries` | architecture | discovery → logic review | Inward dependencies and explicit ports/adapters |
| `solid-principles` | architecture | discovery → logic review | SRP, OCP, LSP, ISP, and DIP applied pragmatically |
| `dependency-inversion-container` | architecture | discovery → logic review | Explicit composition roots and optional DI containers |
| `code-style` | code_style | discovery, assessment, build, code review, logic review | Any language’s linter, formatter, type checker, and static analysis |
| `code-examples` | example | discovery → logic review | Small, current snippets in the project’s language |
| `repository-flow` | repository | discovery → logic review | Branch, review, merge, and release flow |
| `saga-pattern` | architecture | discovery → logic review | Distributed steps, compensation, idempotency, and recovery |
| `discovery-steering` | process | discovery | Turns constraints into requirements and acceptance evidence |
| `logic-review-steering` | process | logic review | Verifies every active rule against integrated behavior |

The shipped examples cover TypeScript, Go, Python, PHP, Rust, Java, and Ruby under
`.skill/steering/examples/`; the `code-examples` rule lists all of them.

Optional presets live in `.skill/steering/presets/`:

- architecture: `architecture-hexagonal`, `architecture-onion`, `architecture-clean`, `architecture-ddd`, `architecture-cqrs`, `architecture-event-driven`
- code style: `code-style-typescript`, `code-style-go`, `code-style-python`, `code-style-php`, `code-style-rust`, `code-style-java`, `code-style-ruby`, `code-style-sonarqube`
- repository: `repository-trunk-based`, `repository-gitflow`, `repository-xp-mainline`

Enable at most one architecture preset and one repository preset. Code-style presets may be
combined when the project uses several languages; enable only tools the project actually
enforces. The core `repository-flow` defers to an active repository preset; if you select
`repository-xp-mainline`, it changes the branch flow and requires matching
`execution`/release configuration plus an ADR.

**Suggested Discovery rules.** Add these to your project or use the shipped
`discovery-steering` rule: boundary fit (which ports/contracts are touched), repository fit
(branch/release/environment impact), style evidence (which gates will prove compliance),
example fit (closest approved shape), and conflict check (requirements that contradict a
blocking rule). Record them in `discovery/steering.md`; G2 can cite that file.

**Suggested Logic Review rules.** Use `logic-review-steering`: rule coverage (every active
blocking rule has a verdict), evidence freshness (integration branch, not a local branch),
scope integrity (no deleted tests or hidden suppressions), exception integrity (waivers name
owner and expiry), and behavioral fit (the delivered behavior still matches the requirement).
Record them in `reviews/steering-review.md`; G6 can cite that file.

### Template overrides

Templates are identified by their **logical path** inside `.skill/`. Override one by placing
a file at the same path under `customizations_folder`. The shipped artifact set is PRD, TRD,
Gherkin, questionnaire, ADR, prompt, CR, handover, and tour; profile presets are JSON under
`.skill/templates/profiles/`. With default paths:

```text
.skill/templates/artifacts/prd.md                  →  .orchid/custom/templates/artifacts/prd.md
.skill/templates/artifacts/prompt.md               →  .orchid/custom/templates/artifacts/prompt.md
.skill/templates/artifacts/cr.md                   →  .orchid/custom/templates/artifacts/cr.md
```

`orchid-sdd diff --content` shows what differs from the skill defaults. Skill upgrades do
not overwrite project files; merge changes deliberately. In v0.2, overrides are file-level:
`extends`/`merge` front matter is a design convention, not automatically resolved by the
CLI. Keep project overrides self-contained and use `diff` to audit them.

### Customization recipes

| I want to… | Do this |
|---|---|
| Add a persona | Create `.orchid/personas/QA.md`, add `QA` to `personas.enabled`, run `doctor` |
| Override a persona | Create `.orchid/personas/DEV.md` with `id: DEV`; tune authority/phases/body |
| Inspect full role detail | Read `docs/personas/<ID>.md` and run `persona show <ID>` |
| Add a persona to one repo | Create the file, add the ID to the root `personas.enabled`, then list it in `workspace.repos[].personas` for repo use |
| Change test commands | Edit `execution.test_commands` at root or in the repo fragment |
| Add a constitution rule | Add a file under `constitution_folder` and `@include` it |
| Add a steering rule | Create `.orchid/steering/<id>.md`, add the ID to `steering.enabled` and the relevant `steering.phases` lists |
| Override a steering rule | Create `.orchid/steering/<id>.md` with the same `id`; `diff` shows the override |
| Apply rules to Discovery | Put the IDs in `steering.phases.discovery`; write `discovery/steering.md` |
| Apply rules to Logic Review | Put the IDs in `steering.phases.logic_review`; write `reviews/steering-review.md` |
| Override a template | Put it under `.orchid/custom/<logical-path>`; run `diff --content` |
| Batch CR for small work | Set `reviews.adversarial.mode: batch` |
| Route reviews by path | Add globs under `reviews.adversarial.routing` |
| Change reviewer counts | Edit `reviews.adversarial.by_rigor` |
| Add a workspace repo | Add `workspace.repos[]` entry and a repo `orchid-sdd.yml` with `extends` |
| Move knowledge before iteration 1 | Use setup path flags, or edit config and move the directory |
| Convert legacy knowledge | `migrate scan` → `migrate init` → agent prompts → `migrate finalize` |
| See effective values | `doctor`, `status`, `persona list`, `steering list`, `diff`, `index --check`, `lint --check` |
| Run checks in CI | `doctor --ci`, `lint --check`, `index --check` |

### Example: a per-repo override

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

The root config remains authoritative for paths, knowledge, workspace, and audit. The
fragment only adjusts allowed fields.

### Upgrade and safety rules

- Do not edit `.skill/` in a target project; it is the skill package, not project data.
- Project overrides live in `.orchid/` and survive skill upgrades.
- `setup --force` overwrites `orchid-sdd.yml`, rewrites repo fragments, and recreates
  `.orchid/state.json` (resetting the lifecycle); back up or use `diff` first.
- `migrate init` always backs up legacy assets before writing (unless `--skip-backup`).
- After config edits: `doctor` (and `doctor --fix` for the config hash).
- After persona edits: `persona list` and `doctor`.
- After anchor/docblock edits: `lint`.
- After artifact edits: `index --check`.
- After skill upgrades: `diff` to check overrides against the new defaults and merge deliberately.

## Workspace mode (multi-repo)

If the root contains nested Git repositories, setup detects them and enables **workspace
mode** (use `--workspace` to force it, `--single` to opt out). orchid-sdd stays at the root:
one `.knowledge`, one state, one manifest, one audit.

```bash
orchid-sdd setup --workspace --profile monorepo
```

The root config registers every repo:

```yaml
workspace:
  enabled: true
  repos:
    - id: orchid
      path: workspace-py/orchid
      profile: backend
      test_commands:
        unit: ".venv/bin/python -m pytest tests/ -x"
```

Each repo receives a small `orchid-sdd.yml` override with `extends` (no nested knowledge,
no standalone setup). The CLI validates these fragments; they stay repo-specific policy for
the agent and are not merged into the root config. For example:

```yaml
extends: ../../orchid-sdd.yml
project:
  name: orchid
  profile: backend
execution:
  test_commands:
    unit: ".venv/bin/python -m pytest tests/ -x"
```

`orchid-sdd status` shows each repo's branch, HEAD, and dirty state. `start` enforces a
clean tree across the root and enabled repos; use `--allow-dirty` deliberately.
`record --scope project --repo <id>` creates baseline memory that persists across iterations.
`close` records each repo's HEAD in the iteration snapshot.

## Migration

`migrate` converts an existing project, repo, or workspace into an orchid-sdd project.
It is intentionally **agent-driven**: the CLI scans, backs up, and scaffolds; an LLM agent
reconstructs memories from Git/file history and existing specs.

```bash
orchid-sdd migrate scan                    # read-only topology/knowledge report
orchid-sdd migrate backup                  # copy legacy assets to .orchid-migration-bck/
orchid-sdd migrate init --profile monorepo # backup + root config + repo overrides + plan
orchid-sdd migrate status
orchid-sdd migrate finalize                # after the agent records memories
```

`init` writes `MIGRATION.md`, `.orchid/migration/{scan.json,PLAN.md,prompts/,STATUS.json}`,
and a backup at `.orchid-migration-bck/<timestamp>/` with `BACKUP.json` and restore notes.
Legacy assets (`.knowledge`, `AGENTS.md`, config/state, `.serena/memories`, repo
`AGENTS.md`/`.knowledge`) are copied, never deleted. The plan instructs the agent to:

1. inventory ADRs/specs/plans/prompts/progress;
2. seed `Decision`/`Requirement`/`Scenario` nodes with `--scope project`;
3. reconstruct `CodeUnit` nodes and anchors from Git history/code;
4. validate with `index`, `lint`, `doctor`, then `migrate finalize`.

`finalize` moves the project to `phase: ready`; the next `orchid-sdd start` is the first
real iteration.

## Lifecycle

```text
setup -> start -> discover -> assess -> plan -> build -> review -> close -> handover
         G1        G2         G3       G4      G5       G6       G7       G8
```

Gates require evidence (`--evidence`) or a reason (`--note`):
`orchid-sdd gate pass G1 --evidence intent/prd.md`.

### Gate execution and approval

A gate is **not** passed automatically. `gate pass|fail` is an explicit CLI action that
records the decision and evidence. The agent normally executes it; a human authorizes the
gates marked below. The CLI cannot verify who invoked it, so the process must not treat
"the command succeeded" as proof of human approval.

| Gate | Authorization | Normal executor |
|---|---|---|
| G0 Setup | Setup | `setup` marks it passed |
| G1 Intent | Human | Agent after approval |
| G2 Discovery | Human only if scope changed | Agent after the consistency check |
| G3 Assessment | Human | Agent after approval |
| G4 Plan | Human | Agent after approval |
| G5 Prompt done | Agent/reviewer | Agent after tests and CR |
| G6 Logic review | Human | Agent after PM review |
| G7 Closure | Human | Agent/developer after evidence |
| G8 Handover | Human | Agent/developer after verification |

The agent asks before a human gate and only runs the command after an explicit answer:

```text
Agent: "G1 evidence is ready: intent/prd.md. Do you approve?"
Human: "Approved."
Agent: orchid-sdd gate pass G1 --evidence intent/prd.md
```

Phase commands do not auto-pass their predecessor. For example, `discover` fails until G1 is
passed and `assess` fails until G2 is passed. If no agent is running, the developer runs the
same commands manually:

```bash
orchid-sdd gate status
orchid-sdd gate pass G1 --evidence intent/prd.md
orchid-sdd discover
```

Evidence is checked for existence, not semantic quality. Do not pass a gate on a promise;
use `gate fail` with a reason when evidence is missing or unacceptable.

The agent-facing workflow is in `SKILL.md`; the CLI enforces state, gates, memory, and
validation, while the agent orchestrates subagents, prompts, and reviews.

## Memory in one minute

- Every memory is a node with a UUIDv7, a ≤160-char description, and 3–7 topics.
- Record nodes with `orchid-sdd record`; never edit `.knowledge/**` by hand.
- Significant code carries `ORCHID-MEM: <uuid>` anchors.
- Docblocks are UUID-named Markdown files under `docblocks_folder`.
- `orchid-sdd recall <uuid|topic|question|path>` returns a compact context pack.
- `orchid-sdd lint` enforces anchors, docblocks, and the 500-char comment limit.

## Layout

```text
bin/orchid-sdd.mjs       portable entry
bin/orchid-sdd           bare-name wrapper for Claude Code's plugin PATH
bin/orchid-sdd            alternate package-name wrapper
cli/                      zero-dependency implementation
  config.mjs              defaults, validation, rendering, detection
  registry.mjs            profiles, personas, aliases, routing
  steering.mjs            steering resolution, validation, list/show/context
  store.mjs               state, events, projection, indexes, snapshots
  setup.mjs               setup wizard outputs
  workspace.mjs           nested-repo detection, per-repo config, Git state
  migration.mjs           scan, backup, scaffold, finalize
  persona.mjs             persona list/show
  doctor.mjs              preflight
  memory.mjs              record, index, recall, lint
  phases.mjs              start, gates, phases, close, abandon, handover, resume
  cli.mjs                 dispatch
.claude-plugin/           Claude Code plugin manifest and marketplace
claude-commands/run.md    Claude Code explicit `/orchid-sdd:run` entry
claude-skills/orchid-sdd/ Claude Code skill pointer to canonical SKILL.md
skills.sh.json            Vercel skills ecosystem repository page config
.gitignore                local tooling and generated-artifact ignores
.skill/
  constitution/           default source of truth for how code is written
  personas/               PM, DEV, QE + optional catalog
  steering/               core rules, optional presets, and example snippets
  templates/profiles/     backend, frontend, infra, monorepo, custom
  templates/artifacts/    PRD, TRD, Gherkin, questionnaire, ADR, prompt, CR, handover
  schemas/                config, state, event, manifest, prompt, report, steering
commands/orchid-sdd.md   OpenCode adapter (/orchid-sdd)
SKILL.md                  portable explicit-only agent contract
docs/orchid-sdd-design.md
docs/personas/            detailed persona reference dossiers
tests/                    node:test integration tests
```

## Tests

```bash
npm test
```

The suite exercises setup, doctor, config validation, the memory loop, lint, gates,
the full lifecycle, abandon, history recall, resume, workspace detection, project-scoped
memory, clean-tree guards, migration backup/scaffold/finalize, the Claude Code plugin
manifest, skill pointer, CLI wrapper, persona dossier consistency, steering setup/resolution,
phase context, project rule overrides, npm skill installation, and every profile’s
personas/tests/constitution pack in temporary projects.

## Known limits (v0.2)

- The YAML parser supports a constrained subset: block maps/sequences, inline lists/maps,
  quoted strings, comments. Block scalars (`|`, `>`) are rejected with a line number.
- The v0.2 setup wizard covers profile, project name, the four workspace paths, workspace
  mode, persona enable/create/override, and steering core rules/presets. Persona triggers,
  aliases, advanced steering rules, and source configuration remain file edits.
- Workspace mode owns knowledge at the root; it does not automate per-repo commits, merges,
  or submodule gitlinks. `close` records each repo's HEAD but the orchestrator performs Git.
- Migration reconstruction is LLM work. The CLI guarantees scan/backup/scaffold/validation,
  not semantic completeness; the agent must provide evidence for every memory.
- `start` requires a clean tree across the root and enabled repos. Use `--allow-dirty` only
  for deliberate migration/pilot work.
- Migration backups are never deleted automatically. Restore from `BACKUP.json` if needed.
- Steering semantic compliance is agent-level. The CLI validates rule references, examples, and
  phase maps, and emits the phase pack/evidence path; it cannot prove that a reviewer followed
  a rule.
- MCP sources are validated but not probed (no MCP client adapter yet); `doctor --online`
  probes Git sources.
- The Claude Code plugin ships a top-level `bin/` so Claude Code can expose the CLI;
  claude.ai Chat and Cowork currently refuse plugins with that directory. The plugin
  command is namespaced as `/orchid-sdd:run`; bare `/orchid-sdd` remains the
  OpenCode/standalone invocation.
- Git worktree creation, agent spawning, and merges are orchestrated by the agent; the CLI
  records the state and enforces gates. `close` does not run `git merge`.
- One active iteration per workspace root; multi-repo execution is supported, but per-repo Git remains agent-driven.

## License

MIT.
