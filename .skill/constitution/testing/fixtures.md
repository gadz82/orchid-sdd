# Fixtures and factories

- Factories build valid objects by default; tests override only what matters.
- Fixtures are deterministic and free of production data.
- Never share mutable fixtures across tests.
- Seed data is explicit, minimal, and named after the scenario.
- Snapshot tests are allowed only for stable, intentional output.
- Cleanup is part of the fixture contract.
