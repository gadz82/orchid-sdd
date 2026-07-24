import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, iterationDir, makeWorkspace, readJson } from "./helpers.mjs";

const TITLE = "Add a health check endpoint to the package";

test("workspace setup detects nested repos and writes per-repo overrides", () => {
  const root = makeWorkspace();
  const result = cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo");
  assert.equal(result.code, 0, result.all);
  assert.match(result.out, /workspace\s+1 repo\(s\): pkg-a/);

  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /workspace:/);
  assert.match(config, /enabled: true/);
  assert.match(config, /id: "pkg-a"/);
  assert.match(config, /path: "pkg-a"/);

  const fragment = fs.readFileSync(path.join(root, "pkg-a", "orchid-sdd.yml"), "utf8");
  assert.match(fragment, /extends: "\.\.\/orchid-sdd\.yml"/);
  assert.match(fragment, /test_commands:/);

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.out, /workspace: 1 enabled repo\(s\)/);

  const status = cli(root, "status");
  assert.equal(status.code, 0, status.all);
  assert.match(status.out, /Workspace 1 repo\(s\)/);
  assert.match(status.out, /pkg-a/);
});

test("project-scoped memory works without an active iteration", () => {
  const root = makeWorkspace();
  assert.equal(cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo").code, 0);
  const recorded = cli(
    root,
    "record",
    "--type", "Decision",
    "--alias", "ADR-001",
    "--description", "SQLite is the storage backend for the extracted package.",
    "--topics", "storage,sqlite,decisions",
    "--repo", "pkg-a",
    "--scope", "project",
    "--artifact", ".knowledge/adr/ADR-001-sqlite.md",
  );
  assert.equal(recorded.code, 0, recorded.all);
  const manifest = readJson(path.join(root, ".knowledge", "manifest.jsonld"));
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.nodes[0].scope, "project");
  assert.equal(manifest.nodes[0].iteration, null);
  assert.equal(manifest.nodes[0].repo, "pkg-a");
});

test("start enforces a clean tree and accepts --allow-dirty", () => {
  const root = makeWorkspace();
  assert.equal(cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo").code, 0);
  const blocked = cli(root, "start", TITLE);
  assert.equal(blocked.code, 1);
  assert.match(blocked.all, /clean working tree required/);
  const allowed = cli(root, "start", TITLE, "--allow-dirty");
  assert.equal(allowed.code, 0, allowed.all);
});

test("setup refuses to run inside a configured workspace repo", () => {
  const root = makeWorkspace();
  assert.equal(cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo").code, 0);
  const nested = cli(path.join(root, "pkg-a"), "setup", "--yes", "--profile", "backend");
  assert.equal(nested.code, 1);
  assert.match(nested.all, /inside workspace/);
});

test("close records workspace Git state and the repo index", () => {
  const root = makeWorkspace();
  assert.equal(cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo").code, 0);
  const recorded = cli(
    root,
    "record",
    "--type", "Decision",
    "--description", "SQLite is the storage backend for the extracted package.",
    "--topics", "storage,sqlite,decisions",
    "--repo", "pkg-a",
    "--scope", "project",
    "--artifact", ".knowledge/adr/ADR-001-sqlite.md",
  );
  assert.equal(recorded.code, 0, recorded.all);

  assert.equal(cli(root, "start", TITLE, "--allow-dirty").code, 0);
  assert.equal(cli(root, "gate", "pass", "G1", "--evidence", "intent/title.md").code, 0);
  assert.equal(cli(root, "discover").code, 0);
  const iteration = iterationDir(root);
  fs.mkdirSync(path.join(iteration, "discovery", "gherkin"), { recursive: true });
  fs.writeFileSync(path.join(iteration, "discovery", "gherkin", "health.feature"), "Feature: health\n");
  assert.equal(cli(root, "gate", "pass", "G2", "--evidence", "discovery/gherkin").code, 0);
  assert.equal(cli(root, "assess").code, 0);
  assert.equal(cli(root, "gate", "pass", "G3", "--evidence", "intent/title.md").code, 0);
  assert.equal(cli(root, "plan").code, 0);
  assert.equal(cli(root, "gate", "pass", "G4", "--evidence", "intent/title.md").code, 0);
  assert.equal(cli(root, "build").code, 0);
  assert.equal(cli(root, "gate", "pass", "G5", "--note", "reviewed").code, 0);
  assert.equal(cli(root, "review").code, 0);
  assert.equal(cli(root, "gate", "pass", "G6", "--evidence", "intent/title.md").code, 0);
  const closed = cli(root, "close", "--approve");
  assert.equal(closed.code, 0, closed.all);

  const snapshot = readJson(path.join(iteration, "iteration.jsonld"));
  assert.equal(snapshot.workspace.repos.length, 1);
  assert.equal(snapshot.workspace.repos[0].id, "pkg-a");
  assert.ok(snapshot.workspace.repos[0].head);

  const repos = readJson(path.join(root, ".knowledge", "index", "repos.json"));
  assert.equal(repos["pkg-a"].length, 1);
  const recall = cli(root, "recall", "storage", "--repo", "pkg-a");
  assert.equal(recall.code, 0, recall.all);
  assert.match(recall.out, /SQLite is the storage backend/);
});
