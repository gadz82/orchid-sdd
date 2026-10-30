---
id: code-style-rust
title: Rust style preset
summary: rustfmt, clippy, tests, and justified unsafe code.
kind: code_style
authority: blocking
phases: [assessment, build, code_review, logic_review]
tags: [rust, rustfmt, clippy, cargo, unsafe]
---
# Rule

Rust code must be formatted with `rustfmt`, pass `cargo clippy` at the project’s configured
level, and pass `cargo test`. Prefer explicit error types and `?` propagation over panics for
expected failure. `unsafe` requires a safety comment and an owner.

# Checks

- `cargo fmt --check` passes.
- `cargo clippy` passes with the configured deny/warn policy.
- `cargo test` passes, including failure paths.
- Error enums or types are meaningful and preserve source context.
- `unsafe` blocks document the invariant they require and why they are sound.
- Public APIs have clear ownership and lifetime contracts.
- New `allow` attributes have a reason and an owner.

# Evidence

Attach the exact toolchain, commands, and results to the prompt report and logic-review
checklist.
