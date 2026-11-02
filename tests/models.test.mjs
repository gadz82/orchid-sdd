import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, iterationDir, setup, start, tmp } from "./helpers.mjs";

function editConfig(root, replacements) {
  const file = path.join(root, "orchid-sdd.yml");
  let config = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) {
    assert.ok(config.includes(from), `config does not contain ${from}`);
    config = config.replace(from, to);
  }
  fs.writeFileSync(file, config);
}

function assignHigh(root, agent = "claude-code", model = "anthropic/claude-sonnet-4") {
  editConfig(root, [
    [
      `    high:\n      agent: null\n      model: null`,
      `    high:\n      agent: ${JSON.stringify(agent)}\n      model: ${JSON.stringify(model)}`,
    ],
  ]);
}

function route(root, ...args) {
  const result = cli(root, "route", ...args, "--json");
  assert.equal(result.code, 0, result.all);
  return JSON.parse(result.out);
}

test("route resolves phase effort and reports an unassigned mapping", () => {
  const root = tmp();
  setup(root);
  const payload = route(root, "--phase", "assessment", "--current-agent", "opencode");
  assert.equal(payload.effort, "high");
  assert.equal(payload.source, "models.phases.assessment");
  assert.equal(payload.expected.agent, null);
  assert.equal(payload.status, "unassigned");
  assert.match(payload.message, /models\.efforts\.high/);
});

test("route reports match, mismatch, and unknown current identities", () => {
  const root = tmp();
  setup(root);
  assignHigh(root);

  const match = route(
    root,
    "--phase",
    "assessment",
    "--current-agent",
    "claude-code",
    "--current-model",
    "anthropic/claude-sonnet-4",
  );
  assert.equal(match.status, "match");

  const mismatch = route(
    root,
    "--phase",
    "assessment",
    "--current-agent",
    "opencode",
    "--current-model",
    "openai/gpt-4.1",
  );
  assert.equal(mismatch.status, "mismatch");
  assert.match(mismatch.message, /Tell the user/);

  const unknown = route(root, "--phase", "assessment", "--current-agent", "claude-code");
  assert.equal(unknown.status, "unknown");
  assert.match(unknown.message, /could not be recognized/);
});

test("prompt routing overrides the phase effort", () => {
  const root = tmp();
  setup(root);
  editConfig(root, [
    [
      "  prompts: {}",
      `  prompts:\n    P-001: low\n    P-002:\n      build: ultra\n      code_review: extra-high`,
    ],
  ]);
  const scalar = route(root, "--phase", "build", "--prompt", "P-001");
  assert.equal(scalar.effort, "low");
  assert.equal(scalar.source, "models.prompts.P-001");

  const phased = route(root, "--phase", "code_review", "--prompt", "P-002");
  assert.equal(phased.effort, "extra-high");
  assert.equal(phased.source, "models.prompts.P-002.code_review");
});

test("prompt front matter can override the phase effort", () => {
  const root = tmp();
  setup(root);
  start(root);
  const prompts = path.join(iterationDir(root), "plan", "prompts");
  fs.mkdirSync(prompts, { recursive: true });
  fs.writeFileSync(
    path.join(prompts, "P-009.md"),
    "---\nid: P-009\ntype: build\ntitle: Test override\nwave: 1\npersonas: [DEV]\nscope: { write: [] }\nacceptance: []\neffort: ultra\n---\n# Task\nTest.\n",
  );
  const result = route(root, "--phase", "build", "--prompt", "P-009");
  assert.equal(result.effort, "ultra");
  assert.equal(result.source, "P-009.effort");
});

test("route can block a confirmed mismatch when configured", () => {
  const root = tmp();
  setup(root);
  assignHigh(root);
  editConfig(root, [["mismatch: warn", "mismatch: block"]]);
  const result = cli(
    root,
    "route",
    "--phase",
    "assessment",
    "--current-agent",
    "opencode",
    "--current-model",
    "openai/gpt-4.1",
  );
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /does not match expected/);
});

test("invalid model effort configuration fails doctor", () => {
  const root = tmp();
  setup(root);
  editConfig(root, [
    ["assessment: high", "assessment: extreme"],
    ["    high:\n      agent: null\n      model: null", "    high:\n      agent: 42\n      model: null"],
  ]);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 1, doctor.all);
  assert.match(doctor.all, /assessment.*must be one of|agent.*string or null/);
});

test("status exposes routing for the active phase", () => {
  const root = tmp();
  setup(root);
  start(root);
  const status = cli(root, "status", "--json");
  assert.equal(status.code, 0, status.all);
  const payload = JSON.parse(status.out);
  assert.equal(payload.routing.effort, "medium");
  assert.equal(payload.routing.status, "unassigned");
});
