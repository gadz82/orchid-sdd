# orchid-sdd

**Spec-driven development, memory-backed, for coding agents.**

orchid-sdd is a portable workflow and CLI that turns an approved intent into a
traceable memory graph, a dependency-ordered plan of independent prompts, and an
audited change set. It works with OpenCode, Claude Code, Codex, and any other
agent that can run a local command.

- **Design:** [`docs/orchid-sdd-design.md`](docs/orchid-sdd-design.md) (v1.1)
- **Agent contract:** [`SKILL.md`](SKILL.md)
- **Reference manual:** [`docs/reference/README.md`](docs/reference/README.md)
- **Persona dossiers:** [`docs/personas/README.md`](docs/personas/README.md)
- **Status:** v1.1.0 — parallel waves, mandatory state leases, task-sized model routing, workspace/migration

Invocation is **explicit-only**. The skill never auto-triggers; it runs only when
you type `/orchid-sdd`, `/orchid-sdd:run`, or call the `orchid-sdd` CLI.

**Contents:** [Why orchid-sdd](#why-orchid-sdd) · [30-second tour](#30-second-tour) ·
[Installation and agents](#installation-and-agent-setup) ·
[Agent usage](#how-to-use-it-with-an-agent) · [Model routing](#right-agent-for-the-task-model-routing) ·
[CLI](#cli-overview) · [Phases](#the-phases) · [Personas](#personas) ·
[Steering and patterns](#steering-and-patterns) · [Customization](#customization) ·
[Workspace and migration](#workspace-and-migration) · [Memory](#memory-and-auditability) ·
[Operations](#operations) · [Documentation map](#documentation-map)

---

## Why orchid-sdd

Coding agents are fast, but speed alone does not produce a maintainable change.
The usual failure modes are predictable:

| Problem | What orchid-sdd does |
|---|---|
| The agent forgets why a decision was made | Decisions, requirements and code anchors live in a durable memory graph |
| The specification and the code drift apart | Every phase has an artifact and a gate; prompts carry acceptance evidence |
| Several agents edit the same area and collide | Prompts declare disjoint write scopes; waves run in isolated Git worktrees |
| “Looks good to me” passes as review | Independent adversarial review and a PM logic review are part of the process |
| Parallel work corrupts shared state | Every mutation takes an exclusive lease; the event log has one writer |
| The audit trail is buried in chat | State, events, matrix, reviews and snapshots are plain files in your repository |
| The workflow only works with one harness | One Markdown contract plus a zero-dependency Node CLI, portable across agents |
| A long-running task loses its place | Handoffs and `resume` rebuild state from append-only events |

The result is not “an agent that writes more code”. It is a process that keeps
the *why*, the *plan*, the *evidence* and the *code* connected.

### What you get

- **Memory-backed intent** — requirements, scenarios, decisions, questions and
  code units in a queryable graph.
- **A real plan** — a DAG of small prompt contracts with dependencies, write
  scopes, acceptance commands and review requirements.
- **Parallel execution** — `execution.max_parallel` prompts, one worktree per
  prompt, explicit reconciliation, and safe retries after conflicts.
- **Human control** — approval gates at intent, assessment, planning, logic
  review, closure and handover.
- **Project-specific judgement** — personas, a constitution, steering rules and
  selectable architecture/repository patterns.
- **Task-sized model routing** — map effort levels to an expected coding agent
  and model, verify the active one, and carry the expectation across handoffs.
- **Multi-repo support** — one root-owned knowledge base and one audit trail over
  several nested Git repositories.
- **Local-first operability** — plain JSON/Markdown, no runtime dependencies,
  no hosted service, no hidden database.

---

## 30-second tour

Install once, initialise a project, then let the agent drive:

```bash
npm install -g orchid-sdd
cd /path/to/your-project

orchid-sdd setup --profile backend --yes
orchid-sdd doctor
orchid-sdd start "Add passkey login to the customer portal"
```

From an agent that has the skill installed:

```text
/orchid-sdd status
/orchid-sdd start "Add passkey login to the customer portal"
```

The agent will work through intent, discovery, assessment, planning, build,
logic review and closure. You approve the gates; the CLI records the evidence and
keeps the state consistent.

---

## Installation and agent setup

Requirements: **Node.js 20+**, Git, and a POSIX-style shell. The CLI has **no
runtime dependencies**.

| How you work | Install | Invoke |
|---|---|---|
| **npm, global** | `npm install -g orchid-sdd` | `orchid-sdd <command>` |
| **npm, per project** | `npm install --save-dev orchid-sdd` | `npx orchid-sdd <command>` |
| **Git checkout** | `git clone https://github.com/gadz82/orchid-sdd.git` | `node /path/to/orchid-sdd/bin/orchid-sdd.mjs <command>` |
| **OpenCode skill** | `orchid-sdd skill install --agent opencode` | `/orchid-sdd <command>` |
| **Claude Code plugin** | `claude --plugin-dir /path/to/orchid-sdd` or marketplace install | `/orchid-sdd:run <command>` |
| **Claude Code skill** | `orchid-sdd skill install --agent claude-code` | `/orchid-sdd <command>` |
| **Codex / generic agent** | `orchid-sdd skill install --agent generic` | Load `SKILL.md` explicitly and call the CLI |
| **Vercel Agent Skills** | `npx skills add gadz82/orchid-sdd --skill orchid-sdd -a opencode` | Follow the host’s skill invocation |

### OpenCode

```bash
node /path/to/orchid-sdd/bin/orchid-sdd.mjs \
  --root /path/to/project \
  skill install --agent opencode
```

This writes `.opencode/skills/orchid-sdd` and the `/orchid-sdd` command. Use
`--global` for a user-wide install.

### Claude Code

As a plugin from a checkout:

```bash
claude plugin validate /path/to/orchid-sdd
claude --plugin-dir /path/to/orchid-sdd
```

Then invoke `/orchid-sdd:run status`. The plugin command is namespaced; the
standalone skill uses `/orchid-sdd`.

As a project skill:

```bash
node /path/to/orchid-sdd/bin/orchid-sdd.mjs \
  --root /path/to/project \
  skill install --agent claude-code
```

### Codex and other agents

There is no separate Codex-specific adapter. Use the generic Agent Skills install
or a checkout:

```bash
orchid-sdd skill install --agent generic
```

Point the agent at `SKILL.md` and at the `orchid-sdd` executable (or
`node <skill-dir>/bin/orchid-sdd.mjs`). The skill is explicit-only; configure the
host to require the invocation rather than auto-loading it.

### Verify

```bash
orchid-sdd --version
orchid-sdd doctor
```

Full install paths, plugin details, the setup wizard and the generated file tree
are in **[Installation and agent setup](docs/reference/installation.md)**.

---

## How to use it with an agent

The agent is the orchestrator. It reads the project contract, runs the CLI,
delegates implementation and review to fresh-context subagents, and stops at the
gates that need your approval.

A typical session looks like this:

```text
You:    /orchid-sdd start "Add passkey login to the customer portal"
Agent:  Creates the iteration and the intent artifacts.
        Asks for the missing product decisions.
        Runs discovery, assessment and planning.
        Shows the plan and asks for approval at G3/G4.

You:    Approve.

Agent:  Starts a wave, runs independent prompts in worktrees,
        reviews each change, reconciles the wave and reports the result.

You:    Approve logic review and closure.
Agent:  Archives the iteration and prepares the technical handover.
```

### What each actor does

| Actor | Responsibility |
|---|---|
| **You** | Choose scope, approve gates, settle trade-offs, accept risk |
| **Agent / orchestrator** | Product and technical analysis, Gherkin, planning, delegation, review, Git coordination |
| **Subagents** | One implementation prompt or one independent review each |
| **CLI** | Validate config, record state and events, project memory/indexes, enforce gates, run workspace checks |

### Interacting directly through the agent

You normally do not type every CLI command. You ask the agent for an outcome and
it chooses the command:

- “Show me where we are.” → `status`, `gate status`, `status --json`
- “Start this feature.” → `start`, then the phase commands
- “What did we decide about storage?” → `recall storage`
- “Run the next wave.” → `wave start`, `prompt start`, `wave reconcile`
- “Which model should run this task?” → `route --phase ... --prompt ...`
- “I need to switch agent/model.” → `handoff prepare`, then `/orchid-sdd resume`
- “Why is this blocked?” → `status`, `doctor`, `prompt validate`

The agent must explain gates and prompts in plain language, not dump raw JSON.
The full interaction contract is in **[SKILL.md](SKILL.md)** and the phase model
is in **[Phases and gates](docs/reference/phases.md)**.

### Handoffs and resume

`handoff prepare` writes a portable checkpoint. After switching harness, the new
agent runs `resume`; state is rebuilt from events and the latest handoff is
accepted. This is a checkpoint, not an automatic model switch.

### Right agent for the task: model routing

orchid-sdd can declare an **expected coding agent and LLM for each effort level**,
then use that expectation at the phase or prompt level. This is the task-size
dimension of the plan:

```yaml
models:
  default_effort: medium
  mismatch: block          # warn | block
  efforts:
    medium:
      agent: opencode
      model: openai/gpt-4.1
    high:
      agent: claude-code
      model: anthropic/claude-sonnet-4
    extra-high:
      agent: claude-code
      model: anthropic/claude-opus-4
  phases:
    discovery: medium
    assessment: high
    build: high
    code_review: high
    logic_review: extra-high
  prompts:
    P-003: extra-high      # this prompt needs a stronger model
```

The effort levels are `low`, `medium`, `high`, `extra-high` and `ultra`. A prompt
can also declare `effort` in its front matter; the resolution order is prompt
config → prompt contract → phase default → `models.default_effort`.

A practical mapping from the planning estimate to effort (you choose the actual
agent/model):

| Plan estimate | Suggested effort | Typical intent |
|---|---|---|
| `S` | `low` or `medium` | Fast/cheap model for a narrow change |
| `M` | `medium` or `high` | Default implementation model |
| `L` | `high` or `extra-high` | Strong model and independent review |

`estimate` is a planning estimate; routing uses `effort`. Set `effort` explicitly
when the phase default does not match the task.

```bash
# What is expected here?
orchid-sdd route --phase build --prompt P-003

# Compare with the harness that is actually running
orchid-sdd route --phase build --prompt P-003 \
  --current-agent claude-code \
  --current-model anthropic/claude-opus-4
```

`route` reports `match`, `mismatch`, `unknown` or `unassigned`. With
`models.mismatch: block`, `prompt start` refuses a confirmed mismatch; with
`warn`, the agent must report it and let the human decide. orchid-sdd **never
switches models or agents automatically**.

This is deliberately connected to handoffs: `handoff prepare` preserves the
active prompt, run, step and routing, and after switching harness `resume` restores
them and shows whether the new identity matches the expectation. Use it when a
small prompt can stay on a fast/cheap model but a high-risk or cross-cutting
prompt should move to a stronger one.

Details: [Model routing commands](docs/reference/cli.md#model-routing) ·
[Models and efforts configuration](docs/reference/configuration.md#models-and-efforts).

---

## CLI overview

Use `orchid-sdd --root DIR <command>` to target another project. Inspection
commands accept `--json`; run `orchid-sdd --help` for the authoritative list.

| Area | Commands | What they do |
|---|---|---|
| **Setup and health** | `setup`, `doctor`, `diff`, `status` | Initialise, validate, compare, orient |
| **Iteration** | `start`, `gate`, `discover`, `assess`, `plan`, `build`, `review`, `close`, `handover`, `abandon`, `resume` | Drive the lifecycle |
| **Waves** | `wave start`, `wave status`, `wave reconcile`, `wave abort` | Prepare, inspect, merge and clean parallel work |
| **Prompts** | `prompt start`, `prompt step`, `prompt complete`, `prompt fail`, `prompt waive`, `prompt validate` | Record execution and validate contracts |
| **Memory** | `record`, `recall`, `index`, `lint`, `new-uuid` | Write, retrieve, rebuild and validate knowledge |
| **Roles and policy** | `persona`, `steering`, `route` | Inspect personas, apply steering, resolve model/effort |
| **Workspace** | `dependencies list`, `dependencies check` | Validate cross-repo edges |
| **Migration** | `migrate scan`, `backup`, `init`, `status`, `finalize` | Convert an existing project/workspace |
| **Recovery** | `handoff`, `resume`, `doctor --fix`, `index --check` | Restore and repair |

Common examples:

```bash
orchid-sdd status                       # where am I?
orchid-sdd gate pass G1 --evidence intent/prd.md
orchid-sdd wave start 1                 # create worktrees, prompts stay ready
orchid-sdd prompt start P-001 --step implement
orchid-sdd wave reconcile 1 --test      # merge, test, clean up
orchid-sdd recall auth --summary
orchid-sdd index --check && orchid-sdd lint --check
```

The complete command tables, options, typical flows and recovery commands are in
**[CLI reference](docs/reference/cli.md)**.

---

## The phases

```text
setup → start → discover → assess → plan → build → review → close → handover
  G0      G1        G2        G3      G4      G5       G6       G7       G8
```

| Phase | Gate | Outcome |
|---|---|---|
| **Intent** | G1 | Product and technical intent; scope, success measures and constraints |
| **Discovery** | G2 | Requirements, scenarios/Gherkin, questions and consistency findings |
| **Assessment** | G3 | Technical impact, options, ADRs, feasibility spikes and go/no-go |
| **Planning** | G4 | Prompt DAG, write scopes, acceptance commands, cost estimate |
| **Build** | G5 | Implemented prompts, tests, adversarial CR and reconciled waves |
| **Logic Review** | G6 | PM review against PRD/TRD/Gherkin plus steering evidence |
| **Closure** | G7 | Archived transients, snapshot, repo HEADs and release decision |
| **Handover** | G8 | Human-facing handover and tutorial for the next engineer |

Gates are explicit: the CLI records `pass`/`fail` with evidence or a reason. The
agent runs the command; a human authorises the human gates. The CLI cannot prove
who invoked it, so “the command succeeded” is not proof of approval.

Build is where parallel waves happen:

```bash
orchid-sdd wave start 1
orchid-sdd prompt start P-001
orchid-sdd prompt complete P-001 --note "tests and CR passed"
orchid-sdd wave reconcile 1 --test
```

`wave start` freezes a base commit per repository and creates one worktree per
prompt. `wave reconcile` merges the committed prompt branches, optionally runs
tests, removes the worktrees and branches, and records the result. Failed merges
or tests can be fixed and retried without re-merging completed prompts.

Full phase descriptions, artifact locations, gate ownership and the build/wave
flow are in **[Phases and gates](docs/reference/phases.md)**.

---

## Personas

Personas are explicit roles with a mission, phase assignments and decision rights.
They keep the agent from collapsing product, engineering, test and security
judgement into one voice.

The default cast is:

| Persona | Role | Default authority |
|---|---|---|
| **PM / PO** | Product meaning, scope and acceptance | Blocking on business meaning |
| **DEV** | Implementation and technical trade-offs | Advisory |
| **QE** | Test strategy, failure modes and evidence | Blocking on test gaps |

Optional roles include `TECH_LEAD`, `ARCHITECT`, `DBA`, `DEVOPS`, `SECURITY` and
`UX`. Each has a concise active contract in `.skill/personas/` and a detailed
dossier in [`docs/personas/`](docs/personas/).

```bash
orchid-sdd persona list
orchid-sdd persona show SECURITY
```

Custom roles live in `.orchid/personas/<ID>.md`; enable them in
`personas.enabled`, then assign them to phases or reviews. Details:
**[Personas](docs/reference/personas.md)**.

---

## Steering and patterns

The **constitution** says how code is written everywhere. **Steering** is the
selectable, phase-aware layer for explicit project decisions: architecture
boundaries, examples, style, repository flow and process rules.

Each rule is a Markdown file with YAML front matter:

```md
---
id: project-api-boundaries
title: API boundaries
kind: architecture
authority: blocking
phases: [discovery, assessment, logic_review]
---
# Rule
HTTP handlers do not contain domain rules.
```

Core rules ship enabled by default: `architecture-boundaries`,
`solid-principles`, `dependency-inversion-container`, `code-style`,
`code-examples`, `repository-flow`, `saga-pattern`, `discovery-steering` and
`logic-review-steering`.

Optional presets cover:

| Category | Examples |
|---|---|
| **Architecture** | hexagonal, onion, clean, DDD, CQRS, event-driven |
| **Repository flow** | trunk-based, Git-flow, XP mainline |
| **Code style** | TypeScript, Go, Python, PHP, Rust, Java, Ruby, SonarQube |
| **Process** | discovery evidence, logic-review coverage |

Enable presets at setup:

```bash
orchid-sdd setup --yes \
  --steering-preset architecture-hexagonal \
  --steering-preset repository-trunk-based
```

Inspect the effective pack:

```bash
orchid-sdd steering list
orchid-sdd steering context --phase discovery
orchid-sdd steering show architecture-boundaries --examples
```

Details, override rules and the full core-rule table:
**[Steering](docs/reference/steering.md)**. What each architecture/repository
preset means and when to choose it: **[Patterns](docs/reference/patterns.md)**.

---

## Customization

orchid-sdd is designed to be customized without forking it. The skill package
owns defaults and the CLI; your project owns policy.

| Surface | Where | What you can change |
|---|---|---|
| Project settings | `orchid-sdd.yml` | Paths, profiles, execution, reviews, governance, sources |
| Personas | `.orchid/personas/*.md` + `personas.enabled` | Add a role, override phases/authority |
| Steering | `.orchid/steering/*.md` + `steering.phases` | Add or override architecture/style/repository rules |
| Constitution | `constitution_folder` | Project-wide engineering rules and includes |
| Templates | `customizations_folder` | PRD, TRD, prompt, CR, handover and tour templates |
| Workspace repos | `workspace.repos[]` + `<repo>/orchid-sdd.yml` | Add repos, per-repo tests/personas/constitution |
| Execution/review policy | `execution.*`, `reviews.*`, `governance.*` | Parallelism, isolation, test commands, review routing, approvals |

### Adding a phase

The phase set is part of the skill contract, not a runtime config key. If the
built-in lifecycle is not enough, prefer one of these first:

1. add a **steering rule** and map it to an existing phase;
2. model the work as a **prompt type** (`build`, `test`, `spike`) inside build;
3. use an additional **gate** or review artifact without adding a phase.

A genuinely new phase is a skill-package change. It requires updating
`PHASE_NAMES` and validation in `cli/config.mjs`, the phase/gate mapping and
`nextAction()` in `cli/phases.mjs`, steering phase enums and schemas, `SKILL.md`,
the design document and tests. The step-by-step recipe with a worked example is
in **[Customization](docs/reference/customization.md#adding-a-phase)**.

The complete option-by-option reference is in
**[Configuration](docs/reference/configuration.md)**.

---

## Workspace and migration

### Workspace mode

If the project root contains several Git repositories, orchid-sdd stays at the
root and treats each nested repo as a unit of work:

```bash
orchid-sdd setup --workspace --profile monorepo
```

One root owns `.knowledge`, `.orchid`, state and audit. Each repo gets a small
`extends` fragment for tests, personas and constitution. Cross-repo edges are
tracked explicitly in `.orchid/cross-repo-dependencies.md` and validated with
`dependencies check`.

See **[Workspace mode](docs/reference/workspace.md)**.

### Migration

`migrate` converts an existing project or workspace without throwing away its
history:

```bash
orchid-sdd migrate scan
orchid-sdd migrate init --profile monorepo
# the agent reconstructs memory from Git, specs and ADRs
orchid-sdd migrate finalize
```

The CLI scans, backs up and scaffolds; an LLM agent reconstructs the semantic
memory and proposes project code examples for approval. Details:
**[Migration](docs/reference/migration.md)**.

---

## Memory and auditability

The memory graph is what keeps the workflow from becoming a pile of chat logs:

- every requirement, decision, question and code unit is a node with a UUIDv7,
  description, topics and provenance;
- significant code carries one `ORCHID-MEM: <uuid> — <short behaviour>` anchor;
- the explanation and history live in a UUID-named docblock;
- `record` writes, `recall` retrieves, `index` projects, `lint` checks;
- events are append-only; the manifest and indexes are generated projections.

```bash
orchid-sdd record --type Decision --alias ADR-001 \
  --description "SQLite is the local storage backend." \
  --topics storage,sqlite,decisions \
  --artifact assessment/adr/ADR-001.md

orchid-sdd recall storage --summary
orchid-sdd lint --check
```

Read **[Memory model](docs/reference/memory.md)** for node types, recall modes,
docblock rules and the versioned/generated file split.

---

## Operations

Useful checks for local work and CI:

```bash
orchid-sdd doctor --ci
orchid-sdd index --check
orchid-sdd lint --check
npm test
```

The test suite covers setup, doctor, config validation, memory, gates, lifecycle,
waves, worktrees, leases, workspace mode, migration, personas, steering, model
routing and handoffs.

Repository layout, test/benchmark instructions, CI checks and current limits are
in **[Operations](docs/reference/operations.md)**.

---

## Documentation map

| I want to… | Read |
|---|---|
| Install with my agent | [Installation and agent setup](docs/reference/installation.md) |
| Look up a command | [CLI reference](docs/reference/cli.md) |
| Understand the lifecycle | [Phases and gates](docs/reference/phases.md) |
| Understand the actors | [Architecture](docs/reference/architecture.md) |
| Configure the project | [Configuration](docs/reference/configuration.md) |
| Route a task to an expected agent/model | [Models and efforts](docs/reference/configuration.md#models-and-efforts) |
| Add a persona/rule/template/phase | [Customization](docs/reference/customization.md) |
| Understand memory and recall | [Memory model](docs/reference/memory.md) |
| Use several repositories | [Workspace mode](docs/reference/workspace.md) |
| Convert a legacy project | [Migration](docs/reference/migration.md) |
| Choose architecture/style presets | [Patterns](docs/reference/patterns.md) |
| Run checks and tests | [Operations](docs/reference/operations.md) |
| Read the full specification | [Design document](docs/orchid-sdd-design.md) |

## License

MIT.
