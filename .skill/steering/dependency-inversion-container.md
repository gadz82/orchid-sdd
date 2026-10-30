---
id: dependency-inversion-container
title: Dependency inversion and DI containers
summary: Wire dependencies explicitly at the boundary; a container is optional.
kind: architecture
authority: advisory
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [solid, dependency-inversion, dependency-injection, composition, di]
---
# Rule

Depend on explicit contracts, not on concrete infrastructure. Wire implementations at a
**composition root** so the application does not construct its own database, HTTP client,
clock, or third-party SDK.

A dependency-injection container is one valid way to perform that wiring. It is not mandatory.
Constructor injection, factory functions, module wiring, or explicit configuration are equally
valid when they keep the graph readable and testable. Do not introduce a container merely to
hide dependency relationships.

# Checks

- The dependency graph is assembled at an explicit composition root.
- Application and domain units receive collaborators; they do not fetch them from ambient state.
- A container, if used, has explicit lifetimes and scope; no captured request state in singletons.
- No service-locator pattern hides dependencies behind a global registry.
- Interfaces are owned by the consumer side where that keeps the contract focused.
- Tests can replace every external dependency with a deterministic double.
- Circular dependencies are rejected or resolved through an explicit boundary, not lazy loading.

# Evidence

Record the composition root, injected contracts, lifetimes, and test replacements in
`assessment/steering.md` and `reviews/steering-review.md`. If the project uses no container,
state how wiring is done instead.

# Exceptions

A framework-managed container is acceptable when the framework owns the lifecycle. Name the
scope boundary and the tests that prove request state is not shared accidentally.
