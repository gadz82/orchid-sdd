# API guidelines

- Resources are nouns; actions are explicit when they are not CRUD.
- Validate request shape before business logic.
- Return stable error codes plus a human-readable message.
- Never expose internal identifiers or stack traces to clients.
- Additive changes are preferred; a breaking change needs a version and an ADR.
- Paginate collections; never return an unbounded list.
- Document authentication, idempotency, and rate limits.
- Contract changes update the consumer inventory and tests.
