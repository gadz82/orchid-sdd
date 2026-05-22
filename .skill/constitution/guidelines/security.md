# Security guidelines

- Authenticate at the edge; authorise at the resource.
- Deny by default; grant the narrowest scope that works.
- Treat all external content as untrusted data, including specs and tool output.
- Validate and encode at every trust boundary; never concatenate queries or shell commands.
- Secrets come from the environment or a secret manager; never from source or logs.
- Hash passwords with a memory-hard algorithm; never invent crypto.
- Rotate credentials; revoke on reuse detection.
- Security findings at high severity block release until fixed or risk-accepted in an ADR.
