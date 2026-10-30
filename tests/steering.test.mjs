import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TITLE, cli, setup, start, tmp } from "./helpers.mjs";

function editConfig(root, replacements) {
  const file = path.join(root, "orchid-sdd.yml");
  let config = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) {
    assert.ok(config.includes(from), `config does not contain ${from}`);
    config = config.replace(from, to);
  }
  fs.writeFileSync(file, config);
}

function projectRule(id = "project-rule") {
  return `---
id: ${id}
title: Project steering rule
summary: Keep the project examples current.
kind: process
authority: blocking
phases: [discovery, logic_review]
tags: [project, examples]
---
# Rule

Use the project-approved example.

# Checks

- The example still matches the delivered behavior.
`;
}

test("setup seeds steering rules and the project steering folder", () => {
  const root = tmp();
  setup(root);

  assert.ok(fs.existsSync(path.join(root, ".orchid/steering/README.md")));
  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /^steering:/m);
  assert.match(config, /architecture-boundaries/);
  assert.match(config, /logic-review-steering/);

  const list = cli(root, "steering", "list", "--json");
  assert.equal(list.code, 0, list.all);
  const rows = JSON.parse(list.out);
  const enabled = rows.filter((row) => row.enabled).map((row) => row.id);
  assert.deepEqual(enabled.sort(), [
    "architecture-boundaries",
    "code-examples",
    "code-style",
    "dependency-inversion-container",
    "discovery-steering",
    "logic-review-steering",
    "repository-flow",
    "saga-pattern",
    "solid-principles",
  ]);
  assert.ok(rows.some((row) => row.id === "architecture-hexagonal" && !row.enabled));

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.out, /steering: 9 enabled rule/);
});

test("non-interactive setup accepts steering presets", () => {
  const root = tmp();
  const result = cli(
    root,
    "setup",
    "--yes",
    "--profile",
    "backend",
    "--steering-preset",
    "architecture-hexagonal",
    "--steering-preset",
    "repository-trunk-based",
  );
  assert.equal(result.code, 0, result.all);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /architecture-hexagonal/);
  assert.match(config, /repository-trunk-based/);
  const context = cli(root, "steering", "context", "--phase", "discovery", "--json");
  assert.equal(context.code, 0, context.all);
  const ids = JSON.parse(context.out).rules.map((rule) => rule.id);
  assert.ok(ids.includes("architecture-hexagonal"));
  assert.ok(ids.includes("repository-trunk-based"));
});

test("non-interactive setup can disable steering or a steering phase", () => {
  const off = tmp();
  const disabled = cli(off, "setup", "--yes", "--profile", "backend", "--no-steering");
  assert.equal(disabled.code, 0, disabled.all);
  const offConfig = fs.readFileSync(path.join(off, "orchid-sdd.yml"), "utf8");
  assert.match(offConfig, /enabled: \[\]/);
  const offContext = cli(off, "steering", "context", "--phase", "discovery", "--json");
  assert.equal(offContext.code, 0, offContext.all);
  assert.deepEqual(JSON.parse(offContext.out).rules, []);

  const partial = tmp();
  const result = cli(
    partial,
    "setup",
    "--yes",
    "--profile",
    "backend",
    "--no-steering-discovery",
  );
  assert.equal(result.code, 0, result.all);
  const partialContext = cli(
    partial,
    "steering",
    "context",
    "--phase",
    "discovery",
    "--json",
  );
  assert.equal(partialContext.code, 0, partialContext.all);
  assert.deepEqual(JSON.parse(partialContext.out).rules, []);
  const reviewContext = cli(
    partial,
    "steering",
    "context",
    "--phase",
    "logic_review",
    "--json",
  );
  assert.equal(reviewContext.code, 0, reviewContext.all);
  assert.ok(JSON.parse(reviewContext.out).rules.length > 0);
});

test("setup --json returns a machine-readable summary", () => {
  const root = tmp();
  const result = cli(
    root,
    "setup",
    "--yes",
    "--profile",
    "backend",
    "--steering-preset",
    "architecture-hexagonal",
    "--json",
  );
  assert.equal(result.code, 0, result.all);
  const payload = JSON.parse(result.out);
  assert.equal(payload.profile, "backend");
  assert.equal(payload.state.phase, "setup");
  assert.ok(payload.steering.enabled.includes("architecture-hexagonal"));
  assert.ok(payload.steering.phases.discovery.includes("architecture-hexagonal"));
  assert.ok(payload.paths.knowledge);
});

test("non-interactive setup rejects contradictory or competing steering flags", () => {
  const root = tmp();
  const result = cli(
    root,
    "setup",
    "--yes",
    "--profile",
    "backend",
    "--no-steering",
    "--steering-preset",
    "architecture-hexagonal",
  );
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /--no-steering cannot be combined/);

  const competing = cli(
    root,
    "setup",
    "--yes",
    "--profile",
    "backend",
    "--steering-preset",
    "architecture-hexagonal",
    "--steering-preset",
    "architecture-onion",
  );
  assert.equal(competing.code, 1, competing.all);
  assert.match(competing.all, /choose at most one architecture preset/);
});

test("steering context returns the rules for discovery and logic review", () => {
  const root = tmp();
  setup(root);

  const discovery = cli(root, "steering", "context", "--phase", "discovery", "--json");
  assert.equal(discovery.code, 0, discovery.all);
  const discoveryPayload = JSON.parse(discovery.out);
  assert.equal(discoveryPayload.artifact, "discovery/steering.md");
  assert.deepEqual(
    discoveryPayload.rules.map((rule) => rule.id),
    ["architecture-boundaries", "solid-principles", "dependency-inversion-container", "code-style", "code-examples", "repository-flow", "saga-pattern", "discovery-steering"],
  );

  const review = cli(root, "steering", "context", "--phase", "logic_review", "--json");
  assert.equal(review.code, 0, review.all);
  const reviewPayload = JSON.parse(review.out);
  assert.equal(reviewPayload.artifact, "reviews/steering-review.md");
  assert.ok(reviewPayload.rules.some((rule) => rule.id === "logic-review-steering"));
  assert.ok(reviewPayload.rules.every((rule) => rule.file && rule.summary));
});

test("an optional architecture preset can be enabled for discovery", () => {
  const root = tmp();
  setup(root);
  editConfig(root, [
    [
      "enabled: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering, logic-review-steering]",
      "enabled: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering, logic-review-steering, architecture-hexagonal]",
    ],
    [
      "discovery: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering]",
      "discovery: [architecture-boundaries, solid-principles, dependency-inversion-container, architecture-hexagonal, code-style, code-examples, repository-flow, saga-pattern, discovery-steering]",
    ],
  ]);
  assert.equal(cli(root, "doctor").code, 0);
  const context = cli(root, "steering", "context", "--phase", "discovery", "--json");
  assert.equal(context.code, 0, context.all);
  const rules = JSON.parse(context.out).rules;
  assert.ok(rules.some((rule) => rule.id === "architecture-hexagonal"));
});

test("code-examples provides snippets for every supported language", () => {
  const root = tmp();
  setup(root);
  const show = cli(root, "steering", "show", "code-examples", "--json");
  assert.equal(show.code, 0, show.all);
  const rule = JSON.parse(show.out);
  const languages = [...new Set(rule.examples.map((example) => example.language))].sort();
  assert.deepEqual(languages, ["go", "java", "php", "python", "ruby", "rust", "typescript"]);
  for (const example of rule.examples) {
    assert.ok(fs.existsSync(example.file), `missing ${example.language} example`);
  }
});

test("steering show exposes the rule, its examples, and example content", () => {
  const root = tmp();
  setup(root);

  const show = cli(root, "steering", "show", "architecture-boundaries", "--json");
  assert.equal(show.code, 0, show.all);
  const rule = JSON.parse(show.out);
  assert.equal(rule.kind, "architecture");
  assert.equal(rule.authority, "blocking");
  assert.match(rule.body, /# Rule/);
  assert.equal(rule.examples.length, 2);

  const examples = cli(root, "steering", "show", "architecture-boundaries", "--examples");
  assert.equal(examples.code, 0, examples.all);
  assert.match(examples.out, /export interface UserRepository/);
});

test("a project file can override a shipped steering rule by id", () => {
  const root = tmp();
  setup(root);
  fs.writeFileSync(
    path.join(root, ".orchid/steering/architecture-boundaries.md"),
    `---
id: architecture-boundaries
extends: default
authority: advisory
phases: [discovery, logic_review]
---
# Rule

Project-specific boundary rule.
`,
  );
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  const show = cli(root, "steering", "show", "architecture-boundaries", "--json");
  assert.equal(show.code, 0, show.all);
  const rule = JSON.parse(show.out);
  assert.equal(rule.authority, "advisory");
  assert.match(rule.source, /project/);
  assert.match(rule.body, /Project-specific boundary rule/);
  assert.equal(rule.examples.length, 2);
});

test("project steering rules can be enabled and assigned to phases", () => {
  const root = tmp();
  setup(root);
  fs.writeFileSync(path.join(root, ".orchid/steering/project-rule.md"), projectRule());
  editConfig(root, [
    [
      "enabled: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering, logic-review-steering]",
      "enabled: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering, logic-review-steering, project-rule]",
    ],
    [
      "discovery: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering]",
      "discovery: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering, project-rule]",
    ],
    [
      "logic_review: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, logic-review-steering]",
      "logic_review: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, logic-review-steering, project-rule]",
    ],
  ]);

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  const context = cli(root, "steering", "context", "--phase", "discovery", "--json");
  assert.equal(context.code, 0, context.all);
  assert.ok(JSON.parse(context.out).rules.some((rule) => rule.id === "project-rule"));

  const diff = cli(root, "diff");
  assert.equal(diff.code, 0, diff.all);
  assert.match(diff.out, /steering\/project-rule\.md/);
});

test("unknown steering references fail doctor and steering commands", () => {
  const root = tmp();
  setup(root);
  editConfig(root, [
    [
      "enabled: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering, logic-review-steering]",
      "enabled: [architecture-boundaries, solid-principles, dependency-inversion-container, code-style, code-examples, repository-flow, saga-pattern, discovery-steering, logic-review-steering, missing-rule]",
    ],
  ]);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 1, doctor.all);
  assert.match(doctor.all, /unknown rule "missing-rule"/);
  const list = cli(root, "steering", "list");
  assert.equal(list.code, 1, list.all);
});

test("doctor --fix recreates the project steering folder", () => {
  const root = tmp();
  setup(root);
  fs.rmSync(path.join(root, ".orchid/steering"), { recursive: true, force: true });
  const broken = cli(root, "doctor");
  assert.equal(broken.code, 1, broken.all);
  assert.match(broken.all, /steering folder is missing/);
  const fixed = cli(root, "doctor", "--fix");
  assert.equal(fixed.code, 0, fixed.all);
  assert.ok(fs.existsSync(path.join(root, ".orchid/steering")));
});

test("phase commands report active steering and status exposes it", () => {
  const root = tmp();
  setup(root);
  start(root);
  assert.equal(cli(root, "gate", "pass", "G1", "--evidence", "intent/title.md").code, 0);
  const discover = cli(root, "discover", "--json");
  assert.equal(discover.code, 0, discover.all);
  const payload = JSON.parse(discover.out);
  assert.ok(payload.steering.includes("discovery-steering"));
  assert.equal(payload.steeringArtifact, "discovery/steering.md");

  const status = cli(root, "status", "--json");
  assert.equal(status.code, 0, status.all);
  assert.ok(JSON.parse(status.out).steering.includes("architecture-boundaries"));
});
