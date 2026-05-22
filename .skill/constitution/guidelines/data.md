# Data guidelines

- Migrations are small, ordered, and committed with the code.
- Every destructive change needs a backfill plan, a rollback path, and an ADR.
- Never lock a large table in a peak window; use an online migration pattern.
- Deactivate before deleting; record the retention window.
- Queries used on hot paths need an index and a plan.
- Backups are tested, not assumed.
- Customer data deletion is explicit, auditable, and irreversible only by decision.
