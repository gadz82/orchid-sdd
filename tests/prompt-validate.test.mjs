import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, cli, initRepo, iterationDir, setup, tmp } from "./helpers.mjs";
import { PROMPT_ALLOWED_KEYS } from "../cli/prompts.mjs";

const COLS = [
  "ID", "Kind", "Consumer", "Provider", "Contract", "Version", "Failure mode",
  "Rollout", "Consumer evidence", "Provider evidence", "Owner", "Status",
  "Last verified", "Related",
];

const ROW_DEP001 = [
  "DEP-001", "api", "orchid-api/src/orders/client.ts", "orchid-payments/POST /charge",
  "charge.v1", "1.2.0", "timeout, 4xx", "provider first", "npm test", "make integration",
  "payments", "verified", "2026-11-05", "",
];

function mdRow(cells) {
  return `| ${cells.map((cell) => (cell == null ? "" : cell)).join(" | ")} |`;
}

function ledger(rows) {
  return [mdRow(COLS), mdRow(COLS.map(() => "---")), ...rows.map((row) => mdRow(row))].join("\n") + "\n";
}

function writeLedger(root, rows) {
  fs.writeFileSync(path.join(root, ".orchid", "cross-repo-dependencies.md"), ledger(rows));
}

function makePromptWorkspace() {
  const root = tmp();
  initRepo(root, {}, "root init");
  for (const id of ["orchid-api", "orchid-payments"]) {
    initRepo(path.join(root, id), { "package.json": `{"name":"${id}"}\n` }, `${id} init`);
  }
  const result = cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo");
  assert.equal(result.code, 0, result.all);
  return root;
}

function promptMd(id, overrides = {}) {
  const fm = {
    id,
    type: "build",
    title: "A reviewable outcome",
    wave: 1,
    depends_on: [],
    personas: ["DEV", "QE"],
    scope: { write: [] },
    acceptance: [],
    dependency_refs: [],
    ...overrides,
  };
  const list = (arr) => `[${(arr || []).join(", ")}]`;
  let yaml = `id: ${fm.id}\n`;
  yaml += `type: ${fm.type}\n`;
  yaml += `title: ${fm.title}\n`;
  yaml += `wave: ${fm.wave}\n`;
  yaml += `depends_on: ${list(fm.depends_on)}\n`;
  yaml += `personas: ${list(fm.personas)}\n`;
  yaml += "scope:\n  write: []\n";
  yaml += `acceptance: ${list(fm.acceptance)}\n`;
  yaml += `dependency_refs: ${list(fm.dependency_refs)}\n`;
  return `---\n${yaml}---\n\n# Task\nDo the work.\n`;
}

function writePrompt(iteration, id, overrides = {}) {
  const dir = path.join(iteration, "plan", "prompts");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.md`), promptMd(id, overrides));
}

function startIter(root) {
  const result = cli(root, "start", "Add passkey login to the customer portal", "--allow-dirty");
  assert.equal(result.code, 0, result.all);
  return iterationDir(root);
}

test("prompt validate passes for a valid prompt with known dependency_refs", () => {
  const root = makePromptWorkspace();
  writeLedger(root, [ROW_DEP001]);
  const iteration = startIter(root);
  writePrompt(iteration, "P-001", { dependency_refs: ["DEP-001"] });

  const result = cli(root, "prompt", "validate", "--json");
  assert.equal(result.code, 0, result.all);
  const payload = JSON.parse(result.out);
  assert.equal(payload.errors.length, 0);
  assert.equal(payload.prompts.length, 1);
  assert.equal(payload.prompts[0].id, "P-001");
  assert.deepEqual(payload.prompts[0].dependency_refs, ["DEP-001"]);
  assert.equal(payload.prompts[0].dependencies.length, 1);
  assert.equal(payload.prompts[0].dependencies[0].ID, "DEP-001");
});

test("prompt validate rejects an unknown DEP-###", () => {
  const root = makePromptWorkspace();
  writeLedger(root, [ROW_DEP001]);
  const iteration = startIter(root);
  writePrompt(iteration, "P-001", { dependency_refs: ["DEP-999"] });

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /P-001\.md/);
  assert.match(result.all, /dependency_refs/);
  assert.match(result.all, /DEP-999/);
});

test("prompt validate rejects duplicate dependency_refs", () => {
  const root = makePromptWorkspace();
  writeLedger(root, [ROW_DEP001]);
  const iteration = startIter(root);
  writePrompt(iteration, "P-001", { dependency_refs: ["DEP-001", "DEP-001"] });

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /duplicate dependency "DEP-001"/);
});

test("prompt validate rejects an unknown depends_on prompt", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  writePrompt(iteration, "P-001", { depends_on: ["P-999"] });

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /depends_on/);
  assert.match(result.all, /P-999/);
});

test("prompt validate rejects duplicate prompt IDs", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  writePrompt(iteration, "P-001");
  fs.writeFileSync(path.join(iteration, "plan", "prompts", "P-001-copy.md"), promptMd("P-001"));

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /duplicate prompt id "P-001"/);
});

test("prompt validate --json returns prompts, errors, and warnings", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  writePrompt(iteration, "P-001");

  const result = cli(root, "prompt", "validate", "--json");
  assert.equal(result.code, 0, result.all);
  const payload = JSON.parse(result.out);
  assert.ok(Array.isArray(payload.prompts));
  assert.ok(Array.isArray(payload.errors));
  assert.ok(Array.isArray(payload.warnings));
  assert.equal(payload.prompts.length, 1);
  assert.equal(payload.prompts[0].file, "P-001.md");
});

test("prompt show --json includes dependency_refs when the contract exists", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  writePrompt(iteration, "P-001", { dependency_refs: ["DEP-001"] });
  assert.equal(cli(root, "prompt", "start", "P-001", "--step", "implement").code, 0);

  const show = cli(root, "prompt", "show", "P-001", "--json");
  assert.equal(show.code, 0, show.all);
  const data = JSON.parse(show.out);
  assert.deepEqual(data.dependency_refs, ["DEP-001"]);
  assert.equal(data.status, "running");
  assert.equal(data.step, "implement");
});

test("prompt validate fails on an invalid ledger", () => {
  const root = makePromptWorkspace();
  const iteration = startIter(root);
  writeLedger(root, [ROW_DEP001, ROW_DEP001]);
  writePrompt(iteration, "P-001", { dependency_refs: ["DEP-001"] });

  const result = cli(root, "prompt", "validate", "--json");
  assert.equal(result.code, 1, result.all);
  const payload = JSON.parse(result.out);
  assert.ok(payload.errors.some((error) => error.includes("duplicate ID")), "expected ledger duplicate ID error");
  assert.ok(payload.errors.some((error) => error.includes("unknown dependency")), "expected unknown dependency error");
});

test("prompt validate rejects unknown keys", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  const dir = path.join(iteration, "plan", "prompts");
  fs.writeFileSync(
    path.join(dir, "P-001.md"),
    "---\nid: P-001\ntype: build\ntitle: Do the work\nwave: 1\npersonas: [DEV]\nscope:\n  write: []\nacceptance: []\ndependency_ref: [DEP-001]\n---\n\n# Task\n",
  );

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /dependency_ref: unknown key/);
});

test("prompt validate rejects a filename that does not match id", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  const dir = path.join(iteration, "plan", "prompts");
  fs.writeFileSync(path.join(dir, "P-999.md"), promptMd("P-001"));

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /filename must be "P-001\.md"/);
});

test("prompt validate rejects invalid optional field values", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  const dir = path.join(iteration, "plan", "prompts");
  fs.writeFileSync(
    path.join(dir, "P-001.md"),
    "---\nid: P-001\ntype: build\ntitle: Do the work\nwave: 1\npersonas: [DEV]\nscope:\n  write: []\nacceptance: []\nestimate: XXL\nrepo: [a, b]\n---\n\n# Task\n",
  );

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /estimate: must be one of S, M, L/);
  assert.match(result.all, /repo: must be a string/);
});

test("prompt validate rejects non-string scope paths", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  const dir = path.join(iteration, "plan", "prompts");
  fs.writeFileSync(
    path.join(dir, "P-001.md"),
    "---\nid: P-001\ntype: build\ntitle: Do the work\nwave: 1\npersonas: [DEV]\nscope:\n  write: [1]\n  read: [{ x: y }]\nacceptance: []\n---\n\n# Task\n",
  );

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /scope\.write: must be a list of strings/);
  assert.match(result.all, /scope\.read: must be a list of strings/);
});

test("prompt validate accepts a valid prompt with optional fields omitted", () => {
  const root = tmp();
  setup(root);
  const iteration = startIter(root);
  const dir = path.join(iteration, "plan", "prompts");
  fs.writeFileSync(
    path.join(dir, "P-001.md"),
    "---\nid: P-001\ntype: build\ntitle: Do the work\nwave: 1\npersonas: [DEV, QE]\nscope:\n  write: []\nacceptance: []\n---\n\n# Task\n",
  );

  const result = cli(root, "prompt", "validate");
  assert.equal(result.code, 0, result.all);
});

test("prompt allowed keys stay aligned with the prompt schema", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, ".skill", "schemas", "prompt.schema.json"), "utf8"),
  );
  assert.deepEqual(
    [...PROMPT_ALLOWED_KEYS].sort(),
    Object.keys(schema.properties).sort(),
  );
});
