import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./helpers.mjs";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("Claude Code plugin manifest and marketplace are consistent", () => {
  const manifest = readJson(path.join(ROOT, ".claude-plugin/plugin.json"));
  const marketplace = readJson(path.join(ROOT, ".claude-plugin/marketplace.json"));
  const pkg = readJson(path.join(ROOT, "package.json"));

  assert.equal(manifest.name, "orchid-sdd");
  assert.equal(manifest.version, pkg.version);
  assert.equal(pkg.name, "orchid-sdd");
  assert.equal(pkg.bin["orchid-sdd"], "./bin/orchid-sdd.mjs");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.commands.length, 2);
  assert.ok(manifest.commands.includes("./claude-commands/run.md"));
  assert.ok(manifest.commands.includes("./commands/orchid-sdd.md"));
  for (const command of manifest.commands) {
    assert.ok(fs.existsSync(path.join(ROOT, command)), `missing command ${command}`);
  }
  assert.deepEqual(manifest.skills, ["./claude-skills"]);
  assert.ok(fs.existsSync(path.join(ROOT, "claude-skills/orchid-sdd/SKILL.md")));
  assert.equal(marketplace.name, "orchid-sdd");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, manifest.name);
  assert.equal(marketplace.plugins[0].source, "./");
});

test("Claude Code skill and command are explicit-only and point at the canonical contract", () => {
  const pluginSkill = fs.readFileSync(
    path.join(ROOT, "claude-skills/orchid-sdd/SKILL.md"),
    "utf8",
  );
  const pluginCommand = fs.readFileSync(
    path.join(ROOT, "claude-commands/run.md"),
    "utf8",
  );
  const canonical = fs.readFileSync(path.join(ROOT, "SKILL.md"), "utf8");

  assert.match(pluginSkill, /name: orchid-sdd/);
  assert.match(pluginSkill, /disable-model-invocation: true/);
  assert.match(pluginSkill, /CLAUDE_PLUGIN_ROOT/);
  assert.match(pluginSkill, /\/orchid-sdd:run/);
  assert.match(pluginCommand, /disable-model-invocation: true/);
  assert.match(pluginCommand, /\$\{CLAUDE_PLUGIN_ROOT\}\/SKILL\.md/);
  assert.match(pluginCommand, /\$ARGUMENTS/);
  assert.match(canonical, /disable-model-invocation: true/);
  assert.match(canonical, /\/orchid-sdd:run/);
});

test("the plugin CLI wrappers are executable and run", () => {
  for (const name of ["orchid-sdd"]) {
    const wrapper = path.join(ROOT, "bin", name);
    assert.ok(fs.existsSync(wrapper), `missing wrapper ${name}`);
    if (process.platform !== "win32") {
      assert.notEqual(fs.statSync(wrapper).mode & 0o111, 0, `bin/${name} is not executable`);
    }
    const result = spawnSync(process.execPath, [wrapper, "--version"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^0\.2\.0/);
  }
});

test("skills.sh repository config references the root skill", () => {
  const config = readJson(path.join(ROOT, "skills.sh.json"));
  assert.match(config.$schema, /^https:\/\/skills\.sh\//);
  assert.equal(config.notGrouped, "bottom");
  assert.ok(Array.isArray(config.groupings) && config.groupings.length > 0);
  const names = config.groupings.flatMap((grouping) => grouping.skills);
  assert.ok(names.includes("orchid-sdd"));
  assert.ok(fs.existsSync(path.join(ROOT, "SKILL.md")));
});
