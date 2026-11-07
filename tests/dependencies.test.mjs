import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cli, initRepo, readJson, setup, tmp } from "./helpers.mjs";

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

const ROW1 = [
  "DEP-001", "api", "`orchid-api/src/orders/client.ts`", "`orchid-payments/POST /charge`",
  "`charge.v1`", "1.2.0", "timeout, 4xx", "provider first", "npm test", "make integration",
  "payments", "verified", "2026-11-05", "",
];
const ROW2 = [
  "DEP-002", "event", "orchid-web/src/cart/hooks.ts", "orchid-api/order.created",
  "order-events", "2.0.0", "duplicate, ordering", "n/a", "", "", "api", "open", "", "",
];

test("dependencies list returns normalized rows and supports filters", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [ROW1, ROW2]);

  const list = cli(root, "dependencies", "list", "--json");
  assert.equal(list.code, 0, list.all);
  const payload = JSON.parse(list.out);
  assert.equal(payload.ok, true);
  const rows = payload.rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ID, "DEP-001");
  assert.equal(rows[0].Kind, "api");
  assert.equal(rows[0].Consumer, "orchid-api/src/orders/client.ts");
  assert.equal(rows[0].Provider, "orchid-payments/POST /charge");
  assert.equal(rows[0].Contract, "charge.v1");
  assert.equal(rows[0].Status, "verified");
  assert.equal(rows[1].ID, "DEP-002");
  assert.equal(rows[1].Kind, "event");

  const byRepo = JSON.parse(cli(root, "dependencies", "list", "--repo", "orchid-payments", "--json").out);
  assert.deepEqual(byRepo.rows.map((row) => row.ID), ["DEP-001"]);
  const byStatus = JSON.parse(cli(root, "dependencies", "list", "--status", "open", "--json").out);
  assert.deepEqual(byStatus.rows.map((row) => row.ID), ["DEP-002"]);
  const byKind = JSON.parse(cli(root, "dependencies", "list", "--kind", "api", "--json").out);
  assert.deepEqual(byKind.rows.map((row) => row.ID), ["DEP-001"]);
});

test("dependencies check passes for a valid ledger", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [ROW1, ROW2]);
  const check = cli(root, "dependencies", "check", "--json");
  assert.equal(check.code, 0, check.all);
  const result = JSON.parse(check.out);
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
});

test("doctor passes and reports the dependency row count", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [ROW1, ROW2]);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.out, /dependencies: 2 row\(s\)/);
  const ci = cli(root, "doctor", "--ci");
  assert.equal(ci.code, 0, ci.all);
  assert.match(ci.out, /dependencies: 2 row\(s\)/);
});

test("duplicate ID fails with the line number", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ROW1,
    ["DEP-001", "api", "orchid-web/x", "orchid-api/y", "c", "1", "f", "n/a", "", "", "o", "open", "", ""],
  ]);
  const check = cli(root, "dependencies", "check", "--json");
  assert.equal(check.code, 1, check.all);
  const result = JSON.parse(check.out);
  const dup = result.errors.find((error) => error.message.includes("duplicate ID"));
  assert.ok(dup, "expected a duplicate ID error");
  assert.equal(dup.line, 4);
});

test("unknown repo id fails", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "unknown-repo/x", "orchid-api/y", "c", "1", "f", "n/a", "", "", "o", "open", "", ""],
  ]);
  const check = cli(root, "dependencies", "check", "--json");
  assert.equal(check.code, 1, check.all);
  const result = JSON.parse(check.out);
  assert.ok(
    result.errors.some(
      (error) => error.message.includes("unknown or disabled workspace repo id") && error.message.includes("unknown-repo"),
    ),
    "expected an unknown repo id error",
  );
});

test("invalid Kind or Status fails", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "banana", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", ""],
  ]);
  let result = JSON.parse(cli(root, "dependencies", "check", "--json").out);
  assert.ok(result.errors.some((error) => error.message.includes("invalid Kind")), "expected invalid Kind");

  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "banana", "", ""],
  ]);
  result = JSON.parse(cli(root, "dependencies", "check", "--json").out);
  assert.ok(result.errors.some((error) => error.message.includes("invalid Status")), "expected invalid Status");
});

test("verified without consumer/provider evidence fails", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "verified", "2026-11-05", ""],
  ]);
  const result = JSON.parse(cli(root, "dependencies", "check", "--json").out);
  assert.ok(result.errors.some((error) => error.message.includes("Consumer evidence is required")));
  assert.ok(result.errors.some((error) => error.message.includes("Provider evidence is required")));
});

test("waived without an ADR fails", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "api", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "waived", "", ""],
  ]);
  const check = cli(root, "dependencies", "check", "--json");
  assert.equal(check.code, 1, check.all);
  const result = JSON.parse(check.out);
  assert.ok(result.errors.some((error) => error.message.includes("waived status requires an ADR-###")));
});

test("missing ledger is allowed and doctor warns, not fails", () => {
  const root = makeDepsWorkspace();
  const check = cli(root, "dependencies", "check", "--json");
  assert.equal(check.code, 0, check.all);
  const checkPayload = JSON.parse(check.out);
  assert.equal(checkPayload.ok, true);
  assert.equal(checkPayload.rows.length, 0);

  const list = cli(root, "dependencies", "list", "--json");
  assert.equal(list.code, 0, list.all);
  assert.deepEqual(JSON.parse(list.out), { ok: true, rows: [], errors: [], warnings: [] });

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  assert.match(doctor.out, /cross-repo dependency ledger is missing/);
});

test("invalid ledger blocks every projection and index --check", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    [ROW1[0], "banana", ROW1[2], ROW1[3], ROW1[4], ROW1[5], ROW1[6], ROW1[7],
      ROW1[8], ROW1[9], ROW1[10], ROW1[11], ROW1[12], ROW1[13]],
  ]);

  const record = cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "A project fact that must not be projected.", "--topics", "a,b,c",
    "--scope", "project");
  assert.equal(record.code, 1, record.all);
  assert.match(record.all, /invalid cross-repo dependency ledger/);
  assert.match(record.all, /invalid Kind "banana"/);

  const check = cli(root, "index", "--check");
  assert.equal(check.code, 1, check.all);
  assert.match(check.all, /Cross-repo dependency ledger is invalid/);
  assert.match(check.all, /invalid Kind "banana"/);

  const recall = cli(root, "recall", "auth", "--json");
  assert.equal(recall.code, 1, recall.all);
  assert.match(recall.all, /invalid cross-repo dependency ledger/);

  const index = readJson(path.join(root, ".knowledge", "index", "cross-repo-dependencies.json"));
  assert.equal(index.rows.some((row) => row.Kind === "banana"), false);
});

test("non-workspace mode is a no-op", () => {
  const root = tmp();
  setup(root);
  const list = cli(root, "dependencies", "list", "--json");
  assert.equal(list.code, 0, list.all);
  assert.deepEqual(JSON.parse(list.out), { ok: true, rows: [], errors: [], warnings: [] });
  const check = cli(root, "dependencies", "check", "--json");
  assert.equal(check.code, 0, check.all);
  assert.equal(JSON.parse(check.out).ok, true);
});

test("index writes the cross-repo index and index --check passes", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [ROW1, ROW2]);
  const idx = cli(root, "index");
  assert.equal(idx.code, 0, idx.all);

  const index = readJson(path.join(root, ".knowledge", "index", "cross-repo-dependencies.json"));
  assert.equal(index.source, ".orchid/cross-repo-dependencies.md");
  assert.equal(index.rows.length, 2);
  assert.ok(index.generatedAt);

  const manifest = readJson(path.join(root, ".knowledge", "manifest.jsonld"));
  assert.equal(manifest.indexes.crossRepoDependencies, "index/cross-repo-dependencies.json");

  const check = cli(root, "index", "--check");
  assert.equal(check.code, 0, check.all);
});

test("index fails on an invalid ledger without writing a partial index", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "banana", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", ""],
  ]);
  const idx = cli(root, "index");
  assert.equal(idx.code, 1, idx.all);
  assert.match(idx.all, /invalid cross-repo dependency ledger/);
});

test("editing the ledger without reindexing makes index --check fail", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [ROW1]);
  assert.equal(cli(root, "index").code, 0);
  writeLedger(root, [ROW1, ROW2]);
  const check = cli(root, "index", "--check");
  assert.equal(check.code, 1, check.all);
  assert.match(check.all, /cross-repo-dependencies\.json/);
});

test("dependencies list fails on an invalid ledger without returning rows", () => {
  const root = makeDepsWorkspace();
  writeLedger(root, [
    ["DEP-001", "banana", "orchid-api/x", "orchid-payments/y", "c", "1", "f", "n/a", "", "", "o", "open", "", ""],
  ]);
  const list = cli(root, "dependencies", "list", "--json");
  assert.equal(list.code, 1, list.all);
  const payload = JSON.parse(list.out);
  assert.equal(payload.ok, false);
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.length > 0);
  assert.deepEqual(payload.rows, []);
  assert.equal(payload.errors.some((error) => error.message.includes("invalid Kind")), true);
});
