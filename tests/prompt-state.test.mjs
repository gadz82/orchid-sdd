import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, iterationDir, readJson, setup, start, tmp } from "./helpers.mjs";

test("prompt execution state survives step and completion transitions", () => {
  const root = tmp();
  setup(root);
  start(root);

  const started = cli(root, "prompt", "start", "P-001", "--step", "implement", "--json");
  assert.equal(started.code, 0, started.all);
  let prompt = JSON.parse(started.out).prompt;
  assert.equal(prompt.status, "running");
  assert.equal(prompt.step, "implement");
  assert.equal(prompt.attempt, 1);

  const stepped = cli(root, "prompt", "step", "P-001", "--step", "tests", "--json");
  assert.equal(stepped.code, 0, stepped.all);
  prompt = JSON.parse(stepped.out);
  assert.equal(prompt.step, "tests");

  const completed = cli(root, "prompt", "complete", "P-001", "--note", "done", "--json");
  assert.equal(completed.code, 0, completed.all);
  prompt = JSON.parse(completed.out);
  assert.equal(prompt.status, "done");

  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.currentPrompt, null);
  assert.equal(state.prompts["P-001"].status, "done");
  assert.equal(state.runs[prompt.runId].status, "completed");
});

test("a new iteration does not inherit prompt attempts or active cursors", () => {
  const root = tmp();
  setup(root);
  start(root);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  assert.equal(cli(root, "abandon", "done").code, 0);
  start(root, "Add email verification to the customer portal");
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.deepEqual(state.prompts, {});
  assert.deepEqual(state.runs, {});
  assert.deepEqual(state.activePrompts, {});
  assert.deepEqual(state.currentWaves, {});
  assert.equal(state.currentWave, null);
  assert.equal(state.lastWave, null);
  assert.equal(state.lastHandoff, null);
  assert.equal(state.currentPrompt, null);
  assert.equal(state.currentRun, null);
});

test("resume replays prompt and run state from events", () => {
  const root = tmp();
  setup(root);
  start(root);
  assert.equal(cli(root, "prompt", "start", "P-001", "--step", "implement").code, 0);
  assert.equal(cli(root, "prompt", "step", "P-001", "--step", "tests").code, 0);

  const stateFile = path.join(root, ".orchid", "state.json");
  const state = readJson(stateFile);
  state.prompts = {};
  state.runs = {};
  state.currentPrompt = null;
  state.currentRun = null;
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);

  const resumed = cli(root, "resume");
  assert.equal(resumed.code, 0, resumed.all);
  const list = cli(root, "prompt", "list", "--json");
  assert.equal(list.code, 0, list.all);
  const prompts = JSON.parse(list.out);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].id, "P-001");
  assert.equal(prompts[0].step, "tests");
  const rebuilt = readJson(stateFile);
  assert.equal(rebuilt.currentPrompt, "P-001");
  assert.equal(rebuilt.currentRun, prompts[0].runId);
});

test("prompt state updates an existing matrix entry", () => {
  const root = tmp();
  setup(root);
  start(root);
  const iteration = iterationDir(root);
  const planDir = path.join(iteration, "plan");
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(
    path.join(planDir, "matrix.json"),
    `${JSON.stringify({ prompts: [{ id: "P-001", status: "planned" }] }, null, 2)}\n`,
  );
  assert.equal(cli(root, "prompt", "start", "P-001", "--step", "implement").code, 0);
  let matrix = readJson(path.join(planDir, "matrix.json"));
  assert.equal(matrix.prompts[0].status, "running");
  assert.equal(matrix.prompts[0].step, "implement");
  assert.equal(cli(root, "prompt", "complete", "P-001", "--note", "done").code, 0);
  matrix = readJson(path.join(planDir, "matrix.json"));
  assert.equal(matrix.prompts[0].status, "done");
});

test("resume automatically accepts the latest handoff", () => {
  const root = tmp();
  setup(root);
  start(root);
  assert.equal(cli(root, "prompt", "start", "P-001", "--step", "tests").code, 0);
  const prepared = cli(root, "handoff", "prepare", "--reason", "switch model", "--json");
  assert.equal(prepared.code, 0, prepared.all);
  const handoff = JSON.parse(prepared.out);
  const resumed = cli(
    root,
    "resume",
    "--current-agent",
    "claude-code",
    "--current-model",
    "anthropic/claude-sonnet-4",
    "--json",
  );
  assert.equal(resumed.code, 0, resumed.all);
  const payload = JSON.parse(resumed.out);
  assert.equal(payload.handoff, handoff.id);
  assert.equal(payload.currentPrompt, "P-001");
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.lastHandoff, handoff.id);
});

test("handoff prepares and accepts a portable execution checkpoint", () => {
  const root = tmp();
  setup(root);
  start(root);
  assert.equal(cli(root, "prompt", "start", "P-001", "--step", "tests").code, 0);

  const prepared = cli(root, "handoff", "prepare", "--reason", "switch model", "--json");
  assert.equal(prepared.code, 0, prepared.all);
  const handoff = JSON.parse(prepared.out);
  assert.equal(handoff.prompt, "P-001");
  assert.equal(handoff.reason, "switch model");
  assert.equal(handoff.prompts["P-001"].step, "tests");
  assert.ok(fs.existsSync(path.join(root, handoff.file)));

  const listed = cli(root, "handoff", "list", "--json");
  assert.equal(listed.code, 0, listed.all);
  assert.ok(JSON.parse(listed.out).some((entry) => entry.id === handoff.id));

  const accepted = cli(
    root,
    "handoff",
    "accept",
    handoff.id,
    "--current-agent",
    "opencode",
    "--current-model",
    "openai/gpt-4.1",
    "--json",
  );
  assert.equal(accepted.code, 0, accepted.all);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.lastHandoff, handoff.id);
});
