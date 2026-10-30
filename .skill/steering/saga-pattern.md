---
id: saga-pattern
title: SAGA pattern for distributed transactions
summary: Multi-service business transactions need explicit steps, compensation, and idempotency.
kind: architecture
authority: advisory
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [saga, distributed-transactions, compensation, idempotency, events]
---
# Rule

Use a SAGA when one business transaction spans multiple services, databases, or asynchronous
steps where a single local transaction is impossible. A SAGA is a sequence of local
transactions with a defined compensation path, not a distributed ACID transaction.

The rule is **not applicable** when the change stays inside one transactional boundary. State
that explicitly in the phase artifact rather than inventing a SAGA.

# Checks

- Every step has an owner, a local transaction, and a compensating action or a documented reason
  it cannot be compensated.
- Steps are idempotent; retries cannot duplicate side effects.
- The SAGA has persistent state or a reliable event log; progress is recoverable after a crash.
- The flow has timeouts, dead-letter handling, and a human escalation path for terminal failure.
- Ordering, duplicate delivery, partial failure, and concurrent execution are covered by tests.
- Events and payloads are versioned and observable.
- The design states whether orchestration or choreography is used and why.
- The user has accepted the consistency window and customer-visible intermediate states.

# Evidence

Record the trigger, steps, compensations, state owner, idempotency strategy, timeout policy,
and observability in `discovery/steering.md`, `assessment/steering.md`, and
`reviews/steering-review.md`. Include failure-path tests, not only the happy path.
