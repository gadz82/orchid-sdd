---
id: architecture-event-driven
title: Event-driven architecture preset
summary: Events are versioned facts with idempotent consumers and explicit failure handling.
kind: architecture
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [architecture, events, messaging, outbox, idempotency]
---
# Rule

Use events when a business fact must be broadcast without coupling the producer to every
consumer. An event is a stable, versioned fact in the past tense, not a remote procedure call in
disguise.

Define ownership, delivery expectations, ordering, schema evolution, duplicate handling, and
the failure path before writing the producer.

# Checks

- Each event has an owner, a schema version, and a documented compatibility policy.
- Consumers are idempotent and tolerate duplicate or out-of-order delivery.
- The producer uses an outbox or an equivalent atomic publish strategy.
- Failures reach a dead-letter path with replay and ownership.
- Event payloads contain stable identifiers and do not leak internal persistence models.
- Consumers cannot block the producer indefinitely.
- Observability traces the event from producer to terminal consumer.

# Evidence

Record the event catalogue, delivery guarantee, schema version, idempotency key, and failure
path in assessment and review artifacts.
