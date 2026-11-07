import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, initRepo, iterationDir, readJson, setup, start, tmp } from "./helpers.mjs";

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

test("recall DEP-001 returns the row and resolves related ADR/test nodes", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/src/orders/client.ts", "orchid-payments/POST /charge",
      "charge.v1", "1.2.0", "timeout, 4xx", "provider first", "npm test", "make integration",
      "payments", "verified", "2026-11-05", "ADR-012, T-044"],
  ]);
  cli(root, "record", "--type", "Decision", "--alias", "ADR-012",
    "--description", "Use SQLite as the payment ledger store.", "--topics", "storage,sqlite,decisions",
    "--scope", "project", "--repo", "orchid-api");
  cli(root, "record", "--type", "Test", "--alias", "T-044",
    "--description", "Charge contract regression test.", "--topics", "payments,contract,test",
    "--scope", "project", "--repo", "orchid-payments");

  const json = cli(root, "recall", "DEP-001", "--json");
  assert.equal(json.code, 0, json.all);
  const result = JSON.parse(json.out);
  assert.equal(result.dependencies.length, 1);
  assert.equal(result.dependencies[0].ID, "DEP-001");
  assert.equal(result.dependencies[0].Contract, "charge.v1");
  assert.equal(result.matches.length, 0);
  const relatedAliases = result.related.map((node) => (node.aliases || [])[0]).sort();
  assert.deepEqual(relatedAliases, ["ADR-012", "T-044"]);

  const text = cli(root, "recall", "DEP-001");
  assert.equal(text.code, 0, text.all);
  assert.match(text.out, /## DEP-001 — dependency/);
  assert.match(text.out, /- kind: api/);
  assert.match(text.out, /- related: ADR-012 /);
});

test("multi-word query ranking is deterministic", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement",
    "--description", "Returning users can sign in with a passkey.",
    "--topics", "auth,passkeys,login");
  cli(root, "record", "--type", "Requirement",
    "--description", "Users can sign in with a password.",
    "--topics", "auth,passwords,login");

  const result = cli(root, "recall", "returning users sign in", "--json");
  assert.equal(result.code, 0, result.all);
  const matches = JSON.parse(result.out).matches;
  assert.equal(matches.length, 2);
  assert.match(matches[0].description, /passkey/);
  assert.match(matches[1].description, /password/);
});

test("--limit caps both matches and dependencies", () => {
  const root = makeDepsWorkspace();
  for (let i = 1; i <= 3; i += 1) {
    cli(root, "record", "--type", "Requirement", "--alias", `R-00${i}`,
      "--description", `Auth requirement ${i}.`, "--topics", "auth,passkeys,login",
      "--scope", "project", "--repo", "orchid-api");
  }
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x1", "orchid-payments/y1", "c1", "1", "f", "n/a", "", "", "auth", "open", "", ""],
    ["DEP-002", "api", "orchid-api/x2", "orchid-payments/y2", "c2", "1", "f", "n/a", "", "", "auth", "open", "", ""],
    ["DEP-003", "api", "orchid-api/x3", "orchid-payments/y3", "c3", "1", "f", "n/a", "", "", "auth", "open", "", ""],
  ]);

  const full = JSON.parse(cli(root, "recall", "auth", "--json").out);
  assert.equal(full.matches.length, 3);
  assert.equal(full.dependencies.length, 3);

  const capped = JSON.parse(cli(root, "recall", "auth", "--limit", "1", "--json").out);
  assert.equal(capped.matches.length, 1);
  assert.equal(capped.dependencies.length, 1);
});

test("--repo filters dependency rows by consumer/provider", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/src/orders", "orchid-payments/POST /charge", "payment-api", "1", "f", "n/a", "", "", "payments", "open", "", ""],
    ["DEP-002", "api", "orchid-web/src/cart", "orchid-api/order.created", "payment-api", "1", "f", "n/a", "", "", "api", "open", "", ""],
  ]);

  const byPayments = JSON.parse(cli(root, "recall", "payment-api", "--repo", "orchid-payments", "--json").out);
  assert.deepEqual(byPayments.dependencies.map((row) => row.ID), ["DEP-001"]);
  const byWeb = JSON.parse(cli(root, "recall", "payment-api", "--repo", "orchid-web", "--json").out);
  assert.deepEqual(byWeb.dependencies.map((row) => row.ID), ["DEP-002"]);
});

test("--hops 2 reaches a related node two hops away", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Root requirement.", "--topics", "root,alpha,beta");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Child depends on the root.", "--topics", "child,alpha,gamma",
    "--relation", "partOf:R-001");
  cli(root, "record", "--type", "Requirement", "--alias", "R-003",
    "--description", "Grandchild depends on the child.", "--topics", "grand,delta,epsilon",
    "--relation", "partOf:R-002");

  const oneHop = JSON.parse(cli(root, "recall", "R-001", "--hops", "1", "--json").out);
  assert.equal(oneHop.matches.length, 1);
  assert.deepEqual(oneHop.related.map((node) => (node.aliases || [])[0]).sort(), ["R-002"]);

  const twoHop = JSON.parse(cli(root, "recall", "R-001", "--hops", "2", "--json").out);
  assert.deepEqual(twoHop.related.map((node) => (node.aliases || [])[0]).sort(), ["R-002", "R-003"]);
});

test("history/closed-iteration recall still works", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Returning users can sign in with a passkey.",
    "--topics", "auth,passkeys,login");
  assert.equal(cli(root, "abandon", "descoped for this quarter").code, 0);

  const result = cli(root, "recall", "R-001", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 1);
});

test("doctor resolves Related and relation targets pinned with alias@iteration", () => {
  const root = makeDepsWorkspace();
  assert.equal(cli(root, "start", "Pinned dependency iteration", "--allow-dirty").code, 0);
  const iteration = path.basename(iterationDir(root));
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Historical pinned requirement.", "--topics", "a,b,c");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Related to a pinned iteration.", "--topics", "d,e,f",
    "--relation", `partOf:R-001@${iteration}`);
  assert.equal(cli(root, "abandon", "done").code, 0);

  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", `R-001@${iteration}`],
  ]);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.doesNotMatch(doctor.all, /references unresolved Related/);
  assert.doesNotMatch(doctor.all, /targets unresolved/);
});

test("doctor fails on duplicate aliases and dangling relations", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "DUP",
    "--description", "First duplicate alias.", "--topics", "a,b,c");
  cli(root, "record", "--type", "Requirement", "--alias", "DUP",
    "--description", "Second duplicate alias.", "--topics", "d,e,f");
  cli(root, "record", "--type", "Requirement",
    "--description", "Dangling relation.", "--topics", "g,h,i",
    "--relation", "partOf:MISSING-001");

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 1, doctor.all);
  assert.match(doctor.all, /duplicate iteration-scoped alias "dup"/);
  assert.match(doctor.all, /targets unresolved/);
});

test("doctor warns, not fails, on a project-scoped Decision without artifact", () => {
  const root = tmp();
  setup(root);
  cli(root, "record", "--type", "Decision",
    "--description", "A decision recorded without an artifact.",
    "--topics", "storage,sqlite,decisions", "--scope", "project");

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.out, /has no artifact/);
});

test("recall deduplicates a project-scoped node after archive", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Decision", "--alias", "ADR-001",
    "--description", "Use SQLite as the storage backend.", "--topics", "storage,sqlite,decisions",
    "--scope", "project");
  assert.equal(cli(root, "abandon", "descoped for this quarter").code, 0);

  const result = cli(root, "recall", "ADR-001", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 1);
});

test("recall by topic returns active and historical matches", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Historical auth requirement.", "--topics", "auth,passkeys,login");
  assert.equal(cli(root, "abandon", "done").code, 0);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Active auth requirement.", "--topics", "auth,passkeys,login");

  const result = cli(root, "recall", "auth", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 2);
});

test("recall by question returns active and historical matches", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Historical requirement.", "--topics", "a,b,c",
    "--questions", "How does auth work?");
  assert.equal(cli(root, "abandon", "done").code, 0);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Active requirement.", "--topics", "d,e,f",
    "--questions", "How does auth work?");

  const result = cli(root, "recall", "How does auth work?", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 2);
});

test("recall by code anchor returns active and historical matches", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "CodeUnit", "--alias", "CU-001",
    "--description", "Historical login symbol.", "--topics", "a,b,c",
    "--code", "src/auth.ts#login");
  assert.equal(cli(root, "abandon", "done").code, 0);
  start(root);
  cli(root, "record", "--type", "CodeUnit", "--alias", "CU-002",
    "--description", "Active login symbol.", "--topics", "d,e,f",
    "--code", "src/auth.ts#login");

  const result = cli(root, "recall", "src/auth.ts#login", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 2);
});

test("--limit clamps values outside 1-100", () => {
  const root = tmp();
  setup(root);
  start(root);
  for (let i = 1; i <= 3; i += 1) {
    cli(root, "record", "--type", "Requirement", "--alias", `R-00${i}`,
      "--description", `Requirement ${i}.`, "--topics", "auth,passkeys,login");
  }

  const zero = cli(root, "recall", "auth", "--limit", "0", "--json");
  assert.equal(zero.code, 0, zero.all);
  assert.equal(JSON.parse(zero.out).matches.length, 1);

  const high = cli(root, "recall", "auth", "--limit", "101", "--json");
  assert.equal(high.code, 0, high.all);
  assert.equal(JSON.parse(high.out).matches.length, 3);
});

test("recall returns topic and description matches together", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Passkey authentication.", "--topics", "auth,passkeys,login");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Auth appears in this description.", "--topics", "security,login,access");

  const result = cli(root, "recall", "auth", "--json");
  assert.equal(result.code, 0, result.all);
  const matches = JSON.parse(result.out).matches;
  assert.equal(matches.length, 2);
  assert.equal(matches[0].aliases[0], "R-001");
  assert.equal(matches[1].aliases[0], "R-002");
});

test("recall returns alias and topic matches together", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "auth",
    "--description", "Aliased node.", "--topics", "security,login,access");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Topic node.", "--topics", "auth,passkeys,login");

  const result = cli(root, "recall", "auth", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 2);
});

test("recall returns code-anchor and description matches together", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "CodeUnit", "--alias", "CU-001",
    "--description", "Login handler.", "--topics", "a,b,c", "--code", "src/auth.ts#login");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "See src/auth.ts#login for details.", "--topics", "d,e,f");

  const result = cli(root, "recall", "src/auth.ts#login", "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).matches.length, 2);
});

test("recall ranks exact matches first and --limit 1 selects the top match", () => {
  const root = tmp();
  setup(root);
  start(root);
  cli(root, "record", "--type", "Requirement", "--alias", "auth",
    "--description", "Aliased node.", "--topics", "security,login,access");
  cli(root, "record", "--type", "Requirement", "--alias", "R-002",
    "--description", "Topic node.", "--topics", "auth,passkeys,login");

  const matches = JSON.parse(cli(root, "recall", "auth", "--json").out).matches;
  assert.equal(matches.length, 2);
  assert.equal(matches[0].aliases[0], "auth");

  const limited = JSON.parse(cli(root, "recall", "auth", "--limit", "1", "--json").out).matches;
  assert.equal(limited.length, 1);
  assert.equal(limited[0].aliases[0], "auth");
});

test("recall DEP-001 does not return unrelated R-001 nodes", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", "R-001"],
  ]);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Unrelated requirement.", "--topics", "a,b,c",
    "--scope", "project", "--repo", "orchid-api");

  const result = cli(root, "recall", "DEP-001", "--json");
  assert.equal(result.code, 0, result.all);
  const payload = JSON.parse(result.out);
  assert.equal(payload.matches.length, 0);
  assert.equal(payload.dependencies.length, 1);
  assert.equal(payload.dependencies[0].ID, "DEP-001");
  assert.equal(payload.related.length, 1);
  assert.equal(payload.related[0].aliases[0], "R-001");
});

test("recall resolves a repeated iteration-scoped alias to the active node", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", "R-001"],
  ]);
  assert.equal(cli(root, "start", "First iteration with passkey login", "--allow-dirty").code, 0);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Historical requirement.", "--topics", "a,b,c");
  assert.equal(cli(root, "abandon", "done").code, 0);
  assert.equal(cli(root, "start", "Second iteration with email verification", "--allow-dirty").code, 0);
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Active requirement.", "--topics", "d,e,f");

  const result = cli(root, "recall", "DEP-001", "--json");
  assert.equal(result.code, 0, result.all);
  const payload = JSON.parse(result.out);
  assert.equal(payload.matches.length, 0);
  assert.equal(payload.related.length, 1);
  assert.match(payload.related[0].description, /Active/);
});
