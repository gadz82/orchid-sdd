import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cli, tmp } from "./helpers.mjs";

test("skill install targets OpenCode project paths", () => {
  const root = tmp();
  const result = cli(root, "skill", "install", "--agent", "opencode");
  assert.equal(result.code, 0, result.all);
  for (const file of [
    ".opencode/skills/orchid-sdd/SKILL.md",
    ".opencode/skills/orchid-sdd/.skill/personas/PM.md",
    ".opencode/skills/orchid-sdd/.skill/steering/default-presets/architecture-boundaries.md",
    ".opencode/skills/orchid-sdd/cli/cli.mjs",
    ".opencode/skills/orchid-sdd/bin/orchid-sdd.mjs",
    ".opencode/skills/orchid-sdd/docs/personas/PM.md",
    ".opencode/commands/orchid-sdd.md",
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  }
  const installed = path.join(root, ".opencode/skills/orchid-sdd/bin/orchid-sdd.mjs");
  const version = spawnSync(process.execPath, [installed, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^0\.2\.0/);
});

test("skill install targets Claude Code project skills", () => {
  const root = tmp();
  const result = cli(root, "skill", "install", "--agent", "claude-code");
  assert.equal(result.code, 0, result.all);
  assert.ok(fs.existsSync(path.join(root, ".claude/skills/orchid-sdd/SKILL.md")));
  assert.ok(fs.existsSync(path.join(root, ".claude/skills/orchid-sdd/.skill/personas/PM.md")));
  assert.equal(fs.existsSync(path.join(root, ".claude/skills/orchid-sdd/commands")), false);
});

test("skill install supports dry-run, custom destinations, and force", () => {
  const root = tmp();
  const dry = cli(root, "skill", "install", "--agent", "opencode", "--dry-run");
  assert.equal(dry.code, 0, dry.all);
  assert.match(dry.out, /Would install/);
  assert.equal(fs.existsSync(path.join(root, ".opencode/skills/orchid-sdd")), false);

  const custom = cli(
    root,
    "skill",
    "install",
    "--agent",
    "opencode",
    "--dest",
    ".custom/skills/orchid-sdd",
  );
  assert.equal(custom.code, 0, custom.all);
  assert.ok(fs.existsSync(path.join(root, ".custom/skills/orchid-sdd/SKILL.md")));

  const again = cli(root, "skill", "install", "--agent", "opencode");
  assert.equal(again.code, 0, again.all);
  const conflict = cli(root, "skill", "install", "--agent", "opencode");
  assert.equal(conflict.code, 1, conflict.all);
  assert.match(conflict.all, /already exists/);
  const forced = cli(root, "skill", "install", "--agent", "opencode", "--force");
  assert.equal(forced.code, 0, forced.all);
});

test("skill install requires an agent", () => {
  const root = tmp();
  const result = cli(root, "skill", "install");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /--agent/);
});
