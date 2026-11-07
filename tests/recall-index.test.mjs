import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, initRepo, readJson, setup, start, tmp } from "./helpers.mjs";

const COLS = [
  "ID", "Kind", "Consumer", "Provider", "Contract", "Version", "Failure mode",
  "Rollout", "Consumer evidence", "Provider evidence", "Owner", "Status",
  "Last verified", "Related",
];

function mdRow(cells) {
  return `| ${cells.map((cell) => (cell == null ? "" : cell)).join(" | ")} |`;
}

function ledger(rows) {
  return [mdRow(COLS), mdRow(COLS.map(() => "---")), ...rows.map((row) => mdRow(row))].join("\n") + "\n";
}

function makeDepsWorkspace() {
  const root = tmp();
  initRepo(root, {}, "root init");
  for (const id of ["orchid-api", "orchid-payments", "orchid-web"]) {
    initRepo(path.join(root, id), { "package.json": `{"name":"${id}"}\n` }, `${id} init`);
  }
  const result = cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo");
  assert.equal(result.code, 0, result.all);
  return root;
}

function writeLedger(root, rows) {
  fs.writeFileSync(path.join(root, ".orchid", "cross-repo-dependencies.md"), ledger(rows));
}

function recallIndex(root) {
  return readJson(path.join(root, ".knowledge", "index", "recall.json"));
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

test("recall index includes active and historical nodes, active wins on duplicate @id", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Decision", "--alias", "ADR-001",
    "--description", "Use SQLite as the storage backend.", "--topics", "storage,sqlite,decisions",
    "--scope", "project");
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Historical auth requirement.", "--topics", "auth,passkeys,login");
  assert.equal(cli(root, "abandon", "done").code, 0);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Active auth requirement.", "--topics", "auth,passkeys,login");

  // recall.json is derived; rebuild it explicitly before inspecting it.
  assert.equal(cli(root, "index").code, 0);
  const index = recallIndex(root);
  assert.equal(index.schemaVersion, 3);
  assert.ok(index.generatedAt);
  assert.equal(index.history.length, 1);

  const adr = index.nodes.filter((n) => (n.aliases || []).includes("ADR-001"));
  assert.equal(adr.length, 1, "project-scoped node appears once");
  assert.equal(adr[0].snapshot, null, "project-scoped node is active");

  const r1 = index.nodes.find((n) => (n.aliases || []).includes("R-001"));
  const r2 = index.nodes.find((n) => (n.aliases || []).includes("R-002"));
  assert.ok(r1.snapshot, "historical node carries a snapshot path");
  assert.equal(r2.snapshot, null, "active node has no snapshot");

  assert.equal(index.nodes.length, 3);
});

test("recall index postings resolve terms, topics, aliases, questions, and code anchors", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Returning users can sign in with a passkey.",
    "--topics", "auth,passkeys,login", "--questions", "How does auth work?",
    "--code", "src/auth.ts#login");

  assert.equal(cli(root, "index").code, 0);
  const index = recallIndex(root);
  const id = index.nodes[0].id;
  const ids = (ordinals) => ordinals.map((ordinal) => index.nodes[ordinal].id);
  assert.deepEqual(ids(index.aliasesIndex["r-001"]), [id]);
  assert.deepEqual(ids(index.topicsIndex["auth"]), [id]);
  assert.deepEqual(ids(index.questionsIndex["how does auth work?"]), [id]);
  assert.deepEqual(ids(index.codeAnchorsIndex["src/auth.ts#login"]), [id]);
  assert.ok(ids(index.terms["passkey"]).includes(id));
});

test("index --check detects a changed history snapshot via the manifest", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Historical requirement.", "--topics", "a,b,c");
  assert.equal(cli(root, "abandon", "done").code, 0);
  assert.equal(cli(root, "index").code, 0);
  assert.equal(cli(root, "index", "--check").code, 0);

  const files = fs.readdirSync(path.join(root, ".knowledge", "iterations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const snapPath = path.join(root, ".knowledge", "iterations", files[0], "iteration.jsonld");
  const snap = readJson(snapPath);
  // Tampering the iteration metadata changes the manifest history summary (a
  // versioned artifact); the generated recall.json is not drift-checked.
  snap.iteration.title = "tampered title";
  fs.writeFileSync(snapPath, `${JSON.stringify(snap, null, 2)}\n`);

  const check = cli(root, "index", "--check");
  assert.equal(check.code, 1, check.all);
  assert.match(check.all, /manifest\.jsonld/);
});

// ---------------------------------------------------------------------------
// Identifier semantics on dependency rows
// ---------------------------------------------------------------------------

test("identifier query does not match unrelated dependency rows", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", ""],
  ]);
  const result = JSON.parse(cli(root, "recall", "R-001", "--json").out);
  assert.equal(result.dependencies.length, 0);
});

// ---------------------------------------------------------------------------
// History modes and superseded ranking
// ---------------------------------------------------------------------------

test("history modes recent, all, none, and --iteration", () => {
  const root = tmp();
  setup(root);
  const titles = [
    "Add passkey login to the customer portal for returning users",
    "Add email verification to the customer portal for returning users",
    "Add account recovery to the customer portal for returning users",
    "Add device revocation to the customer portal for returning users",
  ];
  for (let i = 0; i < 4; i += 1) {
    start(root, titles[i]);
    cli(root, "record", "--type", "Requirement", "--alias", `R-10${i}`,
      "--description", `Requirement in iteration ${i + 1}.`, "--topics", "shared,alpha,beta");
    assert.equal(cli(root, "abandon", "done").code, 0);
  }
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-active",
    "--description", "Active requirement.", "--topics", "shared,alpha,beta");

  const none = JSON.parse(cli(root, "recall", "shared", "--history", "none", "--json").out).matches;
  assert.deepEqual(none.map((n) => (n.aliases || [])[0]), ["R-active"]);

  const all = JSON.parse(cli(root, "recall", "shared", "--history", "all", "--json").out).matches;
  assert.equal(all.length, 5);

  const recent = JSON.parse(cli(root, "recall", "shared", "--json").out).matches;
  assert.equal(recent.length, 4, "recent = active + last 3 closed iterations");

  const index = recallIndex(root);
  const oldest = index.history[0].iteration;
  const it = JSON.parse(cli(root, "recall", "shared", "--iteration", oldest, "--json").out).matches;
  assert.equal(it.length, 2, "--iteration targets active + one history iteration");
});

test("exact id/alias bypasses the recent history window", () => {
  const root = tmp();
  setup(root);
  start(root, "Add passkey login to the customer portal for returning users");
  cli(root, "record", "--type", "Requirement", "--alias", "R-OLD",
    "--description", "Old requirement.", "--topics", "shared,alpha,beta");
  assert.equal(cli(root, "abandon", "done").code, 0);
  // Three more closed iterations push R-OLD out of the recent window.
  for (let i = 1; i <= 3; i += 1) {
    start(root, `Add feature number ${i} to the customer portal for users`);
    cli(root, "record", "--type", "Requirement", "--alias", `R-F${i}`,
      "--description", `Filler ${i}.`, "--topics", "shared,gamma,delta");
    assert.equal(cli(root, "abandon", "done").code, 0);
  }
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-active",
    "--description", "Active requirement.", "--topics", "shared,gamma,delta");

  // Broad query respects the window: R-OLD is out of scope.
  const broad = JSON.parse(cli(root, "recall", "shared", "--json").out).matches;
  assert.ok(!broad.some((n) => (n.aliases || []).includes("R-OLD")));

  // Exact alias bypasses the window.
  const exact = JSON.parse(cli(root, "recall", "R-OLD", "--json").out).matches;
  assert.equal(exact.length, 1);
  assert.equal(exact[0].aliases[0], "R-OLD");
});

test("superseded nodes are excluded by default and included with --include-superseded", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Original requirement.", "--topics", "auth,passkeys,login");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Supersedes the original.", "--topics", "auth,passkeys,login",
    "--relation", "supersedes:R-001");

  const byDefault = JSON.parse(cli(root, "recall", "auth", "--json").out).matches;
  assert.deepEqual(byDefault.map((n) => (n.aliases || [])[0]), ["R-002"]);

  const withSuperseded = JSON.parse(
    cli(root, "recall", "auth", "--include-superseded", "--json").out,
  ).matches;
  assert.deepEqual(withSuperseded.map((n) => (n.aliases || [])[0]).sort(), ["R-001", "R-002"]);
});

// ---------------------------------------------------------------------------
// Alias resolution
// ---------------------------------------------------------------------------

test("Related resolves the active alias over historical", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", "R-001"],
  ]);
  assert.equal(cli(root, "start", "Add passkey login to the customer portal for returning users", "--allow-dirty").code, 0);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Historical R-001.", "--topics", "a,b,c");
  assert.equal(cli(root, "abandon", "done").code, 0);
  assert.equal(cli(root, "start", "Add email verification to the customer portal for returning users", "--allow-dirty").code, 0);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Active R-001.", "--topics", "d,e,f");

  const result = JSON.parse(cli(root, "recall", "DEP-001", "--json").out);
  assert.equal(result.related.length, 1);
  assert.match(result.related[0].description, /Active/);
});

test("Related resolves the most recent historical alias when there is no active match", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", "R-001"],
  ]);
  assert.equal(cli(root, "start", "Add passkey login to the customer portal for returning users", "--allow-dirty").code, 0);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Old R-001.", "--topics", "a,b,c");
  assert.equal(cli(root, "abandon", "done").code, 0);
  assert.equal(cli(root, "start", "Add email verification to the customer portal for returning users", "--allow-dirty").code, 0);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "New R-001.", "--topics", "d,e,f");
  assert.equal(cli(root, "abandon", "done").code, 0);

  const result = JSON.parse(cli(root, "recall", "DEP-001", "--json").out);
  assert.equal(result.related.length, 1);
  assert.match(result.related[0].description, /New/);
});

test("Related alias@iteration resolves the exact iteration", () => {
  const root = makeDepsWorkspace();
  const firstStart = cli(root, "start", "Add passkey login to the customer portal for returning users", "--allow-dirty");
  const firstIter = firstStart.out.split("\n")[0].replace(/^Started /, "").trim();
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Old R-001.", "--topics", "a,b,c");
  assert.equal(cli(root, "abandon", "done").code, 0);
  assert.equal(cli(root, "start", "Add email verification to the customer portal for returning users", "--allow-dirty").code, 0);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "New R-001.", "--topics", "d,e,f");
  assert.equal(cli(root, "abandon", "done").code, 0);

  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", `R-001@${firstIter}`],
  ]);

  const result = JSON.parse(cli(root, "recall", "DEP-001", "--json").out);
  assert.equal(result.related.length, 1);
  assert.match(result.related[0].description, /Old/);
});

test("unresolved Related references are reported", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", "R-999"],
  ]);
  const result = JSON.parse(cli(root, "recall", "DEP-001", "--json").out);
  assert.deepEqual(result.unresolved, ["R-999"]);
  assert.equal(result.related.length, 0);
});

// ---------------------------------------------------------------------------
// Compact summaries and budget
// ---------------------------------------------------------------------------

test("--summary is compact and --full hydrates complete nodes", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Returning users can sign in with a passkey.", "--topics", "auth,passkeys,login");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Parent requirement.", "--topics", "auth,parent,login");

  const summary = JSON.parse(cli(root, "recall", "auth", "--summary", "--json").out);
  assert.equal(summary.matches.length, 2);
  const first = summary.matches[0];
  assert.ok(first.id);
  assert.equal(first.type, "orchid:Requirement");
  assert.ok(first.description);
  assert.equal(typeof first.score, "number");
  assert.ok(first.why);
  assert.equal(first.relations, undefined, "summary omits relation bodies");
  assert.equal(first.aliases, undefined, "summary omits aliases");
  assert.equal(first.scope, "iteration");

  const full = JSON.parse(cli(root, "recall", "auth", "--full", "--json").out);
  assert.equal(full.matches.length, 2);
  assert.ok(Array.isArray(full.matches[0].aliases));
  assert.ok(full.matches[0]["@id"]);
});

test("--budget truncates deterministically", () => {
  const root = tmp();
  setup(root);
  start(root);
  for (let i = 1; i <= 5; i += 1) {
    cli(root, "record", "--type", "Requirement", "--alias", `R-00${i}`,
      "--description", `Requirement number ${i} with a somewhat longer description.`,
      "--topics", "auth,passkeys,login");
  }

  const unbudgeted = JSON.parse(cli(root, "recall", "auth", "--summary", "--json").out).matches;
  assert.equal(unbudgeted.length, 5);

  const budgeted = JSON.parse(
    cli(root, "recall", "auth", "--summary", "--budget", "400", "--json").out,
  ).matches;
  assert.ok(budgeted.length < 5, "budget drops the lowest-ranked items");
  assert.ok(budgeted.length >= 1, "budget always keeps at least one item");
});

test("--budget is measured in serialized bytes", () => {
  const root = tmp();
  setup(root);
  start(root);
  for (let i = 1; i <= 5; i += 1) {
    cli(root, "record", "--type", "Requirement", "--alias", `R-00${i}`,
      "--description", `Requirement number ${i} with a somewhat longer description.`,
      "--topics", "auth,passkeys,login");
  }

  const budget = 800;
  const result = cli(root, "recall", "auth", "--summary", "--budget", String(budget), "--json");
  assert.equal(result.code, 0, result.all);
  const payload = JSON.parse(result.out);
  assert.ok(payload.matches.length >= 1);
  assert.ok(payload.matches.length < 5);
  const size = Buffer.byteLength(result.out.trim());
  assert.ok(size <= budget, `expected <= ${budget} bytes, got ${size}`);
});

test("--include-superseded keeps partial matches that would otherwise score below zero", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Alpha beta content.", "--topics", "one,two,three");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Supersedes the original.", "--topics", "four,five,six",
    "--relation", "supersedes:R-001");

  // "gamma beta" partially matches R-001's description ("beta") but not R-002.
  const byDefault = JSON.parse(cli(root, "recall", "gamma beta", "--json").out).matches;
  assert.equal(byDefault.length, 0);

  const withSuperseded = JSON.parse(
    cli(root, "recall", "gamma beta", "--include-superseded", "--json").out,
  ).matches;
  assert.equal(withSuperseded.length, 1);
  assert.equal(withSuperseded[0].aliases[0], "R-001");
});
