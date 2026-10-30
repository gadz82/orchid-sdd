---
id: code-style-python
title: Python style preset
summary: Ruff or Black, a type checker, and explicit exception handling.
kind: code_style
authority: blocking
phases: [assessment, build, code_review, logic_review]
tags: [python, ruff, black, mypy, pyright, pytest]
---
# Rule

Python code must pass the project formatter and linter (`ruff`, `black`, or the configured
equivalent) and its type checker (`mypy`, `pyright`, or equivalent). Prefer explicit exceptions
and typed boundaries over bare `except` blocks or untyped dictionaries.

# Checks

- Formatter and linter pass on changed files.
- Type checking passes at the project’s configured strictness.
- Public functions and data boundaries have useful annotations.
- Expected failures raise specific exceptions; broad catches are justified.
- Dependencies and environment assumptions are declared.
- Tests cover failure paths, not only happy paths.
- New suppressions have a reason and an owner.

# Evidence

Attach the exact formatter, linter, and type-checker commands and results to the prompt report
and logic-review checklist.
