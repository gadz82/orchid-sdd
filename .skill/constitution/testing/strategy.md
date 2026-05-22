# Test strategy

- Use the cheapest test that can prove the behaviour.
- Unit tests cover logic and edge cases; integration tests cover boundaries; e2e covers critical journeys.
- Every acceptance criterion maps to at least one test.
- Tests must be deterministic; control time, randomness, and network.
- A bug fix starts with a failing regression test.
- Coverage is a signal, not a target; untested critical paths are defects.
- Test names describe behaviour, not implementation.
