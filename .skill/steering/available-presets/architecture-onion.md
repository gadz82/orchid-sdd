---
id: architecture-onion
title: Onion architecture preset
summary: Concentric layers with domain at the centre and dependencies pointing inward.
kind: architecture
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [architecture, onion, layers, dependencies]
---
# Rule

Use **concentric layers**: domain model, domain services, application services, and
infrastructure at the outside. Source-code dependencies point inward. Outer layers may depend
on inner layers; inner layers know nothing about outer layers.

Do not let “layer” become a folder ceremony. A layer exists only if it owns a distinct
responsibility and a contract that the next layer can use.

# Checks

- Domain types and rules have no infrastructure imports.
- Application services depend on interfaces, not concrete repositories or clients.
- Infrastructure implements the interfaces defined by inner layers.
- Cross-layer calls use explicit contracts and do not pass ORM/HTTP models inward.
- Tests can exercise domain and application behavior without infrastructure.

# Evidence

Record the layer and dependency decision in assessment and review artifacts. If the project
uses hexagonal terminology, pick one vocabulary rather than mixing both.
