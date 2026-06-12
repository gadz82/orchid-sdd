import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BIN = path.join(ROOT, "bin", "orchid-sdd.mjs");

export function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "orchid-test-"));
}

export function cli(root, ...args) {
  const result = spawnSync(process.execPath, [BIN, "--root", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, ORCHID_DEBUG: "" },
  });
  return {
    code: result.status,
    out: result.stdout || "",
    err: result.stderr || "",
    all: `${result.stdout || ""}${result.stderr || ""}`,
  };
}

export function setup(root, profile = "backend") {
  const result = cli(root, "setup", "--yes", "--profile", profile);
  if (result.code !== 0) throw new Error(result.all);
  return result;
}

export const TITLE = "Add passkey login to the customer portal for returning users";

export function start(root, title = TITLE) {
  const result = cli(root, "start", title);
  if (result.code !== 0) throw new Error(result.all);
  return result;
}

export function iterationDir(root) {
  const base = path.join(root, ".knowledge", "iterations");
  const name = fs.readdirSync(base).filter((entry) => !entry.startsWith("."))[0];
  return path.join(base, name);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return (result.stdout || "").trim();
}

export function initRepo(dir, files = {}, message = "init") {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  git(dir, "add", "-A");
  git(
    dir,
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "commit", "-q", "--allow-empty", "-m", message,
  );
}

export function makeWorkspace() {
  const root = tmp();
  initRepo(root, {}, "root init");
  initRepo(
    path.join(root, "pkg-a"),
    {
      "pyproject.toml": "[project]\nname = \"pkg-a\"\n",
      "src/app.py": "def hello():\n    return \"hi\"\n",
      "tests/test_app.py": "def test_hello():\n    assert True\n",
    },
    "pkg init",
  );
  for (const dir of [".knowledge/adr", ".knowledge/specs", ".knowledge/plans", ".knowledge/prompts"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(root, ".knowledge/README.md"), "# Knowledge\n\nLegacy knowledge base.\n");
  fs.writeFileSync(path.join(root, ".knowledge/adr/ADR-001-sqlite.md"), "# ADR-001 — SQLite\n\nAccepted.\n");
  fs.writeFileSync(path.join(root, ".knowledge/specs/health.md"), "# Health endpoint\n\nSpec.\n");
  fs.writeFileSync(path.join(root, ".knowledge/plans/plan.md"), "# Plan\n\nActive plan.\n");
  fs.writeFileSync(path.join(root, ".knowledge/prompts/prompt.md"), "# Prompt\n\nDo the work.\n");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# AGENTS\n\nProject instructions.\n");
  return root;
}

export function backupDirs(root) {
  const base = path.join(root, ".orchid-migration-bck");
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).sort();
}
