# Memory model

[Back to README](../../README.md) · [Reference index](README.md)

orchid-sdd keeps the *why* attached to the code. Memory is not a chat transcript:
it is a graph of typed nodes projected from append-only events.

```text
agent → record → events/*.jsonl → manifest.jsonld + index/*.json
                             └─→ index/recall.json → recall → agent
code anchor → recall → docblock → ADR / spec / plan
```

## Nodes

Every memory node has:

- a UUIDv7 `@id` (or a stable ID supplied with `--id`);
- a short description;
- topics;
- provenance (phase, persona/actor, iteration);
- a status;
- optional aliases, relations, artifacts and code anchor.

Node types:

```text
Requirement  Scenario  Question  Answer  Decision  ADR
Prompt       Run       Review    Finding CodeUnit  Message
AuditArchive Release   Assumption Test
```

Nodes are **iteration-scoped** by default. `--scope project` creates baseline
memory that survives iterations and migrations (architecture facts, repository
policy, accepted decisions).

## Record

```bash
orchid-sdd record \
  --type Requirement \
  --alias R-001 \
  --description "Returning users can sign in with a passkey." \
  --topics auth,passkeys,login \
  --artifact intent/prd.md

orchid-sdd record \
  --type Decision \
  --alias ADR-001 \
  --description "SQLite is the local storage backend." \
  --topics storage,sqlite,decisions \
  --artifact assessment/adr/ADR-001.md

orchid-sdd record \
  --type CodeUnit \
  --id <uuid> \
  --description "Passkey verification entry point." \
  --topics auth,code \
  --code src/auth.ts#login \
  --artifact docs/knowledge/docblocks/<uuid>.md
```

Useful flags: `--type`, `--description`, `--topics`, `--questions`, `--artifact`,
`--code`, `--alias`, `--relation`, `--scope`, `--repo`, `--status`, `--actor`,
`--iteration`, `--id`, `--json`.

Relations are explicit:

```bash
orchid-sdd record --type Decision --alias ADR-002 ... \
  --relation implements:urn:uuid:<requirement-id>
```

## Recall

```bash
orchid-sdd recall auth
orchid-sdd recall DEP-001
orchid-sdd recall auth --repo orchid
orchid-sdd recall DEP-001 --hops 2
orchid-sdd recall auth --limit 10
orchid-sdd recall auth --summary --budget 1200
orchid-sdd recall <id> --full
orchid-sdd recall auth --history all
```

- `recent` history is the default (last three closed iterations).
- `all` searches full history; `none` searches only the active iteration.
- Exact IDs, aliases and UUIDs search all history regardless of the window.
- `--summary` returns one-line context packs; `--full` hydrates complete nodes.
- `--budget` is measured in serialized bytes.
- `DEP-###` queries resolve the cross-repo ledger row and its related nodes.

The recall index is a cache. It is rebuilt on demand when missing or stale. Never
hand-edit it, and never copy it between projects.

## Anchors and docblocks

Significant code carries exactly one anchor:

```ts
// ORCHID-MEM: 0190f7a2-... — Verify passkey assertion and rotate session
```

The anchor is the only memory/history reference in code. The full explanation
lives in a UUID-named docblock under `docblocks_folder`:

```md
---
id: 0190f7a2-...
code: src/auth.ts#login
---

# Login

## Behaviour
...

## History
- ADR-001 — passkey rollout
- R-004 — returning-user login
```

Rules:

- one anchor per significant unit, with a short description;
- inline comments explain *why* or a non-obvious invariant, never history;
- docblocks carry behaviour and history;
- `lint` checks anchors, descriptions, docblock `History` and the inline-comment
  character limit (`docblocks.max_behavior_comment_chars`, default 500).

```bash
orchid-sdd lint
orchid-sdd lint --check
```

## Index and projections

Events are the source of truth. `index` rebuilds the manifest and core indexes:

```bash
orchid-sdd index
orchid-sdd index --check
```

Versioned:

```text
events/*.jsonl
manifest.jsonld
iteration snapshots
index/topics.json
index/questions.json
index/code-anchors.json
index/requirements.json
index/dependencies.json
index/timeline.json
index/repos.json
index/cross-repo-dependencies.json
```

Generated and Git-ignored:

```text
index/recall.json
```

A fresh clone has no `recall.json`; it is rebuilt by `orchid-sdd index` or the
first `recall`. A missing `recall.json` never fails `index --check` or `doctor`.
If an older project still tracks it:

```bash
git rm --cached .knowledge/index/recall.json
```

## Project-scoped memory

```bash
orchid-sdd record \
  --type Decision \
  --scope project \
  --repo orchid \
  --description "All services use the shared event envelope." \
  --topics events,contracts
```

Project-scoped nodes are included in every manifest and survive iteration
snapshots. Use them for facts that are true beyond the current change.

## Related reference

- [CLI: memory commands](cli.md#memory)
- [Configuration: knowledge and docblocks](configuration.md#knowledge-and-docblocks)
- [Full design specification](../orchid-sdd-design.md)
