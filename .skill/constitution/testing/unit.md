# Unit tests

- One behaviour per test; arrange, act, assert.
- No network, filesystem, or clock dependence without an explicit fake.
- Assert outcomes, not call sequences, unless the interaction is the contract.
- Cover boundaries: empty, one, many, invalid, unauthorised.
- Keep fixtures local and readable; avoid shared mutable state.
- A test that cannot fail is deleted or rewritten.
