# Patterns

Prefer one established pattern per concern. A second pattern needs an ADR.

## Boundaries

- Keep transport, domain, and persistence concerns separate.
- Depend inward: domain code does not import transport or framework code.
- Put cross-cutting behaviour (auth, logging, retries) in one explicit layer.

## Composition

- Prefer constructor or parameter injection over hidden globals.
- Keep side effects at the edges; pure logic in the middle.
- A module exposes a small surface and hides its storage details.

## Reversibility

- Isolate risky integrations behind an interface.
- Feature-flag behaviour that changes customer-visible flows.
- Make migrations forward-only *and* provide a rollback script.
