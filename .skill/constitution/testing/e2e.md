# End-to-end tests

- Cover the critical customer journeys, not every screen.
- Use stable selectors tied to accessible roles or test IDs.
- Control external services with deterministic fakes.
- Assert the outcome the user sees, not implementation details.
- Keep the suite small and fast; quarantine flaky tests immediately.
- Every e2e failure names the scenario, the step, and the evidence.
