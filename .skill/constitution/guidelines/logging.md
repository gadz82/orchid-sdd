# Logging and telemetry

- Log events, not prose. Include correlation ID, actor, and outcome.
- Never log secrets, tokens, passwords, full card numbers, or personal data.
- Use structured fields; avoid string concatenation.
- Log at the boundary: request in, outcome out, failure with cause.
- Metrics answer: rate, errors, duration, saturation.
- Traces cross service boundaries; propagate context.
- High-cardinality identifiers belong in traces, not metric labels.
