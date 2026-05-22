# Error handling

- Errors are typed and carry a stable code, a message, and context.
- Do not swallow errors; add context and rethrow or handle explicitly.
- Distinguish expected failures (validation, not found) from defects.
- Never use exceptions for normal control flow.
- Map internal errors to public errors at the boundary.
- Log once, at the boundary, with correlation information.
- Tests assert the error code, not only that an exception occurred.
