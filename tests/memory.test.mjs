import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, iterationDir, readJson, setup, start, tmp } from "./helpers.mjs";

function recordRequirement(root) {
  return cli(
    root,
    "record",
    "--type", "Requirement",
    "--alias", "R-001",
    "--description", "Returning users can sign in with a passkey instead of a password.",
    "--topics", "auth,passkeys,login",
    "--questions", "How do users sign in without a password?",
    "--artifact", "intent/prd.md",
  );
}

test("record projects a node and builds the indexes", () => {
  const root = tmp();
  setup(root);
  start(root);
  const recorded = recordRequirement(root);
  assert.equal(recorded.code, 0, recorded.all);

  const manifest = readJson(path.join(root, ".knowledge", "manifest.jsonld"));
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.nodes[0].aliases[0], "R-001");
  assert.equal(manifest.iteration.status, "active");

  const topics = readJson(path.join(root, ".knowledge", "index", "topics.json"));
  assert.equal(topics.auth.length, 1);
  const questions = readJson(path.join(root, ".knowledge", "index", "questions.json"));
  assert.ok(questions["How do users sign in without a password?"]);

  const check = cli(root, "index", "--check");
  assert.equal(check.code, 0, check.all);
});

test("recall works by topic, alias, question, and uuid", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordRequirement(root);
  const manifest = readJson(path.join(root, ".knowledge", "manifest.jsonld"));
  const id = manifest.nodes[0]["@id"];

  for (const query of ["auth", "R-001", "sign in", id]) {
    const result = cli(root, "recall", query);
    assert.equal(result.code, 0, result.all);
    assert.match(result.out, /Returning users can sign in with a passkey/);
  }
  const json = cli(root, "recall", "auth", "--json");
  assert.equal(json.code, 0);
  assert.equal(JSON.parse(json.out).matches.length, 1);
});

test("record validates type, description, and topics", () => {
  const root = tmp();
  setup(root);
  start(root);
  const badType = cli(root, "record", "--type", "Nope", "--description", "x", "--topics", "a,b,c");
  assert.equal(badType.code, 1);
  const badTopics = cli(root, "record", "--type", "Requirement", "--description", "A valid description here.", "--topics", "a,b");
  assert.equal(badTopics.code, 1);
  assert.match(badTopics.all, /3 to 7/);
  const badDescription = cli(root, "record", "--type", "Requirement", "--description", "x".repeat(161), "--topics", "a,b,c");
  assert.equal(badDescription.code, 1);
  assert.match(badDescription.all, /at most 160/);
});

test("lint requires anchors, docblocks, and CodeUnit nodes", () => {
  const root = tmp();
  setup(root);
  start(root);
  const uuid = cli(root, "new-uuid").out.trim();
  fs.mkdirSync(path.join(root, "src", "auth"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "auth", "passkey.mjs"),
    `// ORCHID-MEM: ${uuid} — passkey registration ceremony\nexport function register() { return true; }\n`,
  );
  const docblock = path.join(root, "docs", "knowledge", "docblocks", `${uuid}.md`);
  fs.writeFileSync(
    docblock,
    `---\nmemory: ${uuid}\ncode: src/auth/passkey.mjs#register\ntopics: [auth, passkeys, code]\nupdated: 2026-10-28\n---\n# Behavior\nRegisters a passkey.\n`,
  );

  const before = cli(root, "lint");
  assert.equal(before.code, 1, before.all);
  assert.match(before.all, /no CodeUnit node/);

  const recorded = cli(
    root,
    "record",
    "--type", "CodeUnit",
    "--id", uuid,
    "--description", "Passkey registration ceremony; challenge is single-use.",
    "--topics", "auth,passkeys,code",
    "--code", "src/auth/passkey.mjs#register",
    "--artifact", `docs/knowledge/docblocks/${uuid}.md`,
  );
  assert.equal(recorded.code, 0, recorded.all);

  const after = cli(root, "lint");
  assert.equal(after.code, 0, after.all);
  assert.match(after.out, /1 anchor\(s\)/);
});

test("lint enforces the 500-character comment limit", () => {
  const root = tmp();
  setup(root);
  start(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "long.mjs"), `// ${"x".repeat(501)}\n`);
  const result = cli(root, "lint");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /comment is 501 chars/);
});

test("index --check detects a tampered projection", () => {
  const root = tmp();
  setup(root);
  start(root);
  recordRequirement(root);
  const file = path.join(root, ".knowledge", "manifest.jsonld");
  const manifest = readJson(file);
  manifest.nodes[0].description = "tampered";
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  const check = cli(root, "index", "--check");
  assert.equal(check.code, 1, check.all);
  assert.match(check.all, /manifest\.jsonld/);
  const rebuild = cli(root, "index");
  assert.equal(rebuild.code, 0, rebuild.all);
  const clean = cli(root, "index", "--check");
  assert.equal(clean.code, 0, clean.all);
});
