# Phases and gates

[Back to README](../../README.md) · [Reference index](README.md)

orchid-sdd is a phase-gated workflow. Each phase produces a concrete artifact,
then a gate records that the artifact is acceptable. The agent owns the substance;
the CLI owns state, validation and audit.

```text
setup → start → discover → assess → plan → build → review → close → handover
  G0      G1        G2        G3      G4      G5       G6       G7       G8
```

The CLI phase names are `intent`, `discovery`, `assessment`, `planning`, `build`,
`code_review` and `logic_review`. The `review` command moves from build to
`logic_review`; per-prompt code review happens inside build before G5.

## Gate summary

| Gate | Phase | Authorization | Normal executor |
|---|---|---|---|
| G0 | Setup | Setup | `orchid-sdd setup` marks it passed |
| G1 | Intent | Human | Agent after explicit approval |
| G2 | Discovery | Human only if scope changed | Agent after the consistency check |
| G3 | Assessment | Human | Agent after approval |
| G4 | Plan | Human | Agent after approval |
| G5 | Build / prompts done | Agent/reviewer | Agent after tests and CR |
| G6 | Logic review | Human | Agent after PM review |
| G7 | Closure | Human | Agent/developer after evidence |
| G8 | Handover | Human | Agent/developer after verification |

A gate is **not** passed automatically. `gate pass|fail` records the decision and
evidence:

```bash
orchid-sdd gate pass G1 --evidence intent/prd.md
orchid-sdd gate fail G2 --note "missing Gherkin for the failure path"
orchid-sdd gate status
```

Evidence is checked for existence, not semantic quality. If evidence is missing
or unacceptable, use `gate fail`; do not pass on a promise. The CLI cannot verify
who invoked the command, so “the command succeeded” is not proof of human
approval.

Phase commands do not auto-pass their predecessor:

```bash
orchid-sdd discover   # fails until G1 is passed
orchid-sdd assess     # fails until G2 is passed
orchid-sdd plan       # fails until G3 is passed
orchid-sdd build      # fails until G4 is passed
orchid-sdd review     # fails until G5 is passed
```

## G0 — Setup

**Purpose:** provision the project workspace and validate the toolchain.

`setup` writes the root config, state, artifact directories, constitution,
personas, steering, managed `AGENTS.md`/`.gitignore` sections and the CI workflow.
It marks G0 passed.

```bash
orchid-sdd setup --profile backend --yes
orchid-sdd doctor
```

Artifacts: `orchid-sdd.yml`, `.orchid/`, `.knowledge/`, `docs/knowledge/docblocks/`,
`AGENTS.md`, `.gitignore`, `.github/workflows/orchid-sdd.yml`, `ORCHID-SDD.md`.

## G1 — Intent

**Purpose:** establish what changes, why, for whom and how success will be
measured, before any implementation prompt exists.

The agent asks whether to create a feature/integration branch and which base to
use. The answer is recorded in the technical intent. It also establishes scope,
constraints, out-of-scope items and success measures.

```bash
orchid-sdd start "Add passkey login to the customer portal"
orchid-sdd gate pass G1 --evidence intent/prd.md
```

Artifacts: `intent/title.md`, `intent/prd.md`, `intent/trd.md`.

Human approval: **yes**.

## G2 — Discovery

**Purpose:** turn intent into testable requirements and observable scenarios.

Discovery captures requirements, questions/answers, Gherkin scenarios,
non-functional constraints, consistency findings and the active steering evidence.
Questionnaires are batched; answers that change scope require explicit user
confirmation.

```bash
orchid-sdd discover
orchid-sdd gate pass G2 --evidence discovery/gherkin
```

Artifacts: `discovery/prd.md`/requirements, `discovery/gherkin/*.feature`,
`discovery/questions/`, `discovery/answers/`, `discovery/steering.md`.

Human approval: **only if answers changed scope**.

## G3 — Assessment

**Purpose:** decide whether and how the change is feasible before committing to a
plan.

The assessment uses product, technical, quality, security and operational lenses.
It records options, trade-offs, accepted risks and ADRs. A time-boxed spike is
allowed when reading is not enough; spike code is disposable and its findings are
evidence, never a merge candidate.

```bash
orchid-sdd assess
orchid-sdd gate pass G3 --evidence assessment/negotiation.md
```

Artifacts: `assessment/impact/`, `assessment/negotiation.md`,
`assessment/adr/ADR-*.md`, optional `assessment/spikes/`.

Human approval: **yes** (go/no-go and accepted risk).

## G4 — Planning

**Purpose:** decompose accepted decisions into the smallest independent,
reviewable units of work.

Each prompt contract declares an ID, type (`build`, `test`, `spike`), wave,
dependencies, personas, write scopes, acceptance commands, estimate/effort and
optional cross-repo `dependency_refs`. Validation checks the DAG, unknown
references, disjoint write scopes, spike timeboxes and the cost estimate.

```bash
orchid-sdd plan
orchid-sdd prompt validate
orchid-sdd gate pass G4 --evidence plan/plan.json
```

Artifacts: `plan/plan.json`, `plan/matrix.json`, `plan/prompts/P-###.md`,
`plan/cost-estimate.md`.

Human approval: **yes** (plan, matrix and cost estimate are frozen).

## G5: Build and code review

**Purpose:** implement each prompt, verify it, review it independently and merge
it through a controlled branch.

Build uses isolated Git worktrees. A **wave** is an independently executable slice
of the prompt DAG; prompts in a wave must have disjoint write scopes and all
dependencies must be done or waived.

```bash
orchid-sdd build
orchid-sdd wave start 1
orchid-sdd prompt start P-001 --step implement
orchid-sdd prompt step P-001 --step tests
orchid-sdd prompt complete P-001 --note "tests and CR passed"
orchid-sdd wave reconcile 1 --test
orchid-sdd gate pass G5 --note "all prompts reviewed"
```

Per prompt:

1. check the expected agent/model with `route`;
2. implement in the worktree;
3. run the acceptance/tests;
4. run independent adversarial code review;
5. commit the result;
6. complete or waive the prompt;
7. reconcile the wave (merge, test, remove worktrees and branches).

Routing is task-size-aware: the prompt effort (`low`…`ultra`) maps to an expected
agent/model, and `models.mismatch: block` makes `prompt start` refuse a confirmed
mismatch. See [Models and efforts](configuration.md#models-and-efforts).

A failed prompt blocks reconciliation. Fix and retry, or waive it with a reason.
A merge conflict or failed wave test marks the wave failed; fix the branch/test
and rerun the same `wave reconcile`. Already merged prompts are skipped on retry.

Spikes use `spike/P-###`; reconciliation copies `assessment/spikes/` findings and
discards the branch. Spike code is never merged.

Human approval: **no** for each prompt; independent review + the agent own G5.
A human may review the result before G6.

## G6 — Logic review

**Purpose:** verify that the integrated behaviour still matches the product and
technical intent, not just that tests pass.

The PM logic review checks the delivered behaviour against PRD/TRD/Gherkin and
the active steering rules. Findings become fix prompts, escalations or an
explicit waiver with owner and expiry.

```bash
orchid-sdd review
orchid-sdd gate pass G6 --evidence reviews/logic-review.md
```

Artifacts: `reviews/logic-review.md`, `reviews/steering-review.md`,
`reviews/steering.md`, follow-up prompts.

Human approval: **yes**.

## G7 — Closure

**Purpose:** archive the iteration, freeze the audit trail and record the state
of every affected repository.

```bash
orchid-sdd close --approve
```

Closure archives transient run artifacts, writes the iteration snapshot and
records each repo's HEAD. It refuses to proceed while a wave is active or a prompt
branch/worktree remains.

Artifacts: `iteration.jsonld`, archived `audit/`, repo index snapshot.

Human approval: **yes** (`--approve`).

## G8 — Handover

**Purpose:** make the change understandable to the next engineer or agent.

The agent prepares `handover/HANDOVER.md` and `handover/tour.md`; a human reviews
them and accepts the handover.

This is the final iteration handover, not the in-flight `handoff` checkpoint.
`handoff` preserves an active prompt/run/step and its expected routing when you
switch harness; `handover` closes the completed iteration.

```bash
orchid-sdd handover
orchid-sdd handover --approve
```

Artifacts: `handover/HANDOVER.md`, `handover/tour.md`.

Human approval: **yes**.

## Abandon

An iteration can be abandoned without a release:

```bash
orchid-sdd abandon "descoped for this quarter"
```

This archives the iteration, records the reason and frees the active slot. It
does not merge or delete code by itself.

## Iteration artifacts

A typical iteration directory under `.knowledge/iterations/<YYYY-MM-DD-slug>/`:

```text
intent/
discovery/
assessment/
plan/
execution/runs/
reviews/
audit/
handover/
iteration.jsonld
```

The exact artifact set depends on rigor and on the prompts that were executed.

## Related reference

- [How phases map to configuration](configuration.md#phases)
- [Build waves and parallelism](configuration.md#execution)
- [Customization: adding a phase](customization.md#adding-a-phase)
- [Full design specification](../orchid-sdd-design.md)
