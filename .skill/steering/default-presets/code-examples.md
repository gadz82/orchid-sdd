---
id: code-examples
title: Code examples are executable contracts
summary: Examples are small, current, runnable illustrations of the desired style and boundaries.
kind: example
authority: advisory
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [examples, style, snippets, tests, cross-language]
examples:
  - path: ../examples/typescript/domain-service.ts
    title: "Domain service with an explicit port"
    language: typescript
  - path: ../examples/typescript/hexagonal-port.ts
    title: "Port and adapter boundary"
    language: typescript
  - path: ../examples/typescript/domain-service.test.ts
    title: "Test at the domain boundary"
    language: typescript
  - path: ../examples/go/domain_service.go
    title: "Go domain service with a repository port"
    language: go
  - path: ../examples/python/domain_service.py
    title: "Python domain service with a protocol"
    language: python
  - path: ../examples/php/DomainService.php
    title: "PHP domain service with a repository interface"
    language: php
  - path: ../examples/rust/domain_service.rs
    title: "Rust domain service with a trait"
    language: rust
  - path: ../examples/java/DeactivateUser.java
    title: "Java domain service with an interface"
    language: java
  - path: ../examples/ruby/domain_service.rb
    title: "Ruby domain service with dependency injection"
    language: ruby
---
# Rule

Examples show the **shape** of acceptable code in the project’s actual language. They are not
copy-paste inventory, and they are not a substitute for the constitution. The shipped examples
cover TypeScript, Go, Python, PHP, Rust, Java, and Ruby; use the closest one and adapt its
idioms. Every example must:

- be small enough to read in one screen;
- compile or be explicitly labelled as pseudocode;
- show the boundary, the error path, and the test seam;
- use the project’s real names and types where an equivalent exists;
- remain current when the rule, API, or pattern changes.

Prefer one complete example over many fragments. Put examples next to the rule and link them
from the discovery or planning artifact that applies them.

# Checks

- Does the example demonstrate the rule rather than merely restating it?
- Does it show failure handling and not only the happy path?
- Is it consistent with the current public contracts?
- Is the example path referenced by the rule or the phase artifact?
- Would a reviewer know which parts are illustrative and which are mandatory?

# Evidence

- Discovery: record which examples inform the requirement or acceptance criteria.
- Planning: cite examples in prompt constraints.
- Build and code review: compare the change with the example, not by visual similarity alone.
- Logic review: verify that examples still describe the delivered behaviour.

# Exceptions

An example may be intentionally incomplete when it is labelled as a sketch. It must not be used
as positive evidence for a production change until it is complete.
