import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, TITLE, cli, setup, start, tmp } from "./helpers.mjs";

test("help and version are explicit and side-effect free", () => {
  const root = tmp();
  const help = cli(root, "--help");
  assert.equal(help.code, 0);
  assert.match(help.out, /Usage: orchid-sdd/);
  const unknown = cli(root, "nope");
  assert.equal(unknown.code, 2);
  const version = cli(root, "--version");
  assert.equal(version.code, 0);
  assert.match(version.out, /^0\.2\.0/);
});

test("setup creates a valid workspace and doctor passes", () => {
  const root = tmp();
  setup(root);
  for (const file of [
    "orchid-sdd.yml",
    ".orchid/state.json",
    ".knowledge/manifest.jsonld",
    ".knowledge/index/topics.json",
    ".knowledge/context/orchid-v1.jsonld",
    "docs/knowledge/docblocks",
    "AGENTS.md",
    "ORCHID-SDD.md",
    ".github/workflows/orchid-sdd.yml",
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  }
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  const ci = cli(root, "doctor", "--ci");
  assert.equal(ci.code, 0, ci.all);
  assert.match(ci.out, /offline checks only/);
  const check = cli(root, "index", "--check");
  assert.equal(check.code, 0, check.all);
});

test("unknown config keys are rejected", () => {
  const root = tmp();
  setup(root);
  fs.appendFileSync(path.join(root, "orchid-sdd.yml"), "\nbogus: true\n");
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 1, doctor.all);
  assert.match(doctor.all, /bogus is not a recognized key/);
});

test("config paths cannot escape the project root", () => {
  const root = tmp();
  setup(root);
  const file = path.join(root, "orchid-sdd.yml");
  const config = fs
    .readFileSync(file, "utf8")
    .replace('knowledge_folder: ".knowledge"', 'knowledge_folder: "../outside"');
  fs.writeFileSync(file, config);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 1, doctor.all);
  assert.match(doctor.all, /knowledge_folder must be a relative path inside the project/);
});

test("config persona file overrides are loaded", () => {
  const root = tmp();
  setup(root);
  fs.writeFileSync(
    path.join(root, ".orchid/personas/custom-dev.md"),
    `---\nid: DEV\nname: "Project Developer"\nmission: "Ship the project safely."\nphases: [assessment, build, code_review]\nauthority: blocking\ntags: [implementation, project]\n---\n# Operating instructions\n- Prefer the project test harness.\n`,
  );
  const file = path.join(root, "orchid-sdd.yml");
  const config = fs.readFileSync(file, "utf8").replace(
    "overrides: {}",
    "overrides:\n    DEV:\n      file: .orchid/personas/custom-dev.md",
  );
  fs.writeFileSync(file, config);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  const show = cli(root, "persona", "show", "DEV", "--json");
  assert.equal(show.code, 0, show.all);
  const dev = JSON.parse(show.out);
  assert.equal(dev.authority, "blocking");
  assert.equal(dev.name, "Project Developer");
  assert.match(dev.source, /config/);
});

test("governance.rigor supplies the default iteration rigor", () => {
  const root = tmp();
  setup(root);
  const file = path.join(root, "orchid-sdd.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("rigor: auto", "rigor: full"));
  const result = cli(root, "start", TITLE, "--json");
  assert.equal(result.code, 0, result.all);
  assert.equal(JSON.parse(result.out).rigor, "L");
});

test("setup is non-destructive and supports dry-run", () => {
  const root = tmp();
  const dry = cli(root, "setup", "--yes", "--profile", "backend", "--dry-run");
  assert.equal(dry.code, 0, dry.all);
  assert.match(dry.out, /Dry run/);
  assert.equal(fs.existsSync(path.join(root, "orchid-sdd.yml")), false);
  setup(root);
  const again = cli(root, "setup", "--yes", "--profile", "backend");
  assert.equal(again.code, 1);
  assert.match(again.all, /already exists/);
  const forced = cli(root, "setup", "--yes", "--profile", "frontend", "--force");
  assert.equal(forced.code, 0, forced.all);
});

test("doctor --fix creates missing directories", () => {
  const root = tmp();
  setup(root);
  fs.rmSync(path.join(root, "docs/knowledge/docblocks"), { recursive: true, force: true });
  const broken = cli(root, "doctor");
  assert.equal(broken.code, 1, broken.all);
  const fixed = cli(root, "doctor", "--fix");
  assert.equal(fixed.code, 0, fixed.all);
  assert.ok(fs.existsSync(path.join(root, "docs/knowledge/docblocks")));
});

test("titles are validated", () => {
  const root = tmp();
  setup(root);
  const short = cli(root, "start", "Fix");
  assert.equal(short.code, 1);
  assert.match(short.all, /too vague/);
  const long = cli(root, "start", "x".repeat(501));
  assert.equal(long.code, 1);
  assert.match(long.all, /maximum is 500/);
  const badRigor = cli(root, "start", TITLE, "--rigor", "XL");
  assert.equal(badRigor.code, 1, badRigor.all);
  assert.match(badRigor.all, /--rigor must be S, M, or L/);
  start(root);
  const status = cli(root, "status");
  assert.equal(status.code, 0, status.all);
  assert.match(status.out, /Phase\s+intent/);
});

test("the skill package ships personas, profiles, and constitution defaults", () => {  for (const file of [
    ".skill/personas/PM.md",
    ".skill/personas/DEV.md",
    ".skill/personas/QE.md",
    ".skill/templates/profiles/backend.json",
    ".skill/templates/profiles/monorepo.json",
    ".skill/steering/architecture-boundaries.md",
    ".skill/constitution/constitution.md",
    ".skill/schemas/config.schema.json",
    ".skill/schemas/steering.schema.json",
    "SKILL.md",
    "commands/orchid-sdd.md",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `missing ${file}`);
  }
});

test("the explicit-only guard is present in skill metadata", () => {
  const skill = fs.readFileSync(path.join(ROOT, "SKILL.md"), "utf8");
  assert.match(skill, /Never auto-invoke/);
  assert.match(skill, /Load only when the user typed \/orchid-sdd/);
  const command = fs.readFileSync(path.join(ROOT, "commands", "orchid-sdd.md"), "utf8");
  assert.match(command, /Invocation: \/orchid-sdd/);
  assert.match(command, /Sentinel: explicit/);
});

test("setup generates the profile pack and accepts extra personas", () => {
  const root = tmp();
  const result = cli(root, "setup", "--yes", "--profile", "backend", "--persona", "UX", "--persona", "PO");
  assert.equal(result.code, 0, result.all);
  assert.ok(fs.existsSync(path.join(root, ".orchid/constitution/_profile/guidelines/api.md")));
  const constitution = fs.readFileSync(path.join(root, ".orchid/constitution/constitution.md"), "utf8");
  assert.match(constitution, /_profile\/guidelines\/api\.md/);
  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /UX/);
  assert.doesNotMatch(config, /\bPO\b/);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
});

test("setup detects a backend stack without an explicit profile", () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname = \"demo\"\n");
  const result = cli(root, "setup", "--yes");
  assert.equal(result.code, 0, result.all);
  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /profile: backend/);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
});

test("setup supports configurable paths", () => {
  const root = tmp();
  const result = cli(
    root,
    "setup",
    "--yes",
    "--profile", "backend",
    "--knowledge-folder", "knowledge",
    "--docblocks-folder", "docs/blocks",
    "--constitution-folder", "docs/constitution",
    "--customizations-folder", "docs/custom",
  );
  assert.equal(result.code, 0, result.all);
  for (const entry of [
    "knowledge/manifest.jsonld",
    "knowledge/context/orchid-v1.jsonld",
    "docs/blocks",
    "docs/constitution/constitution.md",
    "docs/constitution/_profile/guidelines/api.md",
    "docs/custom",
  ]) {
    assert.ok(fs.existsSync(path.join(root, entry)), `missing ${entry}`);
  }
  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /knowledge_folder: "knowledge"/);
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /knowledge\/manifest\.jsonld/);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
  const check = cli(root, "index", "--check");
  assert.equal(check.code, 0, check.all);
});

test("setup accepts custom and override persona files", () => {
  const root = tmp();
  fs.writeFileSync(
    path.join(root, "QA.md"),
    `---\nid: QA\nname: "Quality Advocate"\nmission: "Challenge assumptions and test evidence."\nphases: [assessment, code_review]\nauthority: blocking\ntags: [quality, testing]\n---\n# Operating instructions\n- Challenge vague acceptance criteria.\n`,
  );
  fs.writeFileSync(
    path.join(root, "DEV.md"),
    `---\nid: DEV\nname: "Developer"\nmission: "Implement with tests."\nphases: [assessment, build]\nauthority: blocking\ntags: [implementation]\n---\n# Operating instructions\n- Add a regression test first.\n`,
  );
  const result = cli(
    root,
    "setup",
    "--yes",
    "--profile", "backend",
    "--persona-file", "QA.md",
    "--persona-file", "DEV.md",
  );
  assert.equal(result.code, 0, result.all);
  assert.ok(fs.existsSync(path.join(root, ".orchid/personas/QA.md")));
  assert.ok(fs.existsSync(path.join(root, ".orchid/personas/DEV.md")));
  const config = fs.readFileSync(path.join(root, "orchid-sdd.yml"), "utf8");
  assert.match(config, /QA/);
  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);

  const list = cli(root, "persona", "list", "--json");
  assert.equal(list.code, 0, list.all);
  const rows = JSON.parse(list.out);
  const qa = rows.find((row) => row.id === "QA");
  const dev = rows.find((row) => row.id === "DEV");
  assert.equal(qa.enabled, true);
  assert.equal(qa.source, "project");
  assert.equal(dev.authority, "blocking");
  assert.equal(dev.source, "project");

  const show = cli(root, "persona", "show", "DEV", "--json");
  assert.equal(show.code, 0, show.all);
  assert.equal(JSON.parse(show.out).authority, "blocking");
});
