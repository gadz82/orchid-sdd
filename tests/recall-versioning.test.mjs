import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, git, initRepo, readJson, setup, start, tmp } from "./helpers.mjs";

const RECALL_FILE = path.join(".knowledge", "index", "recall.json");

function recallIndex(root) {
  return readJson(path.join(root, RECALL_FILE));
}

function recordAuth(root) {
  return cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Returning users can sign in with a passkey.", "--topics", "auth,passkeys,login");
}

// ---------------------------------------------------------------------------
// Versioning policy: recall.json is generated and ignored
// ---------------------------------------------------------------------------

test("setup ignores only the generated recall index", () => {
  const root = tmp();
  setup(root);
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

  assert.match(gitignore, /\.knowledge\/index\/recall\.json/);

  // Core indexes and the manifest stay versioned.
  assert.doesNotMatch(gitignore, /\.knowledge\/index\/topics\.json/);
  assert.doesNotMatch(gitignore, /\.knowledge\/index\/questions\.json/);
  assert.doesNotMatch(gitignore, /\.knowledge\/index\/code-anchors\.json/);
  assert.doesNotMatch(gitignore, /\.knowledge\/index\/requirements\.json/);
  assert.doesNotMatch(gitignore, /\.knowledge\/index\/dependencies\.json/);
  assert.doesNotMatch(gitignore, /\.knowledge\/index\/cross-repo-dependencies\.json/);
  assert.doesNotMatch(gitignore, /\.knowledge\/index\/repos\.json/);
  assert.doesNotMatch(gitignore, /\.knowledge\/manifest\.jsonld/);
  assert.doesNotMatch(gitignore, /\.knowledge\/events/);
});

test("AGENTS.md contains the recall rebuild/warn instruction", () => {
  const root = tmp();
  setup(root);
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");

  assert.match(agents, /recall\.json/);
  assert.match(agents, /generated and Git-ignored/);
  assert.match(agents, /orchid-sdd index/);
  assert.match(agents, /cannot be rebuilt without the orchid-sdd CLI/);
});

// ---------------------------------------------------------------------------
// Missing / stale recall.json behavior
// ---------------------------------------------------------------------------

test("index --check passes when recall.json is missing and core indexes are current", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);
  assert.equal(cli(root, "index").code, 0);

  fs.unlinkSync(path.join(root, RECALL_FILE));

  const check = cli(root, "index", "--check");
  assert.equal(check.code, 0, check.all);
});

test("index creates recall.json locally", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);

  const file = path.join(root, RECALL_FILE);
  fs.unlinkSync(file);
  assert.equal(cli(root, "index").code, 0);
  assert.ok(fs.existsSync(file), "index writes recall.json");
  assert.equal(recallIndex(root).nodes.length, 1);
});

test("doctor does not fail on a missing recall index", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);
  assert.equal(cli(root, "index").code, 0);
  fs.unlinkSync(path.join(root, RECALL_FILE));

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.out, /recall index is generated/);
});

test("recall rebuilds a deleted recall index and returns results", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);

  const file = path.join(root, RECALL_FILE);
  fs.unlinkSync(file);
  assert.ok(!fs.existsSync(file));

  const result = cli(root, "recall", "auth", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 1);
  assert.ok(fs.existsSync(file), "recall rebuilt the index");
});

test("recall rebuilds a stale recall index on demand", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);

  // record leaves recall.json stale (its lastEventId no longer matches).
  const result = cli(root, "recall", "auth", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 1);
  assert.equal(recallIndex(root).nodes.length, 1);
});

test("gate and phase events do not invalidate the recall index", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);
  assert.equal(cli(root, "index").code, 0);

  const file = path.join(root, RECALL_FILE);
  const mtime = fs.statSync(file).mtimeMs;

  // Passing a gate appends gate.passed but leaves memory unchanged.
  assert.equal(cli(root, "gate", "pass", "G1", "--note", "test").code, 0);
  assert.equal(fs.statSync(file).mtimeMs, mtime, "gate did not rewrite recall.json");

  // recall returns results without rebuilding the unchanged index.
  const result = cli(root, "recall", "auth", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 1);
  assert.equal(fs.statSync(file).mtimeMs, mtime, "recall did not rebuild after a gate");
});

test("resume advances the memory revision so recall cannot reuse a stale index", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);

  const stateFile = path.join(root, ".orchid", "state.json");
  const firstRevision = readJson(stateFile).memoryEvent;
  assert.equal(cli(root, "index").code, 0);

  assert.equal(
    cli(root, "record", "--type", "Requirement", "--alias", "R-002",
      "--description", "Email verification is required for new accounts.",
      "--topics", "auth,email,verification").code,
    0,
  );

  // Simulate a state cursor restored from before the second node.
  const stale = readJson(stateFile);
  stale.memoryEvent = firstRevision;
  stale.lastEvent = firstRevision;
  fs.writeFileSync(stateFile, `${JSON.stringify(stale, null, 2)}\n`);

  assert.equal(cli(root, "resume").code, 0);
  const result = cli(root, "recall", "auth", "--json");
  assert.equal(result.code, 0, result.all);
  const descriptions = JSON.parse(result.out).matches.map((node) => node.description);
  assert.ok(descriptions.some((description) => /Email verification/.test(description)));
});

test("recall index freshness includes the active iteration", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordAuth(root);
  assert.equal(cli(root, "index").code, 0);

  const stateFile = path.join(root, ".orchid", "state.json");
  const stale = readJson(stateFile);
  stale.activeIteration = null;
  fs.writeFileSync(stateFile, `${JSON.stringify(stale, null, 2)}\n`);

  // Build an index for the corrupted cursor, then recover it.
  const before = cli(root, "recall", "auth", "--json");
  assert.equal(before.code, 0, before.all);
  assert.equal(JSON.parse(before.out).matches.length, 0);

  assert.equal(cli(root, "resume").code, 0);
  const after = cli(root, "recall", "auth", "--json");
  assert.equal(after.code, 0, after.all);
  assert.equal(JSON.parse(after.out).matches.length, 1);
});

test("doctor warns when the recall index is still tracked by Git", () => {
  const root = tmp();
  initRepo(root, {}, "init");
  setup(root);
  // Force-track the generated index despite the .gitignore entry.
  git(root, "add", "-f", ".knowledge/index/recall.json");

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.out, /still tracked by Git/);
});
