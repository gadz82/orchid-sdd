---
name: orchid-sdd
description: Explicit-only SDD workflow. Never auto-invoke. Load only when the user typed /orchid-sdd (OpenCode) or /orchid-sdd:run (Claude Code plugin).
disable-model-invocation: true
---

# Guard

This skill is **explicit-only**. Proceed only when the invocation carries the
`/orchid-sdd` sentinel (OpenCode), `/orchid-sdd:run` (Claude Code plugin), or an
explicit `orchid-sdd <command>` call (CLI).

If the sentinel is missing, refuse and print:

> orchid-sdd is explicit-only. Type `/orchid-sdd <command>` (OpenCode) or
> `/orchid-sdd:run <command>` (Claude Code plugin).

Never infer a command from a general request such as "plan this feature".

# Role: you are the orchestrator

You are the primary agent session. You decide, delegate, verify, and merge.
Implementers, reviewers, and assessment lenses run as subagents with fresh contexts.

- The CLI is the only writer of state, events, manifest, indexes, and the matrix.
- Never edit `.knowledge/**`, `manifest.jsonld`, or the index files by hand.
- Deterministic operations go through the CLI: setup, record, index, lint, gates, close.
- Code reaches the default branch only at closure. Build merges go to the integration branch.

# First move, every session

1. Run `orchid-sdd status` (or `node bin/orchid-sdd.mjs status --root .`).
2. Run `orchid-sdd doctor` if config, sources, personas, or steering changed.
3. Read `AGENTS.md`, `.orchid/constitution/constitution.md`, and the relevant manifest slice.
4. Run `orchid-sdd steering context --phase <current-phase>` and read every active rule.
5. Never load the whole knowledge graph; query `orchid-sdd recall <topic|question|uuid|path>`.

# Command map

| Intent | Command |
|---|---|
| Configure the project | `orchid-sdd setup --profile <backend\|frontend\|infra\|monorepo\|custom> [--workspace\|--single] [--steering-preset ID] [--no-steering] [--no-steering-discovery] [--no-steering-logic-review] [--json]` |
| Install agent skill | `orchid-sdd skill install --agent opencode\|claude-code\|generic` |
| Inspect personas | `orchid-sdd persona list [--json]` / `persona show <ID>` |
| Inspect steering | `orchid-sdd steering list [--phase P] [--json]` / `steering show <ID>` |
| Apply phase steering | `orchid-sdd steering context --phase <phase>` |
| Convert an existing project/workspace | `orchid-sdd migrate scan\|backup\|init\|status\|finalize` |
| Validate setup/sources | `orchid-sdd doctor [--ci] [--online] [--fix]` |
| Start an iteration | `orchid-sdd start "<title>" [--technical-only] [--rigor S\|M\|L]` |
| Capture requirements | `orchid-sdd discover` |
| Assess technical impact | `orchid-sdd assess` |
| Plan prompts | `orchid-sdd plan` |
| Execute prompts | `orchid-sdd build [--all\|--wave N\|--prompt P-003]` |
| Logic review | `orchid-sdd review` |
| Close | `orchid-sdd close --approve` |
| Handover | `orchid-sdd handover [--approve]` |
| Abandon | `orchid-sdd abandon "<reason>"` |
| Record memory | `orchid-sdd record --type T ...` |
| Rebuild/verify indexes | `orchid-sdd index [--check]` |
| Resolve memory | `orchid-sdd recall <query>` |
| Validate anchors/docblocks | `orchid-sdd lint [--check]` |
| Record a gate | `orchid-sdd gate pass G# --evidence <path>` |
| Recover after a crash | `orchid-sdd resume` |

`/orchid-sdd <command>` and `orchid-sdd <command>` are the same operation. In the
Claude Code plugin, invoke `/orchid-sdd:run <command>`; it reaches this same contract and
the bundled CLI.

# Gate protocol

A gate passes only with evidence. Never pass a gate on a promise.

| Gate | Evidence | Human |
|---|---|---|
| G0 Setup | config valid; paths exist; sources checked; manifest v0 | setup confirmation |
| G1 Intent | title validated; PRD + TRD; no unresolved blocking questions | yes |
| G2 Discovery | impact, boundaries, Gherkin, consistency report, steering constraints; zero blocking questions or recorded assumptions | if scope changed |
| G3 Assessment | impact map, contracts, regressions, options/ADRs, go/no-go | yes |
| G4 Plan | valid DAG, disjoint waves, coverage, cost estimate within budget | yes |
| G5 Prompt | acceptance met, tests green, CR passed, anchors/docblocks valid, merged to integration | per prompt, no |
| G6 Logic review | scenarios verified; steering review complete; no open business or blocking steering findings; scope matches intent | yes |
| G7 Closure | prompts done/waived; audit archived; integration merged; release notes | yes |
| G8 Handover | HANDOVER.md + tour.md verified | yes |

Use `--evidence <iteration-relative path>` or `--note "why"`; both are logged.

The orchestrator executes `gate pass|fail` after the required authorization. The CLI
records the decision; it cannot verify human identity or semantic quality. Never treat a
passing command as proof of human approval, and never auto-pass a human gate. G5 is the
agent/reviewer gate; G2 requires human confirmation only when answers changed scope. If no
agent is running, the developer may run the same command manually.

Phase commands do not auto-pass their predecessor. `discover` requires G1, `assess` requires
G2, and so on. Use `gate status` to inspect the current state.

# Phase playbooks

## Phase 0 — Setup

Run `orchid-sdd setup` and follow the seven steps: profile, project name, paths, workspace
mode, personas, steering, review. Steering defaults are seeded; choose optional presets and
whether rules apply to Discovery and Logic Review. Agents should use `--yes` plus explicit
flags and `--json` instead of answering prompts. Setup is idempotent but never overwrites user
files without `--force`. If an MCP or Git source is declared, `doctor --online` must pass
before G1.

## Phase 1 — Intent

Artifacts: `intent/title.md`, `intent/prd.md`, `intent/trd.md`.

- Validate the title: ≤500 chars, names subject + change + outcome. If vague, ask at most
  five clarifying questions with examples.
- PRD: problem, users, current behaviour, desired outcome, flows, business rules, metrics,
  non-goals, risks. No technical solution.
- TRD: constraints, patterns (cite the constitution), deliverables, infra/API/data
  hypotheses, regression strategy, versioning. The TRD is a hypothesis, not a commitment.
- A purely technical change requires `--technical-only` and a stated rationale.
- Give every requirement an ID (`R-001`) and record it:
  `orchid-sdd record --type Requirement --alias R-001 --description "..." --topics ... --artifact intent/prd.md`
- Pass G1 with evidence, then `orchid-sdd discover`.

## Phase 2 — Discovery (PM only)

Artifacts: `discovery/raw-input.md`, `impact.md`, `glossary.md`, `gherkin/*.feature`,
`questions/Q-*.md`, `consistency-report.md`, `steering.md`.

- Run `orchid-sdd steering context --phase discovery` and read every active rule and example.
- Capture user input verbatim before paraphrasing.
- Convert each applicable steering rule into a requirement, Gherkin criterion, question,
  assumption, or ADR-backed exception; write rule IDs and evidence in `discovery/steering.md`.
- Check architecture boundary fit, repository flow fit, style evidence, and example fit. Do not
  review implementation style or invent the technical solution in this phase.
- Write Gherkin with `@req:R-###` tags; every requirement needs a scenario or a
  recorded `no-scenario` rationale.
- Run the consistency scan against the manifest: contradictions, superseded decisions,
  breaking changes without ADRs, regressions, ambiguous terms, orphan requirements, and
  conflicts with blocking steering rules.
- Ask through a Markdown questionnaire (max 7 per round). Each question explains why,
  gives examples, and states the risk of not answering.
- The user may mark a question `Deferred`; record the assumption, the risk, and how logic
  review will detect it. Deferred items become `Assumption` nodes. No deadlock.
- Do not let technical personas answer business questions here; park them.
- Pass G2, then `orchid-sdd assess`.

## Phase 3 — Assessment and negotiation

Artifacts: `assessment/impact-map.md`, `contracts.md`, `data-impact.md`,
`infrastructure-impact.md`, `regression-plan.md`, `estimate.md`, `negotiation.md`,
`steering.md`, `adr/ADR-*.md`, `spikes/`.

- Read the assessment steering context and record boundary, style, example, and repository
  implications in `assessment/steering.md`.
- Run only the lenses the change needs; each produces evidence and confidence.
- Magnitude: scope, risk 1–5, reversibility, effort, confidence, blast radius.
- Options only when a genuine trade-off exists; otherwise state the single viable path.
- State customer impact in plain language: new major, record deactivation, breaking API,
  UX regression. The user is the final judge; record risk acceptance in an ADR.
- A spike is time-boxed, findings-only, on `spike/<id>`; it never merges.
- Pass G3, then `orchid-sdd plan`.

## Phase 4 — Planning

Artifacts: `plan/plan.json`, `plan/matrix.md`, `plan/matrix.json`, `plan/cost-estimate.md`,
`plan/prompts/P-###.md`.

- One prompt, one reviewable outcome; tests are part of the deliverable.
- `type: build | test | spike`; spike prompts carry `timebox` and a findings deliverable.
- Dependencies are explicit; write scopes are disjoint within a wave.
- Every prompt cites requirements/scenarios, memory refs, constitution sections, active steering
  rule IDs, and an executable acceptance command.
- Docblock ownership is derived from `scope.write`; do not list docblock files.
- Check the cost estimate against `budgets`; surface it at G4.
- Pass G4; prompts are frozen and hashed.

## Phase 5 — Build and adversarial CR

- Select ready prompts; create a worktree and branch `orchid/<iteration>/<prompt-id>`.
- Give each implementer a context pack, not the repository.
- The orchestrator runs acceptance tests in a clean environment; the implementer's claim
  is not evidence.
- Review with a fresh-context reviewer routed by paths/topics. Batch CR is allowed for
  S-size work; independence and the rubric are unchanged. Check active steering rules and cite
  violations in `reviews/steering.md`.
- Fix loop up to `max_fix_loops`; then `escalated`: accept with ADR, split, or revert.
- Merge to `orchid/<iteration>/integration` in wave order. Do not merge to the default branch
  during build unless an active repository steering rule explicitly permits direct mainline
  integration and records the evidence.
- A prompt is done only when acceptance, tests, CR, anchors/docblocks, and the matrix agree.

## Phase 6 — Logic review (PM)

Artifacts: `reviews/logic-review.md`, `reviews/steering-review.md`.

- Run `orchid-sdd steering context --phase logic_review` and read every active rule and example.
- Review behaviour against PRD/TRD/Gherkin, the integration diff, and the steering rules.
- Walk every scenario; check invariants, scope creep, dropped requirements, copy, error
  states, accessibility, and prior regressions.
- For each steering rule, record `satisfied`, `not applicable`, `finding`, or `waived` with
  current evidence in `reviews/steering-review.md`; a blocking rule without evidence stops G6.
- Findings become new prompts (spec version increments) or a waived risk with an ADR.
- Loop capped at `reviews.logic.max_loops`; survivors become a follow-up iteration.
- Pass G6, then `orchid-sdd close --approve`.

## Phase 7 — Closure

- Confirm every prompt is `done` or `waived`; tests green; lint/index current.
- Move prompts, bus, and runs to `audit/`; keep the matrix as the index.
- Write `release-notes.md`; merge integration to the default branch per
  `execution.release_strategy`; tag/freeze the iteration.
- Mark closed and rebuild the manifest. A closed iteration is immutable.
- If it will not ship, use `orchid-sdd abandon "<reason>"` instead.

## Phase 8 — Handover

Generate `handover/HANDOVER.md` and `handover/tour.md`. Explain what changed, why, where
to look, how to run/test, how to roll back, and what remains. The tour is 10–15 ordered
stops with anchors and test commands. Verify links and commands, then
`orchid-sdd handover --approve`.

# Steering rules

Steering is the selectable, phase-aware layer for architecture, SOLID principles, dependency
inversion and DI containers, SAGA coordination, examples, language-agnostic code style,
repository flow, and process rules. The constitution applies everywhere; steering names the
explicit project decisions that must be checked and cited.

- Rules live in `.skill/steering/` (defaults) and project search paths such as
  `.orchid/steering/`; resolve by `id` and read the active set with
  `orchid-sdd steering context --phase <phase>`.
- `steering.enabled` is the available set; `steering.phases.<phase>` is the ordered active set.
- Every rule has `authority: advisory|blocking`, a `kind`, phases, checks, evidence, and
  optional example paths. A project file with the same `id` overrides a default.
- Shipped examples cover TypeScript, Go, Python, PHP, Rust, Java, and Ruby; use the closest
  language example and adapt it to the project’s real conventions.
- Discovery converts applicable rules into requirements, scenarios, questions, assumptions, or
  ADR-backed exceptions. It does not review implementation style.
- Logic review verifies every active rule against the integration branch, records a verdict and
  evidence in `reviews/steering-review.md`, and stops on an unresolved blocking rule.
- Do not enable competing architecture, style-tool, or repository presets. An exception is an
  ADR, not a silent waiver.
- The CLI validates references, but the agent owns semantic compliance. `steering context`
  provides the rule pack; it does not prove the rule was followed.

# Memory contract

Every memory node has a UUIDv7, a self-contained description ≤160 chars, 3–7 topics,
provenance, and status. One fact per node. Accepted history is superseded, never edited.

Record with the CLI; never hand-edit the manifest:

```bash
orchid-sdd record --type Requirement --alias R-001 \
  --description "Returning users can sign in with a passkey." \
  --topics auth,passkeys,login \
  --questions "How do users sign in without a password?" \
  --artifact intent/prd.md

orchid-sdd record --type Decision --alias ADR-001 \
  --description "Passkeys are primary; passwords remain for 90 days." \
  --topics auth,rollout \
  --artifact assessment/adr/ADR-001.md

orchid-sdd record --type CodeUnit --id <uuid> \
  --description "Passkey registration ceremony; challenge is single-use." \
  --topics auth,passkeys,code \
  --code "src/auth/passkey.ts#register" \
  --artifact "docs/knowledge/docblocks/<uuid>.md"
```

Types: Requirement, Scenario, Question, Answer, Decision, ADR, Prompt, Run, Review,
Finding, CodeUnit, Message, AuditArchive, Release, Assumption, Test.

Project-scoped baseline memory (migration, cross-iteration decisions) is recorded without
an active iteration:

```bash
orchid-sdd record --type Decision --scope project --repo <repo-id> \
  --description "..." --topics architecture,decisions,repo \
  --artifact .knowledge/adr/ADR-001.md
```

## Anchors and docblocks

- Anchor grammar: `ORCHID-MEM: <uuidv7> — <short description>` (one line).
- Required for exported/public symbols whose behaviour changes, entry points, traced
  symbols, and any symbol with a docblock. Not for tests or private one-liners.
- Docblocks are UUID-named: `<docblocks_folder>/<uuid>.md`, with `code:` in front matter.
- Behaviour comments are ≤500 characters and omitted when unnecessary. The anchor line is
  metadata, not a behaviour comment.
- Run `orchid-sdd lint` before claiming a prompt is done.

## Bottom-up retrieval

When you see an anchor: `orchid-sdd recall <uuid>` → read the node, docblock, relations,
ADR/spec. Expand at most two hops. Query by topic/question before reading the graph.
If the CLI is unavailable, read `manifest.jsonld` and `index/` directly (plain JSON).

# Personas

Defaults: **PM, DEV, QE**. PM is the single product persona; `PO` is an alias. Catalog:
TECH_LEAD, ARCHITECT, DBA, DEVOPS, SECURITY, UX — opt-in via config. Each active contract
has a detailed dossier at `docs/personas/<ID>.md`; read it when the role is active, but keep
the active body concise.

- Phase casts are enforced: discovery is PM-only unless config says otherwise.
- Project persona files in `.orchid/personas/` override the skill defaults by ID; `extends`
  is optional. `orchid-sdd persona list` shows the effective set and its source.
- User tags: `#DBA`, `#SECURITY` anywhere in the message; aliases resolve (`#PO` → PM).
- A tagged persona is blocking if it holds blocking authority for that phase, else advisory.
- An implementer never reviews its own work; reviewers get fresh context.
- The user can override any persona, but the override is recorded with a rationale.

# Adversarial CR

Reviewer inputs: diff, prompt contract, requirements/scenarios, constitution sections,
tests, 1-hop memory. Try to falsify the change; produce evidence, not opinions.

| Dimension | Check |
|---|---|
| Correctness | Acceptance and scenarios |
| Tests | Meaningful failure paths, not just happy path |
| Security | Validation, authz, secrets, injection, exposure |
| Data | Migration safety, backfill, rollback, retention |
| Performance | Hot paths, N+1, unbounded work |
| Operability | Logs, metrics, errors, config, deployability |
| Constitution | Cited sections; deviations have ADRs |
| Steering | Active rules cited; architecture, style, example, and repository evidence |
| Scope | No unrelated changes or drive-by refactors |
| Documentation | Anchor/docblock accurate for significant units |

Severities: critical, high, medium, low. `block_on` gates critical/high.
"LGTM" without coverage and residual risk is not a review.

# Failure handling

- Missing required source: stop and report; never invent its content. Degrade only with
  explicit confirmation and record it.
- Budget `stop`: halt the phase; continuing requires `--force` and a risk-acceptance event.
- CR loop exhausted: `escalated` → accept-with-ADR, split, or revert; human arbitrates.
- Logic loop exhausted: follow-up iteration (`followUpTo`) or waived risk with ADR.
- Merge conflict: stop; do not improvise. Re-plan the affected prompts.
- Crash: `orchid-sdd resume` replays events, aborts half-finished merges, re-queues prompts.
- Ambiguity: write a Markdown questionnaire; never make a business decision silently.

# Workspace mode (multi-repo)

When the root contains nested Git repositories, the root is the only orchid-sdd project:
one `.knowledge`, one state, one manifest, one audit. Never create nested knowledge and
never run `setup` inside a repo.

- `setup` detects nested repos; `--workspace` forces it, `--single` opts out.
- Each repo gets `orchid-sdd.yml` with `extends` and allowed overrides only.
- `record --repo <id>` scopes memory; `--scope project` keeps it across iterations.
- `status` shows branch/HEAD/dirty per repo.
- `start` requires a clean tree across root and enabled repos; `--allow-dirty` is explicit.
- `close` records each repo's HEAD in the iteration snapshot. The orchestrator still performs
  per-repo commits/merges; the CLI does not run Git merges.

# Migration

`migrate` is agent-driven. The CLI does **not** invent memories.

1. `orchid-sdd migrate scan` — inspect topology, legacy knowledge, Git history.
2. `orchid-sdd migrate backup` — copy legacy assets to
   `.orchid-migration-bck/<timestamp>/` with `BACKUP.json`; never delete the source.
3. `orchid-sdd migrate init` — backup + root config + per-repo overrides + `MIGRATION.md`
   and `.orchid/migration/{PLAN.md,prompts/}`.
4. Execute the migration prompts: inventory ADRs/specs/plans/prompts/progress, seed
   `Decision`/`Requirement`/`Scenario` nodes with `--scope project`, reconstruct
   `CodeUnit` nodes from Git/file history, add anchors/docblocks.
5. `orchid-sdd index`, `lint`, `doctor`, then `migrate finalize` → `phase: ready`.

Rules: evidence over invention; one fact per node; preserve the backup; move legacy material
into `input/legacy/` only after the backup is verified; never delete the backup.

# Hard rules

1. Never auto-invoke this skill.
2. Never edit `.knowledge/**`, the manifest, or indexes by hand.
3. Never merge to the default branch during build unless an active repository steering rule explicitly permits direct mainline integration and the evidence is recorded.
4. Never review your own implementation.
5. Never pass a gate without evidence.
6. Never store secrets or personal data in knowledge.
7. Never let chat be the only place a decision exists.
8. Never deviate from the constitution without an ADR.
9. In workspace mode, never create nested knowledge or run setup inside a repo.
10. Never delete migration backups; restore from `BACKUP.json` if needed.
11. Never pass G2 or G6 with an unresolved blocking steering rule; cite evidence or record an ADR.
