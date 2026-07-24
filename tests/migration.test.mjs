import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { backupDirs, cli, makeWorkspace, readJson } from "./helpers.mjs";

test("migrate scan detects the workspace and legacy knowledge", () => {
  const root = makeWorkspace();
  const result = cli(root, "migrate", "scan", "--json");
  assert.equal(result.code, 0, result.all);
  const scan = JSON.parse(result.out);
  assert.equal(scan.workspace.detected, 1);
  assert.equal(scan.workspace.repos[0].id, "pkg-a");
  assert.equal(scan.existing.adr, 1);
  assert.ok(scan.knowledge.files >= 4);
  assert.equal(scan.suggested.workspace, true);
});

test("migrate init backs up legacy assets and scaffolds a workspace", () => {
  const root = makeWorkspace();
  const result = cli(root, "migrate", "init", "--profile", "monorepo");
  assert.equal(result.code, 0, result.all);
  assert.match(result.out, /Migration scaffolded/);

  const backups = backupDirs(root);
  assert.equal(backups.length, 1);
  const backup = path.join(root, ".orchid-migration-bck", backups[0]);
  assert.ok(fs.existsSync(path.join(backup, "root", ".knowledge", "README.md")));
  assert.ok(fs.existsSync(path.join(backup, "root", "AGENTS.md")));
  const manifest = readJson(path.join(backup, "BACKUP.json"));
  assert.ok(manifest.entries.some((entry) => entry.source === ".knowledge"));
  assert.ok(manifest.entries.some((entry) => entry.source === "AGENTS.md"));

  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /workspace:/);
  assert.match(config, /id: "pkg-a"/);
  assert.ok(fs.existsSync(path.join(root, "pkg-a", "orchid-sdd.yml")));
  assert.ok(fs.existsSync(path.join(root, "MIGRATION.md")));
  assert.ok(fs.existsSync(path.join(root, ".orchid/migration/PLAN.md")));
  assert.ok(fs.existsSync(path.join(root, ".orchid/migration/prompts/01-inventory.md")));

  const status = cli(root, "migrate", "status", "--json");
  assert.equal(status.code, 0, status.all);
  assert.equal(JSON.parse(status.out).stage, "scaffolded");
});

test("migrate init --dry-run writes nothing", () => {
  const root = makeWorkspace();
  const result = cli(root, "migrate", "init", "--dry-run");
  assert.equal(result.code, 0, result.all);
  assert.match(result.out, /Migration dry run/);
  assert.equal(fs.existsSync(path.join(root, "orchid-sdd.yml")), false);
  assert.equal(fs.existsSync(path.join(root, ".orchid-migration-bck")), false);
});

test("migrate finalize accepts project-scoped memory and moves to ready", () => {
  const root = makeWorkspace();
  assert.equal(cli(root, "migrate", "init", "--profile", "monorepo").code, 0);
  const recorded = cli(
    root,
    "record",
    "--type", "Decision",
    "--alias", "ADR-001",
    "--description", "SQLite is the storage backend for the extracted package.",
    "--topics", "storage,sqlite,decisions",
    "--repo", "pkg-a",
    "--scope", "project",
    "--artifact", ".knowledge/adr/ADR-001-sqlite.md",
  );
  assert.equal(recorded.code, 0, recorded.all);

  const finalized = cli(root, "migrate", "finalize");
  assert.equal(finalized.code, 0, finalized.all);
  assert.match(finalized.out, /Migration complete: 1 node/);
  assert.ok(fs.existsSync(path.join(root, ".orchid/migration/REPORT.md")));

  const state = readJson(path.join(root, ".orchid/state.json"));
  assert.equal(state.phase, "ready");
  assert.equal(state.migration.stage, "complete");
  assert.equal(state.activeIteration, null);
  const manifest = readJson(path.join(root, ".knowledge/manifest.jsonld"));
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.nodes[0].scope, "project");
});

test("migrate backup is non-destructive", () => {
  const root = makeWorkspace();
  const result = cli(root, "migrate", "backup");
  assert.equal(result.code, 0, result.all);
  const backups = backupDirs(root);
  assert.equal(backups.length, 1);
  const backup = path.join(root, ".orchid-migration-bck", backups[0]);
  assert.ok(fs.existsSync(path.join(backup, "root", ".knowledge", "README.md")));
  assert.ok(fs.existsSync(path.join(root, ".knowledge", "README.md")));
});
