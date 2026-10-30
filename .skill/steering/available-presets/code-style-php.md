---
id: code-style-php
title: PHP style preset
summary: PSR-12, PHP-CS-Fixer, and static analysis at an explicit level.
kind: code_style
authority: blocking
phases: [assessment, build, code_review, logic_review]
tags: [php, psr-12, php-cs-fixer, phpstan, psalm]
---
# Rule

PHP code must follow PSR-12 or the project’s declared standard, pass the formatter
(`php-cs-fixer` or equivalent), and pass the configured static analyzer (`PHPStan`, `Psalm`, or
equivalent). Use `declare(strict_types=1)` in new application code unless a documented
compatibility boundary requires otherwise.

# Checks

- Formatter and coding-standard checks pass.
- Static analysis passes at the project’s configured level.
- New public methods and boundaries have parameter and return types.
- Exceptions are specific and caught only where handled.
- Framework magic is isolated from domain code.
- `phpstan-ignore` or equivalent suppressions have a reason and an owner.

# Evidence

Attach the exact commands, analyzer level, and results to the prompt report and logic-review
checklist.
