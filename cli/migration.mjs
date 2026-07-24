import fs from "node:fs";
import path from "node:path";
import { detectProfile, detectProjectName, loadConfig } from "./config.mjs";
import { runSetup } from "./setup.mjs";
import { detectWorkspaceRepos, gitInfo, workspaceConfig } from "./workspace.mjs";
import { paths, readState, writeProjection, writeState } from "./store.mjs";
import {
  OrchidError,
  ensureDir,
  exists,
  formatJson,
  nowIso,
  readText,
  rel,
  writeJson,
} from "./util.mjs";

export const MIGRATION_DIR = ".orchid/migration";
export const BACKUP_ROOT = ".orchid-migration-bck";

const CODE_EXTS = [
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java",
  ".kt", ".rb", ".php", ".cs", ".swift", ".scala", ".sql", ".sh", ".bash",
];
const EXCLUDES = new Set([
  ".git", "node_modules", ".venv", "venv", ".next", ".pytest_cache", ".ruff_cache",
  "dist", "build", "target", "vendor", "coverage", ".knowledge", ".orchid",
  ".orchid-migration-bck", "__pycache__", ".serena",
]);

function walk(dir, onFile) {
  if (!exists(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDES.has(entry.name)) walk(path.join(dir, entry.name), onFile);
    } else if (entry.isFile()) {
      onFile(path.join(dir, entry.name));
    }
  }
}

function knowledgeInventory(dir) {
  if (!exists(dir)) return null;
  const files = [];
  walk(dir, (file) => files.push(file));
  const dirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return {
    path: dir,
    files: files.length,
    dirs,
    sample: files.slice(0, 20).map((file) => rel(path.dirname(dir), file)),
  };
}

function countAnchors(root) {
  let count = 0;
  walk(root, (file) => {
    if (!CODE_EXTS.includes(path.extname(file).toLowerCase())) return;
    try {
      const content = fs.readFileSync(file, "utf8");
      count += (content.match(/ORCHID-MEM:\s*[0-9a-f-]{36}/gi) || []).length;
    } catch {
      /* unreadable files are ignored */
    }
  });
  return count;
}

function languageCounts(root) {
  const counts = {};
  walk(root, (file) => {
    const ext = path.extname(file).toLowerCase();
    if (!ext) return;
    counts[ext] = (counts[ext] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
  );
}

function repoInventory(root, skillRoot) {
  const configured = (() => {
    try {
      const loaded = loadConfig(root, { required: false });
      return loaded && loaded.config.workspace && loaded.config.workspace.enabled
        ? loaded.config.workspace.repos
        : [];
    } catch {
      return [];
    }
  })();
  const detected = detectWorkspaceRepos(root, skillRoot);
  const source = configured.length ? configured : detected;
  return source.map((repo) => {
    const dir = path.join(root, repo.path);
    const localConfig = path.join(dir, repo.config || "orchid-sdd.yml");
    return {
      ...repo,
      git: exists(dir) ? gitInfo(dir) : { git: false, dirty: 0 },
      localConfig: exists(localConfig) ? rel(root, localConfig) : null,
    };
  });
}

export function scanProject(root, skillRoot) {
  let config = null;
  let configError = null;
  try {
    const loaded = loadConfig(root, { required: false });
    config = loaded ? loaded.config : null;
  } catch (error) {
    configError = error.message;
  }
  const repos = repoInventory(root, skillRoot);
  const knowledgeFolder = (config && config.knowledge_folder) || ".knowledge";
  const knowledgeDir = path.join(root, knowledgeFolder);
  const docblocksDir = path.join(
    root,
    (config && config.docblocks_folder) || "docs/knowledge/docblocks",
  );
  const constitutionDir = path.join(
    root,
    (config && config.constitution_folder) || ".orchid/constitution",
  );
  const agentsFile = path.join(root, "AGENTS.md");
  const legacyKnowledge = path.join(root, ".knowledge");

  return {
    root,
    generatedAt: nowIso(),
    projectName: detectProjectName(root),
    profile: detectProfile(root),
    configError,
    config,
    workspace: {
      configured: Boolean(config && config.workspace && config.workspace.enabled),
      detected: repos.length,
      repos,
    },
    knowledge: {
      folder: knowledgeFolder,
      ...(knowledgeInventory(knowledgeDir) || { files: 0, dirs: [], sample: [] }),
      legacy: knowledgeFolder !== ".knowledge" ? knowledgeInventory(legacyKnowledge) : null,
    },
    existing: {
      config: exists(path.join(root, "orchid-sdd.yml")),
      agents: exists(agentsFile),
      agentsLines: exists(agentsFile) ? readText(agentsFile).split("\n").length : 0,
      gitignore: exists(path.join(root, ".gitignore")),
      docblocks: exists(docblocksDir),
      constitution: exists(constitutionDir),
      adr: exists(path.join(knowledgeDir, "adr"))
        ? fs.readdirSync(path.join(knowledgeDir, "adr")).length
        : 0,
      specs: exists(path.join(knowledgeDir, "specs"))
        ? fs.readdirSync(path.join(knowledgeDir, "specs")).length
        : 0,
      plans: exists(path.join(knowledgeDir, "plans"))
        ? knowledgeInventory(path.join(knowledgeDir, "plans"))
        : null,
      prompts: exists(path.join(knowledgeDir, "prompts"))
        ? fs.readdirSync(path.join(knowledgeDir, "prompts")).length
        : 0,
      anchors: countAnchors(root),
    },
    rootGit: gitInfo(root),
    languages: languageCounts(root),
    suggested: {
      workspace: repos.length > 0,
      profile: repos.length > 0 ? "monorepo" : detectProfile(root),
      knowledgeFolder,
      migrationDir: MIGRATION_DIR,
      backupRoot: BACKUP_ROOT,
    },
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function uniqueDir(parent, base) {
  let dir = path.join(parent, base);
  let suffix = 2;
  while (exists(dir)) dir = path.join(parent, `${base}-${suffix++}`);
  return dir;
}

function backupAssets(root, scan) {
  const assets = [];
  const add = (label, source, group, base = root) => {
    if (exists(source)) {
      assets.push({
        label,
        source,
        group,
        relative: path.relative(base, source).split(path.sep).join("/"),
      });
    }
  };
  add("config", path.join(root, "orchid-sdd.yml"), "root");
  add("state", path.join(root, ".orchid"), "root");
  add("agents", path.join(root, "AGENTS.md"), "root");
  add("gitignore", path.join(root, ".gitignore"), "root");
  add("knowledge", path.join(root, scan.knowledge.folder), "root");
  if (scan.knowledge.folder !== ".knowledge") {
    add("legacy-knowledge", path.join(root, ".knowledge"), "root");
  }
  add("docblocks", path.join(root, (scan.config && scan.config.docblocks_folder) || "docs/knowledge/docblocks"), "root");
  add("constitution", path.join(root, (scan.config && scan.config.constitution_folder) || ".orchid/constitution"), "root");
  add("serena-memories", path.join(root, ".serena", "memories"), "root");
  for (const repo of scan.workspace.repos) {
    const repoDir = path.join(root, repo.path);
    add("agents", path.join(repoDir, "AGENTS.md"), `repos/${repo.id}`, repoDir);
    add("claude", path.join(repoDir, "CLAUDE.md"), `repos/${repo.id}`, repoDir);
    add("config", path.join(repoDir, repo.config || "orchid-sdd.yml"), `repos/${repo.id}`, repoDir);
    add("knowledge", path.join(repoDir, ".knowledge"), `repos/${repo.id}`, repoDir);
  }
  return assets;
}

function copyFilter(source) {
  const name = path.basename(source);
  if ([".git", "node_modules", ".venv", "venv", ".next", "dist", "build", "target", "vendor", "coverage", "__pycache__", ".pytest_cache", ".ruff_cache"].includes(name)) {
    return false;
  }
  if (name.endsWith(".pyc")) return false;
  return true;
}

function walkBackup(dir, onFile) {
  if (!exists(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (![".git", "node_modules", ".venv", "venv", ".next", "dist", "build", "target", "vendor", "coverage", "__pycache__", ".pytest_cache", ".ruff_cache"].includes(entry.name)) {
        walkBackup(path.join(dir, entry.name), onFile);
      }
    } else if (entry.isFile()) {
      onFile(path.join(dir, entry.name));
    }
  }
}

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  walkBackup(dir, (file) => {
    files += 1;
    try {
      bytes += fs.statSync(file).size;
    } catch {
      /* ignore */
    }
  });
  return { files, bytes };
}

export function backupProject(root, skillRoot, { scan = null, dryRun = false } = {}) {
  const info = scan || scanProject(root, skillRoot);
  const assets = backupAssets(root, info);  const targetRoot = path.join(root, BACKUP_ROOT);
  const target = uniqueDir(targetRoot, timestamp());
  const entries = [];
  for (const asset of assets) {
    const destination = path.join(target, asset.group, asset.relative);
    const stats = fs.statSync(asset.source).isDirectory()
      ? dirStats(asset.source)
      : { files: 1, bytes: fs.statSync(asset.source).size };
    entries.push({
      label: asset.label,
      source: rel(root, asset.source),
      backup: rel(root, destination),
      type: fs.statSync(asset.source).isDirectory() ? "dir" : "file",
      ...stats,
    });
    if (dryRun) continue;
    ensureDir(path.dirname(destination));
    fs.cpSync(asset.source, destination, { recursive: true, filter: copyFilter });
  }
  const manifest = {
    createdAt: nowIso(),
    root,
    backup: target,
    entries,
    restore:
      "Copy the desired folders/files from this backup back to their original paths. Nothing in the source tree was deleted.",
  };
  if (!dryRun) {
    writeJson(path.join(target, "BACKUP.json"), manifest);
    fs.writeFileSync(
      path.join(target, "README.md"),
      `# orchid-sdd migration backup\n\nCreated ${manifest.createdAt}.\n\nThis folder preserves the pre-migration assets. Restore by copying entries from \`BACKUP.json\` back to their original paths.\n\n| Source | Backup | Type | Files |\n|---|---|---|---|\n${entries
        .map((entry) => `| \`${entry.source}\` | \`${entry.backup}\` | ${entry.type} | ${entry.files} |`)
        .join("\n")}\n`,
      "utf8",
    );
  }
  return { target: rel(root, target), manifest, entries, dryRun };
}

export function renderScan(scan) {
  const repoLines = scan.workspace.repos.length
    ? scan.workspace.repos
        .map(
          (repo) =>
            `| ${repo.id} | \`${repo.path}\` | ${repo.profile} | ${repo.git.branch || "—"} | ${repo.git.head || "—"} | ${repo.git.commits} | ${repo.git.dirty} dirty |`,
        )
        .join("\n")
    : "| — | — | — | — | — | — | — |";
  return `# Migration scan

- Root: \`${scan.root}\`
- Project: ${scan.projectName}
- Detected profile: ${scan.profile}
- Workspace mode: ${scan.workspace.detected ? `yes (${scan.workspace.detected} repo(s))` : "no"}
- Knowledge folder: \`${scan.knowledge.folder}\` (${scan.knowledge.files} files)
- Existing config: ${scan.existing.config ? "yes" : "no"}
- Existing AGENTS.md: ${scan.existing.agents ? `yes (${scan.existing.agentsLines} lines)` : "no"}
- Legacy anchors: ${scan.existing.anchors}
${scan.configError ? `- Config error: ${scan.configError}\n` : ""}
## Repositories

| ID | Path | Profile | Branch | HEAD | Commits | State |
|---|---|---|---|---|---|---|
${repoLines}

## Existing knowledge

- Directories: ${scan.knowledge.dirs.join(", ") || "—"}
- ADRs: ${scan.existing.adr}
- Specs: ${scan.existing.specs}
- Prompts: ${scan.existing.prompts}
- Plans: ${scan.existing.plans ? `${scan.existing.plans.files} files` : "—"}

## Languages

${Object.entries(scan.languages)
  .map(([ext, count]) => `- ${ext}: ${count}`)
  .join("\n") || "- —"}

## Suggested migration

- Workspace mode: ${scan.suggested.workspace ? "yes" : "no"}
- Root profile: ${scan.suggested.profile}
- Knowledge folder: \`${scan.suggested.knowledgeFolder}\`
- Backup folder: \`${scan.suggested.backupRoot}\`
`;
}

function planMarkdown(scan, repos, backup) {
  const repoList = repos.length
    ? repos
        .map(
          (repo) =>
            `- \`${repo.id}\` → \`${repo.path}\` (${repo.profile}, ${repo.git.branch || "—"} @ ${repo.git.head || "—"}, ${repo.git.commits} commits)`,
        )
        .join("\n")
    : "- single repository (no nested Git repositories detected)";
  return `# orchid-sdd migration plan

**Status:** scaffolded
**Root:** \`${scan.root}\`
**Backup:** ${backup ? `\`${backup.target}\`` : "**none — backup was skipped**"}
**Knowledge folder:** \`${scan.knowledge.folder}\`
**Profile:** ${scan.suggested.profile}

## Repositories

${repoList}

## What the CLI already did

1. Detected the repository/workspace topology.
2. Backed up the pre-migration assets to \`${backup ? backup.target : BACKUP_ROOT}\`.
3. Generated the root \`orchid-sdd.yml\` (workspace-aware).
4. Generated per-repo \`orchid-sdd.yml\` overrides with \`extends\`.
5. Created the root-owned \`.knowledge\` skeleton, state, manifest, and indexes.

The CLI did **not** invent memories. That is the LLM migration work below.

## Non-negotiable rules

- The workspace root owns \`.knowledge\`, state, manifest, indexes, and audit.
- Never edit \`manifest.jsonld\` or \`index/**\` by hand; use \`orchid-sdd record\` and \`orchid-sdd index\`.
- Preserve the backup. Do not delete legacy knowledge until the migration is accepted.
- Reconstruct memories from evidence: existing ADRs/specs/plans/prompts, Git history, file history, code, tests.
- One fact per node, description ≤160 chars, 3–7 topics, provenance via \`--artifact\` and \`--repo\`.
- No fabricated decisions. If evidence is ambiguous, record an \`Assumption\` and a question.

## Stage 1 — Inventory legacy knowledge

Read \`.orchid/migration/scan.json\`, the legacy \`.knowledge/README.md\`, and every
ADR/spec/plan/prompt/progress file. Write \`.orchid/migration/INVENTORY.md\` with:

- decisions (ADR id, title, status, affected repos);
- requirements/specs and their status;
- plans and prompts that are still active;
- progress/retrospective material that explains history;
- gaps and open questions;
- duplicates/conflicts with the current code.

Do not move files yet.

## Stage 2 — Seed the memory graph from existing knowledge

For each ADR, record a \`Decision\` node. For each binding spec, record \`Requirement\`
nodes and \`Scenario\` nodes where Gherkin exists. For active plans, record \`Prompt\`
nodes only if they describe work still to do.

\`\`\`bash
orchid-sdd record --type Decision --alias ADR-021 \\
  --description "Mini-agents are ..." \\
  --topics agents,architecture,decisions \\
  --artifact .knowledge/adr/ADR-021-mini-agents.md \\
  --scope project --repo orchid
\`\`\`

Use \`--repo\` only for repo-scoped memories. Keep cross-cutting decisions at root scope.

## Stage 3 — Reconstruct code memory from Git and file history

For each repo:

1. Read \`git log --reverse --format='%h %cs %s'\` and \`git log --follow -- <path>\`.
2. Read tags and release notes to identify stable behaviour.
3. Identify significant code units (public APIs, entry points, contracts, migrations).
4. Add \`ORCHID-MEM: <uuid>\` anchors and UUID-named docblocks.
5. Record \`CodeUnit\` nodes with \`--repo\`, \`--code path#symbol\`, and the docblock artifact.

Do not anchor trivia. Use the anchor policy: public behaviour, entry points, traced
symbols, and any symbol with a docblock.

## Stage 4 — Reorganize legacy knowledge safely

After the backup is verified, move (or copy) reusable legacy material into
\`${scan.knowledge.folder}/input/legacy/\` so the agent can cite it. Keep the original
taxonomy recognizable (adr/, specs/, plans/, prompts/, progress/). Update artifacts
on recorded nodes if paths change. Never delete the backup.

## Stage 5 — Validate and finalize

\`\`\`bash
orchid-sdd index
orchid-sdd lint
orchid-sdd doctor
orchid-sdd migrate finalize
\`\`\`

\`migrate finalize\` writes \`.orchid/migration/REPORT.md\` and moves the project to
\`phase: ready\`. Then start the first real iteration with \`orchid-sdd start\`.

## Acceptance criteria

- Every ADR/spec with current relevance has a memory node pointing to its artifact.
- Every repo's significant code units have anchors + docblocks.
- \`index --check\`, \`lint\`, and \`doctor\` are clean (or documented waivers).
- The backup exists and \`BACKUP.json\` lists every pre-migration asset.
- No legacy asset was deleted before the backup was verified.
`;
}

function promptsMarkdown(scan) {
  return {
    "01-inventory.md": `# Migration prompt 01 — Inventory

Read \`.orchid/migration/scan.json\`, \`${scan.knowledge.folder}/README.md\` (if present),
and every ADR/spec/plan/prompt/progress file. Write \`.orchid/migration/INVENTORY.md\`
with decisions, requirements, active plans, progress, gaps, and conflicts. Do not modify
or move legacy files yet. Do not record nodes yet.

Acceptance: the inventory names every source file it used and flags ambiguities.`,
    "02-memory.md": `# Migration prompt 02 — Seed memory

Using \`INVENTORY.md\`, record \`Decision\`, \`Requirement\`, and \`Scenario\` nodes with
\`orchid-sdd record --scope project\`. Every node needs a ≤160-char description, 3–7 topics,
an artifact, and (for repo-scoped facts) \`--repo\`. Use aliases for ADR/R/S ids. Do not
guess: if a decision is unclear, record an \`Assumption\` and a question.

Acceptance: each current ADR/spec has at least one linked node; \`orchid-sdd index\` runs.`,
    "03-code.md": `# Migration prompt 03 — Reconstruct code memory

For each repository, inspect current code plus \`git log\`, \`git log --follow\`, tags, and
release notes. Add \`ORCHID-MEM: <uuid>\` anchors and UUID-named docblocks for significant
units, then record \`CodeUnit\` nodes with \`--repo\`, \`--code\`, and the docblock artifact.
Do not anchor trivia. Run \`orchid-sdd lint\` and fix every error.

Acceptance: anchors resolve, docblocks exist, and code units are traceable.`,
    "04-finalize.md": `# Migration prompt 04 — Validate and finalize

Run \`orchid-sdd index\`, \`orchid-sdd lint\`, \`orchid-sdd doctor\`, then
\`orchid-sdd migrate finalize\`. Review \`.orchid/migration/REPORT.md\`. Fix findings
before finalizing. Do not delete the backup.

Acceptance: phase is \`ready\`, the report is written, and the next \`orchid-sdd start\`
can begin.`,
  };
}

function migrationReadme(scan, backup, repos, status = "scaffolded") {
  if (status === "complete") {
    return `# orchid-sdd migration

**Status:** complete
**Root:** \`${scan.root}\`
**Backup:** ${backup ? `\`${backup.target}\`` : "none (backup was skipped)"}
**Knowledge:** \`${scan.knowledge.folder}\`
**Repositories:** ${repos.length ? repos.map((repo) => `\`${repo.id}\``).join(", ") : "single repository"}

The migration is complete. See \`.orchid/migration/REPORT.md\` for counts and the backup
location. The pre-migration assets remain in the backup.

Next: \`orchid-sdd start "<title>"\`.
`;
  }
  return `# orchid-sdd migration

**Status:** ${status}
**Root:** \`${scan.root}\`
**Backup:** ${backup ? `\`${backup.target}\`` : "none (backup was skipped)"}
**Knowledge:** \`${scan.knowledge.folder}\`
**Repositories:** ${repos.length ? repos.map((repo) => `\`${repo.id}\``).join(", ") : "single repository"}

The CLI has scaffolded the root config, workspace overrides, knowledge skeleton, and
migration plan. The semantic reconstruction is **LLM agent work**:

1. Read \`.orchid/migration/PLAN.md\` and \`.orchid/migration/scan.json\`.
2. Execute the prompts in \`.orchid/migration/prompts/\` in order.
3. Record memories with \`orchid-sdd record\` (never edit the manifest).
4. Run \`orchid-sdd index\`, \`orchid-sdd lint\`, \`orchid-sdd doctor\`.
5. Run \`orchid-sdd migrate finalize\` when the acceptance criteria are met.

The pre-migration assets are preserved in the backup. Do not delete them until the
migration is accepted.
`;
}

function writeScaffold(root, scan, backup, repos) {
  const dir = path.join(root, MIGRATION_DIR);
  ensureDir(path.join(dir, "prompts"));
  writeJson(path.join(dir, "scan.json"), scan);
  if (backup) writeJson(path.join(dir, "BACKUP.json"), backup.manifest);
  fs.writeFileSync(path.join(dir, "PLAN.md"), planMarkdown(scan, repos, backup), "utf8");
  for (const [name, content] of Object.entries(promptsMarkdown(scan))) {
    fs.writeFileSync(path.join(dir, "prompts", name), `${content}\n`, "utf8");
  }
  const status = {
    stage: "scaffolded",
    createdAt: nowIso(),
    backup: backup ? backup.target : null,
    repos: repos.map((repo) => repo.id),
    scan: `${MIGRATION_DIR}/scan.json`,
  };
  writeJson(path.join(dir, "STATUS.json"), status);
  fs.writeFileSync(path.join(root, "MIGRATION.md"), migrationReadme(scan, backup, repos), "utf8");
  return { dir, status };
}

export function migrateInit(root, skillRoot, options = {}) {
  const scan = scanProject(root, skillRoot);
  const repos = options.single ? [] : scan.workspace.repos;
  const stateFile = path.join(root, ".orchid", "state.json");
  if (exists(stateFile)) {
    const state = readState(root);
    if (state.activeIteration) {
      throw new OrchidError(
        `iteration "${state.activeIteration}" is active; close or abandon it before migrating`,
      );
    }
  }
  if (scan.existing.config && !options.force) {
    throw new OrchidError(
      "orchid-sdd.yml already exists; inspect `orchid-sdd migrate scan`, or use --force to migrate",
    );
  }

  if (options.dryRun) {
    const preview = backupProject(root, skillRoot, { scan, dryRun: true });
    process.stdout.write(`Migration dry run for ${root}\n`);
    process.stdout.write(`  workspace: ${repos.length ? repos.map((repo) => repo.id).join(", ") : "single repo"}\n`);
    process.stdout.write(`  backup: ${preview.target}\n`);
    for (const entry of preview.entries) process.stdout.write(`    ${entry.source} → ${entry.backup}\n`);
    process.stdout.write(`  config: orchid-sdd.yml\n`);
    for (const repo of repos) {
      process.stdout.write(`  repo config: ${path.join(repo.path, repo.config || "orchid-sdd.yml")}\n`);
    }
    process.stdout.write(`  plan: ${MIGRATION_DIR}/PLAN.md\n`);
    process.stdout.write(`  prompts: ${MIGRATION_DIR}/prompts/\n`);
    return 0;
  }

  const backup = options.skipBackup
    ? null
    : backupProject(root, skillRoot, { scan });
  if (!backup) {
    process.stdout.write("  [warn] backup skipped by request\n");
  }

  runSetup(root, skillRoot, {
    profile: options.profile || scan.suggested.profile,
    project: options.project || scan.projectName,
    workspace: repos.length ? true : false,
    workspaceRepos: repos,
    knowledgeFolder: options.knowledgeFolder || scan.knowledge.folder,
    docblocksFolder: options.docblocksFolder,
    constitutionFolder: options.constitutionFolder,
    customizationsFolder: options.customizationsFolder,
    force: true,
    yes: true,
  });

  const scaffold = writeScaffold(root, scan, backup, repos);
  const state = readState(root);
  state.phase = "migration";
  state.migration = {
    stage: "scaffolded",
    backup: backup ? backup.target : null,
    startedAt: nowIso(),
    repos: repos.map((repo) => repo.id),
  };
  state.gates.G0 = "passed";
  writeState(root, state);
  writeProjection(root, loadConfig(root).config, state);

  process.stdout.write(`Migration scaffolded for ${scan.projectName}\n`);
  process.stdout.write(`  backup     ${backup ? backup.target : "none"}\n`);
  process.stdout.write(`  config     orchid-sdd.yml\n`);
  process.stdout.write(`  workspace  ${repos.length ? `${repos.length} repo(s)` : "single repo"}\n`);
  process.stdout.write(`  plan       ${MIGRATION_DIR}/PLAN.md\n`);
  process.stdout.write(`  prompts    ${MIGRATION_DIR}/prompts/\n`);
  process.stdout.write(`Next: execute the migration prompts, validate, then \`orchid-sdd migrate finalize\`\n`);
  return 0;
}

export function migrateStatus(root, args = {}) {
  const file = path.join(root, MIGRATION_DIR, "STATUS.json");
  if (!exists(file)) {
    if (args.json) process.stdout.write(`${formatJson({ status: "none" })}\n`);
    else process.stdout.write("No migration in progress.\n");
    return 0;
  }  const status = JSON.parse(readText(file));
  if (args.json) {
    process.stdout.write(`${formatJson(status)}\n`);
    return 0;
  }
  process.stdout.write(`Migration stage: ${status.stage}\n`);
  if (status.backup) process.stdout.write(`  backup: ${status.backup}\n`);
  if (status.repos && status.repos.length) process.stdout.write(`  repos:  ${status.repos.join(", ")}\n`);
  process.stdout.write(`  since:  ${status.createdAt}\n`);
  return 0;
}

export function migrateFinalize(root, skillRoot, options = {}) {
  const loaded = loadConfig(root);
  const state = readState(root);
  if (!state.migration && !options.force) {
    throw new OrchidError("no migration in progress; run `orchid-sdd migrate init` first");
  }
  const { manifest } = writeProjection(root, loaded.config, state);
  if (!manifest.nodes.length && !options.force) {
    throw new OrchidError(
      "migration has no memory nodes; reconstruct at least one node or pass --force",
    );
  }
  const statusFile = path.join(root, MIGRATION_DIR, "STATUS.json");
  const status = exists(statusFile) ? JSON.parse(readText(statusFile)) : {};
  const report = `# Migration report

- Finished: ${nowIso()}
- Backup: ${status.backup || "none"}
- Repositories: ${(status.repos || []).join(", ") || "single repository"}
- Nodes: ${manifest.nodes.length}
- History pointers: ${manifest.history.length}
- Knowledge: \`${loaded.config.knowledge_folder}\`
- Workspace: ${loaded.config.workspace && loaded.config.workspace.enabled ? `${loaded.config.workspace.repos.length} repo(s)` : "disabled"}

## Next

\`\`\`bash
orchid-sdd start "<title>"
\`\`\`
`;
  ensureDir(path.join(root, MIGRATION_DIR));
  fs.writeFileSync(path.join(root, MIGRATION_DIR, "REPORT.md"), report, "utf8");
  const nextStatus = { ...status, stage: "complete", finishedAt: nowIso(), nodes: manifest.nodes.length };
  writeJson(statusFile, nextStatus);
  fs.writeFileSync(
    path.join(root, "MIGRATION.md"),
    migrationReadme(
      { root, knowledge: { folder: loaded.config.knowledge_folder } },
      status.backup ? { target: status.backup } : null,
      (status.repos || []).map((id) => ({ id })),
      "complete",
    ),
    "utf8",
  );
  state.phase = "ready";
  state.migration = { ...(state.migration || {}), stage: "complete", finishedAt: nowIso() };
  state.gates.G0 = "passed";
  writeState(root, state);
  writeProjection(root, loaded.config, state);
  process.stdout.write(`Migration complete: ${manifest.nodes.length} node(s)\n`);
  process.stdout.write(`  report ${MIGRATION_DIR}/REPORT.md\n`);
  process.stdout.write(`Next: orchid-sdd start "<title>"\n`);
  return 0;
}

export function migrateCommand(root, skillRoot, args = {}) {
  const action = String(args.action || "status").toLowerCase();
  if (action === "scan") {
    const scan = scanProject(root, skillRoot);
    const output = args.output
      ? path.resolve(root, args.output)
      : null;
    if (output) {
      ensureDir(path.dirname(output));
      fs.writeFileSync(
        output,
        output.endsWith(".json") ? `${formatJson(scan)}\n` : `${renderScan(scan)}\n`,
        "utf8",
      );
    }
    if (args.json) process.stdout.write(`${formatJson(scan)}\n`);
    else if (!output) process.stdout.write(renderScan(scan));
    else process.stdout.write(`Wrote ${rel(root, output)}\n`);
    return 0;
  }
  if (action === "backup") {
    const result = backupProject(root, skillRoot, { dryRun: Boolean(args.dryRun) });
    if (args.json) {
      process.stdout.write(`${formatJson({ backup: result.target, entries: result.entries })}\n`);
      return 0;
    }
    process.stdout.write(`${result.dryRun ? "Would back up" : "Backed up"} ${result.entries.length} asset(s) to ${result.target}\n`);
    for (const entry of result.entries) {
      process.stdout.write(`  ${entry.source} → ${entry.backup} (${entry.files} files)\n`);
    }
    return 0;
  }
  if (action === "init") return migrateInit(root, skillRoot, args);
  if (action === "status") return migrateStatus(root, args);
  if (action === "finalize") return migrateFinalize(root, skillRoot, args);
  throw new OrchidError(`unknown migrate action "${action}" (use scan, backup, init, status, finalize)`);
}
