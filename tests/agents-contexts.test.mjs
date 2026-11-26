import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  TITLE,
  cli,
  cliWithEnv,
  initRepo,
  iterationDir,
  readJson,
  setup,
  start,
  tmp,
} from "./helpers.mjs";

function must(result) {
  assert.equal(result.code, 0, result.all);
  return result;
}

function seedProject(root) {
  fs.mkdirSync(path.join(root, "src/api"), { recursive: true });
  fs.mkdirSync(path.join(root, "src/web"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "AGENTS.md"),
    "# Project AGENTS\n\nProject instructions that must survive every switch.\n",
  );
  fs.writeFileSync(
    path.join(root, "src/api/AGENTS.md"),
    "# API project rules\n\nUse controllers for HTTP boundaries.\n",
  );
  fs.writeFileSync(
    path.join(root, "src/api/handler.ts"),
    "export function handler() { return 1; }\n",
  );
  fs.writeFileSync(
    path.join(root, "src/api/service.ts"),
    "export function service() { return 2; }\n",
  );
  fs.writeFileSync(
    path.join(root, "src/web/app.tsx"),
    "export function App() { return null; }\n",
  );
  fs.writeFileSync(
    path.join(root, "src/web/widget.tsx"),
    "export function Widget() { return null; }\n",
  );
}

function advanceToG6(root) {
  start(root);
  must(cli(root, "gate", "pass", "G1", "--evidence", "intent/title.md"));
  must(cli(root, "discover"));
  const iteration = iterationDir(root);
  fs.mkdirSync(path.join(iteration, "discovery", "gherkin"), { recursive: true });
  fs.writeFileSync(
    path.join(iteration, "discovery", "gherkin", "passkey.feature"),
    "Feature: passkey login\n",
  );
  must(cli(root, "gate", "pass", "G2", "--evidence", "discovery/gherkin"));
  must(cli(root, "assess"));
  must(cli(root, "gate", "pass", "G3", "--evidence", "intent/title.md"));
  must(cli(root, "plan"));
  must(cli(root, "gate", "pass", "G4", "--evidence", "intent/title.md"));
  must(cli(root, "build"));
  must(cli(root, "gate", "pass", "G5", "--note", "all prompts reviewed"));
  must(cli(root, "review"));
  must(cli(root, "gate", "pass", "G6", "--evidence", "intent/title.md"));
}

test("setup generates nested development contexts and preserves project AGENTS.md", () => {
  const root = tmp();
  seedProject(root);
  setup(root);

  const contexts = fs.readFileSync(path.join(root, ".orchid/agents/contexts.yml"), "utf8");
  assert.match(contexts, /^  "\.":$/m);
  assert.match(contexts, /^  "src\/api":$/m);
  assert.match(contexts, /^  "src\/web":$/m);

  const rootContext = fs.readFileSync(
    path.join(root, ".orchid/agents/agents/root/AGENTS.md"),
    "utf8",
  );
  assert.match(rootContext, /orchid-sdd development context/);
  assert.match(rootContext, /Development workflow \(orchid-sdd\)/);
  assert.match(rootContext, /src\/api/);

  const apiContext = fs.readFileSync(
    path.join(root, ".orchid/agents/agents/src-api/AGENTS.md"),
    "utf8",
  );
  assert.match(apiContext, /development context — `src\/api`/);
  assert.match(apiContext, /Use controllers for HTTP boundaries/);

  const project = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(project, /Project instructions that must survive every switch/);
  assert.match(project, /orchid-sdd memory/);
  assert.equal(project.match(/<!-- orchid-sdd:begin -->/g).length, 1);

  assert.ok(fs.existsSync(path.join(root, ".orchid/agents/sources/project/AGENTS.md")));
  assert.ok(
    fs.existsSync(path.join(root, ".orchid/agents/sources/project/src/api/AGENTS.md")),
  );
  assert.ok(fs.existsSync(path.join(root, ".orchid/agents/MANIFEST.json")));
});

test("start switches to the development context and off restores project files", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  const projectRoot = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const projectApi = fs.readFileSync(path.join(root, "src/api/AGENTS.md"), "utf8");

  start(root);
  const activeRoot = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const activeApi = fs.readFileSync(path.join(root, "src/api/AGENTS.md"), "utf8");
  assert.match(activeRoot, /orchid-sdd development context/);
  assert.match(activeApi, /development context — `src\/api`/);
  // Project guidance is preserved only in the clearly subordinate import section.
  const [contract] = activeRoot.split("## Imported project guidance");
  assert.doesNotMatch(contract, /Project instructions that must survive every switch/);

  const status = JSON.parse(must(cli(root, "status", "--json")).out);
  assert.equal(status.agents.active, true);
  assert.ok(status.agents.targets.includes("src/api"));

  must(cli(root, "agents", "off"));
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), projectRoot);
  assert.equal(fs.readFileSync(path.join(root, "src/api/AGENTS.md"), "utf8"), projectApi);
  assert.equal(fs.existsSync(path.join(root, "contexts.lock")), false);
});

test("the development switch refreshes on sync and survives resume", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  start(root);

  fs.appendFileSync(
    path.join(root, ".orchid/agents/agents/root/AGENTS.md"),
    "\n- Iteration-specific note: the payment gateway is mocked in tests.\n",
  );
  must(cli(root, "agents", "sync"));
  assert.match(
    fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"),
    /payment gateway is mocked/,
  );

  must(cli(root, "resume"));
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.agentContext.active, true);
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /development context/);

  must(cli(root, "abandon", "test cleanup"));
  assert.equal(readJson(path.join(root, ".orchid", "state.json")).agentContext.active, false);
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /Project instructions/);
});

test("prompt start writes a scoped development context pack", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  start(root);
  const iteration = iterationDir(root);
  fs.mkdirSync(path.join(iteration, "plan", "prompts"), { recursive: true });
  fs.writeFileSync(
    path.join(iteration, "plan", "prompts", "P-001.md"),
    `---
id: P-001
type: build
title: Add the API handler
wave: 1
depends_on: []
personas: [DEV]
scope:
  write: [src/api/handler.ts]
  read: [src/api/service.ts]
acceptance: [npm test]
---

# Task
Add the handler.
`,
  );
  const started = must(cli(root, "prompt", "start", "P-001"));
  const match = started.out.match(/context:\s+(\S+)/);
  assert.ok(match, started.out);
  const contextFile = path.join(root, match[1]);
  assert.ok(fs.existsSync(contextFile));
  const content = fs.readFileSync(contextFile, "utf8");
  assert.match(content, /orchid-sdd development context pack/);
  assert.match(content, /## Context: root/);
  assert.match(content, /## Context: src\/api/);
  assert.doesNotMatch(content, /## Context: src\/web/);
});

test("library copy mode restores project files without generated backups", () => {
  const root = tmp();
  seedProject(root);
  const env = { ORCHID_AGENTS_MODE: "library", ORCHID_AGENTS_COPY: "1" };
  must(cliWithEnv(root, env, "setup", "--yes", "--profile", "backend"));
  const project = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  must(cliWithEnv(root, env, "start", TITLE));
  assert.equal(fs.lstatSync(path.join(root, "AGENTS.md")).isSymbolicLink(), false);
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /development-context/);

  must(cliWithEnv(root, env, "agents", "sync"));
  must(cliWithEnv(root, env, "agents", "sync"));
  must(cliWithEnv(root, env, "agents", "off"));
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), project);
  const leftovers = fs
    .readdirSync(root)
    .filter((name) => name.startsWith("AGENTS.md.bak"));
  assert.deepEqual(leftovers, []);
  assert.equal(fs.existsSync(path.join(root, "contexts.lock")), false);
});

test("prompt scopes cannot write the project or development agent context", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  start(root);
  const iteration = iterationDir(root);
  fs.mkdirSync(path.join(iteration, "plan", "prompts"), { recursive: true });
  fs.writeFileSync(
    path.join(iteration, "plan", "prompts", "P-001.md"),
    `---
id: P-001
type: build
title: Update agent context
wave: 1
depends_on: []
personas: [DEV]
scope:
  write: [AGENTS.md, .orchid/agents/agents/root/AGENTS.md]
acceptance: [npm test]
---

# Task
Update the context.
`,
  );
  const invalid = cli(root, "prompt", "validate");
  assert.equal(invalid.code, 1, invalid.all);
  assert.match(invalid.all, /scope\.write must not touch agent context/);
  const started = cli(root, "prompt", "start", "P-001");
  assert.equal(started.code, 1, started.all);
  assert.match(started.all, /writes agent context/);
});

test("doctor fails when a switched AGENTS.md is committed", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  start(root);
  must(cli(root, "agents", "off"));
  must(cli(root, "agents", "project", "sync"));
  must(cli(root, "agents", "sync"));
  // Reproduce a manual `git add -A` while the switch was on.
  fs.writeFileSync(
    path.join(root, "AGENTS.md"),
    fs.readFileSync(path.join(root, ".orchid/agents/agents/root/AGENTS.md"), "utf8"),
  );
  initRepo(root, {}, "commit switched context");
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 1, doctor.all);
  assert.match(doctor.all, /development-context marker/);
});

test("user-managed symlinked AGENTS.md files are preserved", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "shared"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "shared/AGENTS.md"), "# Shared project context\n\nSHARED\n");
  fs.symlinkSync("shared/AGENTS.md", path.join(root, "AGENTS.md"));
  fs.writeFileSync(path.join(root, "src/a.ts"), "a\n");
  fs.writeFileSync(path.join(root, "src/b.ts"), "b\n");
  setup(root);
  assert.ok(fs.lstatSync(path.join(root, "AGENTS.md")).isSymbolicLink());

  start(root);
  const status = JSON.parse(must(cli(root, "agents", "status", "--json")).out);
  assert.equal(status.mode, "native");
  must(cli(root, "agents", "off"));
  assert.ok(fs.lstatSync(path.join(root, "AGENTS.md")).isSymbolicLink());
  assert.equal(fs.readlinkSync(path.join(root, "AGENTS.md")), "shared/AGENTS.md");
  assert.match(fs.readFileSync(path.join(root, "shared/AGENTS.md"), "utf8"), /SHARED/);
});

test("native mode survives a stale activation journal after restoration", () => {
  const root = tmp();
  seedProject(root);
  const env = { ORCHID_AGENTS_MODE: "native" };
  must(cliWithEnv(root, env, "setup", "--yes", "--profile", "backend"));
  const project = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  must(cliWithEnv(root, env, "start", TITLE));
  const journal = fs.readFileSync(
    path.join(root, ".orchid/agents/runtime/activation.json"),
    "utf8",
  );
  must(cliWithEnv(root, env, "agents", "off"));
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), project);

  // Simulate a crash after restoration but before the journal was removed.
  fs.writeFileSync(path.join(root, ".orchid/agents/runtime/activation.json"), journal);
  must(cliWithEnv(root, env, "agents", "off"));
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), project);
  assert.equal(
    fs.existsSync(path.join(root, ".orchid/agents/runtime/activation.json")),
    false,
  );
});

test("native mode activates and restores without agent-contexts", () => {
  const root = tmp();
  seedProject(root);
  const env = { ORCHID_AGENTS_MODE: "native" };
  must(cliWithEnv(root, env, "setup", "--yes", "--profile", "backend"));
  const project = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  must(cliWithEnv(root, env, "start", TITLE));
  const status = JSON.parse(must(cliWithEnv(root, env, "agents", "status", "--json")).out);
  assert.equal(status.active, true);
  assert.equal(status.mode, "native");
  assert.equal(fs.existsSync(path.join(root, "contexts.lock")), false);
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /development context/);

  must(cliWithEnv(root, env, "agents", "off"));
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), project);
});

test("close enforces agent-context maintenance for new projects", () => {
  const root = tmp();
  setup(root);
  advanceToG6(root);

  const blocked = cli(root, "close", "--approve");
  assert.equal(blocked.code, 1, blocked.all);
  assert.match(blocked.all, /agent context maintenance is required/);
  assert.match(blocked.all, /agents off/);

  must(cli(root, "agents", "off"));
  must(cli(root, "agents", "sync"));
  const stillBlocked = cli(root, "close", "--approve");
  assert.equal(stillBlocked.code, 1, stillBlocked.all);
  assert.match(stillBlocked.all, /project AGENTS\.md|agents project sync/);

  must(cli(root, "agents", "project", "sync"));
  const closed = cli(root, "close", "--approve");
  assert.equal(closed.code, 0, closed.all);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.agentContext.active, false);
});

test("close --skip-agents bypasses required maintenance", () => {
  const root = tmp();
  setup(root);
  advanceToG6(root);
  const closed = cli(root, "close", "--approve", "--skip-agents");
  assert.equal(closed.code, 0, closed.all);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.agentContext.active, false);
});

test("agents sync preserves user-curated context mappings", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  fs.mkdirSync(path.join(root, "custom"), { recursive: true });
  fs.mkdirSync(path.join(root, ".orchid/agents/custom"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".orchid/agents/custom/CTX.md"),
    "# Custom development context\n\nCUSTOM\n",
  );
  fs.appendFileSync(
    path.join(root, ".orchid/agents/contexts.yml"),
    '  "custom":\n    context_source: "./custom/CTX.md"\n    description: "user-curated context"\n',
  );
  must(cli(root, "agents", "sync"));
  const contexts = fs.readFileSync(path.join(root, ".orchid/agents/contexts.yml"), "utf8");
  assert.match(contexts, /"custom":/);
  assert.match(contexts, /\.\/custom\/CTX\.md/);
  const rows = JSON.parse(must(cli(root, "agents", "list", "--json")).out);
  assert.ok(rows.some((row) => row.target === "custom"));
});

test("close detects project AGENTS.md drift after project sync", () => {
  const root = tmp();
  setup(root);
  advanceToG6(root);
  must(cli(root, "agents", "off"));
  must(cli(root, "agents", "project", "sync"));
  must(cli(root, "agents", "sync"));
  fs.appendFileSync(path.join(root, "AGENTS.md"), "\n## Late note\n\nChanged after sync.\n");

  const blocked = cli(root, "close", "--approve");
  assert.equal(blocked.code, 1, blocked.all);
  assert.match(blocked.all, /project AGENTS\.md|agents project sync/);

  must(cli(root, "agents", "project", "sync"));
  const closed = cli(root, "close", "--approve");
  assert.equal(closed.code, 0, closed.all);
});

test("agents sync refreshes imported guidance but not local-only Serena notes", () => {
  const root = tmp();
  seedProject(root);
  fs.mkdirSync(path.join(root, ".serena/memories"), { recursive: true });
  fs.writeFileSync(path.join(root, ".serena/memories/local.md"), "LOCAL SECRET NOTE\n");
  setup(root);
  assert.equal(
    fs.existsSync(path.join(root, ".orchid/agents/sources/agent/.serena/memories/local.md")),
    false,
  );

  fs.appendFileSync(path.join(root, "AGENTS.md"), "\n## Updated guidance\n\nNEW GUIDANCE\n");
  must(cli(root, "agents", "sync"));
  const context = fs.readFileSync(
    path.join(root, ".orchid/agents/agents/root/AGENTS.md"),
    "utf8",
  );
  assert.match(context, /NEW GUIDANCE/);
  assert.doesNotMatch(context, /LOCAL SECRET NOTE/);
});

test("agents project sync updates only the managed block and keeps user prose", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  const nestedBefore = fs.readFileSync(path.join(root, "src/api/AGENTS.md"), "utf8");
  fs.appendFileSync(
    path.join(root, "AGENTS.md"),
    "\n## Team notes\n\nKeep this paragraph.\n",
  );
  must(cli(root, "agents", "project", "sync"));
  const project = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(project, /Keep this paragraph/);
  assert.match(project, /orchid-sdd memory/);
  assert.equal(project.match(/<!-- orchid-sdd:begin -->/g).length, 1);
  assert.equal(fs.readFileSync(path.join(root, "src/api/AGENTS.md"), "utf8"), nestedBefore);
  assert.ok(fs.existsSync(path.join(root, ".orchid/agents/project-context.json")));
});

test("agents project add creates a nested skeleton and never overwrites", () => {
  const root = tmp();
  setup(root);
  fs.mkdirSync(path.join(root, "src/orders"), { recursive: true });
  must(cli(root, "agents", "project", "add", "src/orders"));
  const file = path.join(root, "src/orders/AGENTS.md");
  assert.ok(fs.existsSync(file));
  assert.match(fs.readFileSync(file, "utf8"), /Project agent context for src\/orders/);
  const again = cli(root, "agents", "project", "add", "src/orders");
  assert.equal(again.code, 1, again.all);
  assert.match(again.all, /never overwrites/);
});

test("doctor detects and fixes a leftover development switch", () => {
  const root = tmp();
  seedProject(root);
  setup(root);
  start(root);
  const project = fs.readFileSync(path.join(root, ".orchid/agents/sources/project/AGENTS.md"), "utf8");

  // Simulate a crash that lost the state cursor but left the links behind.
  const stateFile = path.join(root, ".orchid/state.json");
  const state = readJson(stateFile);
  state.agentContext.active = false;
  state.agentContext.targets = [];
  state.agentContext.mode = null;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.all, /leftover agent-context activation/);
  const fixed = cli(root, "doctor", "--fix");
  assert.equal(fixed.code, 0, fixed.all);
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), project);
});

test("setup --no-agents leaves the development switch disabled", () => {
  const root = tmp();
  const result = cli(root, "setup", "--yes", "--profile", "backend", "--no-agents");
  assert.equal(result.code, 0, result.all);
  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /agents:\n  enabled: false/);
  start(root);
  assert.equal(
    readJson(path.join(root, ".orchid/state.json")).agentContext.active,
    false,
  );
  const status = JSON.parse(must(cli(root, "agents", "status", "--json")).out);
  assert.equal(status.enabled, false);
  const synced = must(cli(root, "agents", "sync"));
  assert.match(synced.out, /disabled/);
});

test("migrate scan reports nested agent context files and domains", () => {
  const root = tmp();
  seedProject(root);
  const scan = JSON.parse(must(cli(root, "migrate", "scan", "--json")).out);
  assert.ok(scan.existing.agentFiles.some((file) => file.path === "AGENTS.md"));
  assert.ok(scan.existing.agentFiles.some((file) => file.path === "src/api/AGENTS.md"));
  assert.ok(scan.agentContexts.domains.some((domain) => domain.target === "src/api"));
  assert.equal(scan.agentContexts.projectFiles, 2);
});
