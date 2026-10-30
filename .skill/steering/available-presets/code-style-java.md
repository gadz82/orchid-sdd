---
id: code-style-java
title: Java style preset
summary: Spotless or Checkstyle, static analysis, and explicit nullability.
kind: code_style
authority: blocking
phases: [assessment, build, code_review, logic_review]
tags: [java, spotless, checkstyle, error-prone, nullability]
---
# Rule

Java code must pass the project formatter (`Spotless`, `google-java-format`, or equivalent), its
Checkstyle/PMD rules, and the configured static analyzer (`Error Prone`, SpotBugs, Sonar, or
equivalent). Public boundaries should have explicit nullability or validation contracts.

# Checks

- Formatter and style checks pass.
- Static analysis and the build pass without new blocking findings.
- Public APIs document nullability, validation, and exceptions.
- Checked exceptions are used only where callers can act.
- Framework annotations stay out of domain types.
- New suppressions have a reason and an owner.
- Tests cover failure paths and boundary conditions.

# Evidence

Attach the exact formatter, analyzer, and test commands and results to the prompt report and
logic-review checklist.
