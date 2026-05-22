# Coding guidelines

- Optimise for the next reader, not the next token.
- Functions do one thing; names say what that thing is.
- Avoid boolean flag parameters that change behaviour; use named options.
- Keep modules cohesive; split before a file becomes a junk drawer.
- Delete dead code instead of commenting it out.
- Do not add a dependency for something the standard library does well.
- Prefer explicit error propagation over silent fallbacks.
- Keep public APIs narrow; make the rest private by default.
