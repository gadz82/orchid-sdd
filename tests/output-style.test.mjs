import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, cli, setup, start, tmp } from "./helpers.mjs";

test("lifecycle text is concise and explains labels", () => {
  const root = tmp();
  setup(root);
  start(root);

  const status = cli(root, "status");
  assert.equal(status.code, 0, status.all);
  assert.match(status.out, /Phase\s+Intent/);
  assert.match(status.out, /Intent approval \(G1\)/);
  assert.doesNotMatch(status.out, /G0:passed|models\.phases|\.knowledge/);

  const gate = cli(root, "gate", "pass", "G1", "--evidence", "intent/title.md");
  assert.equal(gate.code, 0, gate.all);
  assert.match(gate.out, /Intent approval \(G1\) approved/);
  assert.match(gate.out, /evidence: intent\/title\.md/);
  assert.doesNotMatch(gate.out, /\.knowledge/);

  const discovery = cli(root, "discover");
  assert.equal(discovery.code, 0, discovery.all);
  assert.match(discovery.out, /steering: \d+ active \(\d+ blocking\)/);
  assert.doesNotMatch(discovery.out, /•|architecture-boundaries|\.knowledge/);
});

test("handoff, resume, and route avoid internal ids and paths", () => {
  const root = tmp();
  setup(root);
  start(root);
  assert.equal(cli(root, "prompt", "start", "P-001", "--step", "implement").code, 0);

  const handoff = cli(root, "handoff", "prepare", "--reason", "switch");
  assert.equal(handoff.code, 0, handoff.all);
  assert.match(handoff.out, /Checkpoint saved for development prompt P-001/);
  assert.doesNotMatch(handoff.out, /\.knowledge|\/tmp|\/Users|handoff-[0-9a-f-]+/);

  const resume = cli(root, "resume");
  assert.equal(resume.code, 0, resume.all);
  assert.match(resume.out, /Resumed at /);
  assert.doesNotMatch(resume.out, /last event|\.knowledge|models\.|handoff-[0-9a-f-]+/);

  const route = cli(root, "route", "--phase", "discovery");
  assert.equal(route.code, 0, route.all);
  assert.match(route.out, /Model check: Discovery phase/);
  assert.doesNotMatch(route.out, /models\.|agent=|effort:/);
});

test("the skill states the output budget and phase-specific shape", () => {
  const skill = fs.readFileSync(path.join(ROOT, "SKILL.md"), "utf8");
  assert.match(skill, /one outcome line, at most\s+three bullets/i);
  assert.match(skill, /Shape the update for the phase/);
  assert.match(skill, /Intent \| Goal, users, success measure/);
});
