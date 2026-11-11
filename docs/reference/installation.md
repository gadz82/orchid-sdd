# Installation and agent setup

[Back to README](../../README.md) · [Reference index](README.md)

orchid-sdd has two independent pieces:

1. **The CLI** — a zero-dependency Node ESM program that owns state, events,
   validation and projections.
2. **The skill contract** — `SKILL.md` and its adapters, which tell the coding
   agent how to use the CLI and when to stop for approval.

You can install either piece first. `setup` initialises the project; `skill
install` writes the agent integration.

## Requirements

- **Node.js 20+**
- Git and a POSIX-style shell
- No runtime npm dependencies

## Choose an installation path

| Situation | Recommended path |
|---|---|
| You want the `orchid-sdd` command everywhere | npm global |
| You want a project-local dependency | npm dev dependency / `npx` |
| You are developing or evaluating orchid-sdd | Git checkout + `node bin/orchid-sdd.mjs` |
| You use OpenCode | `skill install --agent opencode` |
| You use Claude Code as a plugin | `claude --plugin-dir` or marketplace |
| You use Claude Code as a skill | `skill install --agent claude-code` |
| You use Codex or another agent | `skill install --agent generic` or checkout |
| You use the Vercel skills catalogue | `npx skills add ...` |

## npm

```bash
npm install -g orchid-sdd
orchid-sdd --version

# Or per project
npm install --save-dev orchid-sdd
npx orchid-sdd --version
```

The npm package includes the CLI, `SKILL.md`, the `.skill` defaults, the design
document, the persona dossiers and the reference docs.

## Git checkout

```bash
git clone https://github.com/gadz82/orchid-sdd.git
# or: git clone git@github.com:gadz82/orchid-sdd.git
cd orchid-sdd
node bin/orchid-sdd.mjs --version
```

Run it against any project:

```bash
node /path/to/orchid-sdd/bin/orchid-sdd.mjs \
  --root /path/to/project \
  setup --yes --profile backend
```

Expose the command globally from the checkout if you prefer:

```bash
cd /path/to/orchid-sdd
npm link
orchid-sdd --version
```

## OpenCode

```bash
node /path/to/orchid-sdd/bin/orchid-sdd.mjs \
  --root /path/to/project \
  skill install --agent opencode
```

This writes:

```text
<project>/.opencode/skills/orchid-sdd/
<project>/.opencode/commands/orchid-sdd.md
```

Invoke `/orchid-sdd <command>` in the project. Add `--global` for a user-wide
install under `~/.config/opencode/`.

OpenCode uses the root `SKILL.md` and `commands/orchid-sdd.md`; nothing under
`.claude-plugin/`, `claude-skills/` or `claude-commands/` is required.

## Claude Code plugin

From a checkout:

```bash
cd /path/to/orchid-sdd
claude plugin validate .
claude --plugin-dir .
```

Invoke:

```text
/orchid-sdd:run status
/orchid-sdd:run start "Add passkey login"
```

The plugin entry is namespaced as `/orchid-sdd:run`. The plugin ships a top-level
`bin/` so Claude Code can expose the CLI on the Bash `PATH`; claude.ai Chat and
Cowork currently reject plugins with that layout, so this adapter is intended for
Claude Code.

Marketplace installation, after publishing:

```bash
claude plugin marketplace add gadz82/orchid-sdd
claude plugin install orchid-sdd@orchid-sdd
```

## Claude Code project skill

```bash
node /path/to/orchid-sdd/bin/orchid-sdd.mjs \
  --root /path/to/project \
  skill install --agent claude-code
```

This writes `.claude/skills/orchid-sdd` and uses `/orchid-sdd <command>`.
Add `--global` for `~/.claude/skills`.

## Codex and other coding agents

There is no Codex-specific package. Use the generic Agent Skills layout:

```bash
node /path/to/orchid-sdd/bin/orchid-sdd.mjs \
  --root /path/to/project \
  skill install --agent generic
```

The command writes `.agents/skills/orchid-sdd` (`~/.agents/skills` with
`--global`). Point the agent at the installed `SKILL.md` and at the CLI:

```bash
node .agents/skills/orchid-sdd/bin/orchid-sdd.mjs status
```

If the host has its own project instructions file (`AGENTS.md`, `CLAUDE.md`,
etc.), keep the explicit invocation rule there: **do not auto-load the skill**.
The skill expects `/orchid-sdd`, `/orchid-sdd:run`, or a direct CLI call.

## Vercel Agent Skills

The repository is discoverable from the root `SKILL.md`:

```bash
npx skills add gadz82/orchid-sdd --skill orchid-sdd -a opencode
```

`skills.sh.json` is the repository-page configuration for the catalogue. The
CLI copies the full package, so the local CLI and `.skill` defaults remain
available. This requires Node, shell, filesystem and Git access; it is not a
hosted-agent or edge-runtime adapter. Explicit-only behaviour depends on the
host honouring `disable-model-invocation`.

## Skill installation details

`skill install` copies `SKILL.md`, the CLI, `.skill` defaults, persona dossiers
and reference docs into a self-contained directory.

| Agent | Project skill | Global skill | Invocation |
|---|---|---|---|
| OpenCode | `.opencode/skills/orchid-sdd` | `~/.config/opencode/skills/orchid-sdd` | `/orchid-sdd <command>` |
| Claude Code | `.claude/skills/orchid-sdd` | `~/.claude/skills/orchid-sdd` | `/orchid-sdd <command>` |
| Generic Agent Skills | `.agents/skills/orchid-sdd` | `~/.agents/skills/orchid-sdd` | Load explicitly |

Options:

- `--global` — user-wide install
- `--dest DIR` — custom destination (skill only; no command file)
- `--force` — replace an existing installation
- `--dry-run` — show what would be written
- `--json` — machine-readable result

The copied skill includes its own CLI under `bin/`, but does not add that
directory to `PATH`. For hosts that do not expose the skill base path, invoke
`node <skill-dir>/bin/orchid-sdd.mjs` or install the package globally.

Installing the npm package does **not** create `.opencode/skills` or any agent
command. There is no `postinstall` side effect.

## Verify

In the target project:

```bash
orchid-sdd --version
orchid-sdd doctor
```

If you use a checkout without `npm link`, replace `orchid-sdd` with
`node /path/to/orchid-sdd/bin/orchid-sdd.mjs`.

## Quick start

```bash
cd /path/to/project

# Interactive wizard in a TTY
orchid-sdd setup

# Or explicit, agent-friendly setup
orchid-sdd setup --profile backend --project acme --yes
orchid-sdd doctor

orchid-sdd start "Add passkey login to the customer portal for returning users"
```

`setup` asks for the profile, project name, the four artifact paths, workspace
mode, personas, steering and optional model/effort routing. In automation, pass
the answers explicitly:

```bash
orchid-sdd setup \
  --yes \
  --profile backend \
  --project acme \
  --steering-preset architecture-hexagonal \
  --steering-preset repository-trunk-based \
  --json
```

Use `--no-steering` to disable steering, or
`--no-steering-discovery` / `--no-steering-logic-review` to remove it from one
phase.

### What the wizard asks

| Step | Question | What it means |
|---|---|---|
| 1 | Choose a profile | Preset for personas, tests and constitution rules |
| 2 | Name the project | Name used in status and handover output |
| 3 | Choose file locations | Knowledge, docblocks, constitution, customizations |
| 4 | Choose workspace mode | Whether the root contains several Git repositories |
| 5 | Choose who participates | PM, DEV, QE, plus specialists or custom roles |
| 6 | Choose steering rules | Standing rules for architecture, style, examples, repository flow |
| 7 | Choose routing | Optional agent/model mapping for efforts and phases |
| 8 | Review and create | Nothing is written until you confirm |

Most choices are plain YAML and can be edited later. Changing
`project.profile` later does not regenerate the dependent files.

### Generated files

```text
orchid-sdd.yml
.orchid/{state.json,constitution/,personas/,steering/,custom/,locks/}
.knowledge/{manifest.jsonld,events/,index/,context/,iterations/,input/,run-log/}
docs/knowledge/docblocks/
AGENTS.md (managed section)
.gitignore (managed section)
.github/workflows/orchid-sdd.yml
ORCHID-SDD.md
```

## Next

- [CLI reference](cli.md)
- [Phases and gates](phases.md)
- [Configuration](configuration.md)
