---
description: Run the orchid-sdd SDD workflow. Explicit invocation only.
argument-hint: "[command] [args...]"
disable-model-invocation: true
---

Read `${CLAUDE_PLUGIN_ROOT}/SKILL.md` completely and follow it as the orchid-sdd
contract. The user explicitly invoked `/orchid-sdd:run`, which satisfies the
explicit-only guard. Interpret `$ARGUMENTS` as the orchid-sdd command and arguments.

Use the bundled CLI from the plugin:

```bash
orchid-sdd <command>
# or
node ${CLAUDE_PLUGIN_ROOT}/bin/orchid-sdd.mjs <command>
```
