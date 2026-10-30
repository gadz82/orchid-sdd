---
id: code-style-go
title: Go style preset
summary: gofmt, go vet, static analysis, and meaningful error handling.
kind: code_style
authority: blocking
phases: [assessment, build, code_review, logic_review]
tags: [go, gofmt, vet, staticcheck, golangci-lint]
---
# Rule

Go code must be formatted with `gofmt`, pass `go vet`, and pass the project’s configured static
analysis (`staticcheck` or `golangci-lint`). Return errors with context; do not discard them or
panic for expected failures.

# Checks

- `gofmt -l` is empty for changed files.
- `go vet ./...` and the configured linter pass.
- Errors are wrapped with actionable context and checked before use.
- Goroutines have an owner, cancellation path, and no unbounded production.
- Interfaces are small and defined where they are consumed.
- Unsafe code and `//nolint` have a reason and an owner.

# Evidence

Attach the exact commands, versions, and results to the prompt report and logic-review
checklist.
