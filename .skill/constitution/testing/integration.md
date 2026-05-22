# Integration tests

- Exercise the real boundary: database, queue, HTTP contract, filesystem.
- Use ephemeral resources and clean up deterministically.
- Test migrations against a realistic schema, including rollback.
- Assert contract shape and error mapping, not internal queries.
- Keep the suite parallel-safe; namespace data per test.
- Fail with enough context to reproduce locally.
