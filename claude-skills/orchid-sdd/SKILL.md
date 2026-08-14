---
name: orchid-sdd
description: Explicit-only orchid-sdd SDD workflow for Claude Code. Load only when the user invokes /orchid-sdd:run.
disable-model-invocation: true
---

Read `${CLAUDE_PLUGIN_ROOT}/SKILL.md` completely and follow it as the orchid-sdd
contract. This invocation is explicit: `/orchid-sdd:run` satisfies the explicit-only
guard. Use the bundled CLI at `${CLAUDE_PLUGIN_ROOT}/bin/orchid-sdd.mjs`; it is also
available as `orchid-sdd` on the plugin Bash `PATH`.
