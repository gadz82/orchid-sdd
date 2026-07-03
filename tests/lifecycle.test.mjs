import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, iterationDir, readJson, setup, start, tmp } from "./helpers.mjs";

function must(result) {
  assert.equal(result.code, 0, result.all);
  return result;
}

function advanceToG6(root) {
  start(root);
  must(cli(root, "gate", "pass", "G1", "--evidence", "intent/title.md"));
  must(cli(root, "discover"));
  const iteration = iterationDir(root);
  fs.writeFileSync(path.join(iteration, "discovery", "gherkin", "passkey.feature"), "Feature: passkey login\n");
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

test("gates are enforced in order", () => {
  const root = tmp();
  setup(root);
  start(root);
  const early = cli(root, "discover");
  assert.equal(early.code, 1);
  assert.match(early.all, /G1 must be passed/);
  const close = cli(root, "close", "--approve");
  assert.equal(close.code, 1);
  assert.match(close.all, /G6/);
});

test("the full lifecycle closes and hands over", () => {
  const root = tmp();
  setup(root);
  advanceToG6(root);

  const noApproval = cli(root, "close");
  assert.equal(noApproval.code, 1);
  assert.match(noApproval.all, /human approval/);

  const closed = cli(root, "close", "--approve");
  assert.equal(closed.code, 0, closed.all);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.activeIteration, null);
  assert.equal(state.phase, "closed");
  assert.equal(state.gates.G7, "passed");
  const iteration = readJson(path.join(iterationDir(root), "iteration.jsonld"));
  assert.equal(iteration.iteration.status, "closed");
  assert.ok(fs.existsSync(path.join(iterationDir(root), "audit", "prompts")));
  assert.ok(fs.existsSync(path.join(iterationDir(root), "audit", "runs")));

  const handoverReady = cli(root, "handover", "--force");
  assert.equal(handoverReady.code, 0, handoverReady.all);
  const accepted = cli(root, "handover", "--approve", "--force");
  assert.equal(accepted.code, 0, accepted.all);
  const finalState = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(finalState.phase, "complete");
  assert.equal(finalState.gates.G8, "passed");

  const status = cli(root, "status", "--json");
  assert.equal(status.code, 0);
  const payload = JSON.parse(status.out);
  assert.equal(payload.phase, "complete");
  assert.equal(payload.history, 1);
});

test("abandon archives the iteration and frees the slot", () => {
  const root = tmp();
  setup(root);
  start(root);
  must(cli(root, "record", "--type", "Requirement", "--description", "Returning users can sign in with a passkey.", "--topics", "auth,passkeys,login"));
  const abandoned = cli(root, "abandon", "descoped for this quarter");
  assert.equal(abandoned.code, 0, abandoned.all);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.activeIteration, null);
  assert.equal(state.phase, "abandoned");
  const snapshot = readJson(path.join(iterationDir(root), "iteration.jsonld"));
  assert.equal(snapshot.iteration.status, "abandoned");
  assert.equal(snapshot.iteration.reason, "descoped for this quarter");

  const recall = cli(root, "recall", "auth");
  assert.equal(recall.code, 0, recall.all);
  assert.match(recall.out, /Returning users can sign in with a passkey/);

  must(cli(root, "resume"));
  const resumed = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(resumed.phase, "abandoned");

  must(start(root, "Add passkey login to the customer portal"));
});

test("resume rebuilds a lost cursor from events", () => {
  const root = tmp();
  setup(root);
  start(root);
  must(cli(root, "gate", "pass", "G1", "--evidence", "intent/title.md"));
  must(cli(root, "discover"));
  const file = path.join(root, ".orchid", "state.json");
  const state = readJson(file);
  state.phase = "setup";
  state.activeIteration = null;
  state.gates.G1 = "pending";
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);

  const resumed = cli(root, "resume");
  assert.equal(resumed.code, 0, resumed.all);
  const rebuilt = readJson(file);
  assert.equal(rebuilt.phase, "discovery");
  assert.ok(rebuilt.activeIteration);
  assert.equal(rebuilt.gates.G1, "passed");
});

test("diff reports project overrides", () => {
  const root = tmp();
  setup(root);
  const override = path.join(root, ".orchid", "personas", "PM.md");
  fs.writeFileSync(override, "---\nid: PM\nauthority: advisory\n---\n# Override\n");
  const result = cli(root, "diff");
  assert.equal(result.code, 0, result.all);
  assert.match(result.out, /personas\/PM\.md/);
  assert.match(result.out, /M|override-only/);
});

test("diff uses configured customization paths", () => {
  const root = tmp();
  const result = cli(
    root,
    "setup",
    "--yes",
    "--profile", "backend",
    "--knowledge-folder", "knowledge",
    "--docblocks-folder", "docs/blocks",
    "--constitution-folder", "docs/constitution",
    "--customizations-folder", "docs/custom",
  );
  assert.equal(result.code, 0, result.all);
  const override = path.join(root, "docs/custom/templates/artifacts/prd.md");
  fs.mkdirSync(path.dirname(override), { recursive: true });
  fs.writeFileSync(override, "# Project PRD override\n");
  const diff = cli(root, "diff", "--content");
  assert.equal(diff.code, 0, diff.all);
  assert.match(diff.out, /custom\/templates\/artifacts\/prd\.md/);
  assert.match(diff.out, /Project PRD override/);
});
