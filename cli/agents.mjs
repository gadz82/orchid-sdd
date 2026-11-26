import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { loadConfig } from "./config.mjs";
import { appendEvent, readState, writeState } from "./store.mjs";
import { withStateLock } from "./lock.mjs";
import {
  OrchidError,
  ensureDir,
  exists,
  formatJson,
  nowIso,
  readJson,
  readText,
  rel,
  sha256,
  sha256File,
  slugify,
  writeJson,
} from "./util.mjs";
import { parseYaml } from "./yaml.mjs";

export const AGENTS_BEGIN = "<!-- orchid-sdd:begin -->";
export const AGENTS_END = "<!-- orchid-sdd:end -->";
export const GITIGNORE_BEGIN = "# orchid-sdd:begin";
export const GITIGNORE_END = "# orchid-sdd:end";
export const DEV_CONTEXT_MARKER = "<!-- orchid-sdd:development-context -->";
export const FACTS_BEGIN = "<!-- orchid-sdd:facts:begin -->";
export const FACTS_END = "<!-- orchid-sdd:facts:end -->";
export const DOMAINS_BEGIN = "<!-- orchid-sdd:domains:begin -->";
export const DOMAINS_END = "<!-- orchid-sdd:domains:end -->";
export const GUIDANCE_BEGIN = "<!-- orchid-sdd:guidance:begin -->";
export const GUIDANCE_END = "<!-- orchid-sdd:guidance:end -->";
export const PROJECT_CONTEXT_FILE = "project-context.json";
export const MANIFEST_FILE = "MANIFEST.json";
export const SOURCES_FILE = "SOURCES.json";

const CODE_EXTS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".java",
  ".kt", ".kts", ".rb", ".php", ".cs", ".swift", ".scala", ".sql", ".sh",
  ".bash", ".vue", ".svelte", ".astro", ".dart", ".ex", ".exs", ".clj",
  ".fs", ".fsx", ".lua", ".r", ".gradle",
]);

const LANGUAGE_BY_EXT = {
  ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".py": "python", ".go": "go",
  ".rs": "rust", ".java": "java", ".kt": "kotlin", ".kts": "kotlin", ".rb": "ruby",
  ".php": "php", ".cs": "csharp", ".swift": "swift", ".scala": "scala", ".sql": "sql",
  ".sh": "shell", ".bash": "shell", ".vue": "vue", ".svelte": "svelte",
  ".astro": "astro", ".dart": "dart", ".ex": "elixir", ".exs": "elixir",
  ".clj": "clojure", ".fs": "fsharp", ".fsx": "fsharp", ".lua": "lua", ".r": "r",
  ".gradle": "gradle",
};

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".venv", "venv", ".next", ".nuxt", ".svelte-kit",
  ".pytest_cache", ".ruff_cache", ".mypy_cache", ".cache", "dist", "build",
  "out", "target", "vendor", "coverage", ".knowledge", ".orchid",
  ".orchid-migration-bck", ".contexts", "__pycache__", ".idea",
  ".vscode", ".turbo", ".nx", "tmp", "temp", "logs",
]);

const AGENT_SOURCE_NAMES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursorrules",
  ".windsurfrules",
]);

const AGENT_SOURCE_DIRS = [
  ".cursor/rules",
  ".github/copilot-instructions.md",
];

export function agentsFolder(root, config) {
  const folder = (config.agents && config.agents.folder) || ".orchid/agents";
  return path.resolve(root, folder);
}

export function agentPaths(root, config) {
  const dir = agentsFolder(root, config);
  return {
    dir,
    contexts: path.join(dir, "contexts.yml"),
    manifest: path.join(dir, MANIFEST_FILE),
    sources: path.join(dir, "sources"),
    projectSources: path.join(dir, "sources", "project"),
    agentSources: path.join(dir, "sources", "agent"),
    sourceIndex: path.join(dir, "sources", SOURCES_FILE),
    contextsDir: path.join(dir, "agents"),
    runtime: path.join(dir, "runtime"),
    runtimeFile: path.join(dir, "runtime", "activation.json"),
    libraryMarker: path.join(dir, "runtime", "library.json"),
    projectContext: path.join(dir, PROJECT_CONTEXT_FILE),
  };
}

/* ------------------------------------------------------------------------- */
/* Managed Markdown / gitignore blocks                                       */
/* ------------------------------------------------------------------------- */

export function agentsBlock(
  knowledgeFolder,
  constitutionFolder = ".orchid/constitution",
  { enabled = true, agentsFolder = ".orchid/agents" } = {},
) {
  const agentsLines = enabled
    ? `- During an orchid-sdd iteration this file may be temporarily replaced by the development context in \`${agentsFolder}/\`; it is restored by \`orchid-sdd agents off\` and before closure. Keep user-owned project guidance here, never in the development context.
- At the end of every iteration, update this file and any nested project \`AGENTS.md\`, then run \`orchid-sdd agents project sync\`. Update the development context as a separate flow and run \`orchid-sdd agents sync\`.
`
    : "";
  return `${AGENTS_BEGIN}
## orchid-sdd memory
- Code may carry \`ORCHID-MEM: <uuid> — <short behaviour>\` anchors. The anchor is the only memory/history reference in code; history lives in the UUID docblock. Resolve it before changing that code's behaviour.
- Inline comments explain why or a non-obvious invariant only; never restate code or copy history.
- Read \`${knowledgeFolder}/manifest.jsonld\` and \`${knowledgeFolder}/index/\` — plain JSON; the JSON-LD context is optional.
- Search by topic or question first: \`orchid-sdd recall <topic|question|uuid|path>\`.
- \`${knowledgeFolder}/index/recall.json\` is generated and Git-ignored; never hand-edit it. When it is missing or stale, run \`orchid-sdd index\` (preferred) or let the first \`recall\` rebuild it. If the CLI is unavailable, warn the user before retrieval: "The recall index cannot be rebuilt without the orchid-sdd CLI. Retrieval is limited to \`manifest.jsonld\` and the versioned core indexes."
- Never edit \`${knowledgeFolder}/**\`, the manifest, or docblocks of code you do not own. Write code; propose knowledge.
- Follow \`${constitutionFolder}/\` for how code is written here.
- Read \`orchid-sdd steering context --phase <phase>\` before Discovery and Logic Review; apply every active rule and cite its ID.
- Before Build, read the Build steering context and follow the project code examples for the language; a deviation requires an ADR.
- Run \`orchid-sdd route --phase <phase>\` before work; if the current model/agent is unknown or mismatched, tell the user. Never switch automatically.
- Track development prompts with \`orchid-sdd prompt start|step|complete\`; save a checkpoint with \`orchid-sdd handoff prepare\` before changing harness.
- For independent prompts use \`orchid-sdd wave start <N>\`, then start up to \`execution.max_parallel\` prompts; finish with \`orchid-sdd wave reconcile <N>\`. Retry reconciliation after fixing a conflict or test. State mutations are leased through \`.orchid/locks/state.lock\`; never bypass a live lease.
- Run the CLI against the project root (or pass \`--root <root>\`), even while editing inside a prompt worktree; the root owns state, events, knowledge, and the lease.
- Ask before starting whether to create a feature branch and from which base; record the answer in the TRD. If not, stay on the current branch.
- Each prompt gets one disposable worktree and temporary branch; remove both immediately after CR and merge. Never leave an \`orchid/<iteration>/<prompt-id>\` branch behind.
- In workspace mode, record every discovered cross-repo dependency in \`.orchid/cross-repo-dependencies.md\`; cite the \`DEP-###\` row in prompt contracts and CR.
${agentsLines}${AGENTS_END}
`;
}

export function gitignoreBlock(knowledgeFolder, config = null) {
  const linkNames = (config && config.agents && config.agents.link_names) || ["AGENTS.md"];
  const agentFolder = (config && config.agents && config.agents.folder) || ".orchid/agents";
  const backupLines = linkNames.map((name) => `**/${name}.bak*`).join("\n");
  return `${GITIGNORE_BEGIN}
${knowledgeFolder}/run-log/
${knowledgeFolder}/index/recall.json
${knowledgeFolder}/iterations/*/execution/runs/
${knowledgeFolder}/iterations/*/plan/prompts/_bus/
.orchid/worktrees/
.orchid/locks/
${agentFolder}/runtime/
.orchid-migration-bck/
# agent-contexts cache is generated for the local project; never commit it
.contexts/
${backupLines}
${GITIGNORE_END}
`;
}

const LOCAL_EXCLUDE_BEGIN = "# orchid-sdd agent contexts:begin";
const LOCAL_EXCLUDE_END = "# orchid-sdd agent contexts:end";

function localExcludeFile(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--git-path", "info/exclude"], {
    encoding: "utf8",
    timeout: 8000,
  });
  if (result.status !== 0 || !result.stdout) return null;
  return path.resolve(root, result.stdout.trim());
}

function ensureLocalExclude(root) {
  const file = localExcludeFile(root);
  if (!file) return false;
  ensureDir(path.dirname(file));
  const current = exists(file) ? readText(file) : "";
  if (current.includes(LOCAL_EXCLUDE_BEGIN)) return false;
  const block = `${LOCAL_EXCLUDE_BEGIN}\ncontexts.lock\n${LOCAL_EXCLUDE_END}\n`;
  fs.writeFileSync(file, `${current}${current.length && !current.endsWith("\n") ? "\n" : ""}${block}`, "utf8");
  return true;
}

function removeLocalExclude(root) {
  const file = localExcludeFile(root);
  if (!file || !exists(file)) return false;
  const current = readText(file);
  const start = current.indexOf(LOCAL_EXCLUDE_BEGIN);
  const end = current.indexOf(LOCAL_EXCLUDE_END, start + 1);
  if (start < 0 || end < 0) return false;
  const next = `${current.slice(0, start)}${current.slice(end + LOCAL_EXCLUDE_END.length)}`.replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(file, next, "utf8");
  return true;
}

export function managedBlockState(file, begin = AGENTS_BEGIN, end = AGENTS_END) {
  if (!exists(file)) return { present: false, complete: false, current: null };
  const content = readText(file);
  const start = content.indexOf(begin);
  if (start < 0) return { present: false, complete: false, current: null };
  const finish = content.indexOf(end, start + begin.length);
  if (finish < 0) return { present: true, complete: false, current: null };
  return {
    present: true,
    complete: true,
    current: content.slice(start, finish + end.length),
  };
}

/**
 * Insert or replace a managed block while preserving every byte outside it.
 * This is the compatibility rule: an existing AGENTS.md is integrated, never
 * overwritten.
 */
export function upsertManaged(file, block, begin = AGENTS_BEGIN, end = AGENTS_END) {
  const desired = block.trimEnd();
  if (!exists(file)) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, `${desired}\n`, "utf8");
    return "created";
  }
  const content = readText(file);
  const start = content.indexOf(begin);
  if (start < 0) {
    const separator = content.length === 0 ? "" : content.endsWith("\n") ? "\n" : "\n\n";
    fs.writeFileSync(file, `${content}${separator}${desired}\n`, "utf8");
    return "appended";
  }
  const finish = content.indexOf(end, start + begin.length);
  if (finish < 0) {
    throw new OrchidError(
      `${rel(".", file)} has an orchid-sdd managed block without its end marker; repair the file before setup`,
    );
  }
  const before = content.slice(0, start);
  const after = content.slice(finish + end.length);
  const next = `${before}${desired}${after}`;
  if (next === content) return "unchanged";
  fs.writeFileSync(file, next, "utf8");
  return "updated";
}

/* ------------------------------------------------------------------------- */
/* Filesystem scanning                                                       */
/* ------------------------------------------------------------------------- */

function walk(root, visit, { skip = SKIP_DIRS, maxFiles = 20000 } = {}) {
  let seen = 0;
  const visitDir = (dir) => {
    if (seen > maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (seen > maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        visitDir(full);
      } else if (entry.isFile()) {
        seen += 1;
        visit(full);
      }
    }
  };
  visitDir(root);
}

export function collectProjectAgentFiles(root, config) {
  const folder = agentsFolder(root, config);
  const files = [];
  walk(root, (file) => {
    if (path.resolve(path.dirname(file)) === folder) return;
    if (path.basename(file) !== "AGENTS.md") return;
    let content;
    try {
      content = readText(file);
    } catch {
      return;
    }
    const managed = managedBlockState(file);
    files.push({
      path: rel(root, file),
      absolute: file,
      lines: content.split("\n").length,
      bytes: Buffer.byteLength(content),
      hash: sha256(content),
      managed: managed.complete,
    });
  });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function collectAgentSourceFiles(root, config, { maxFiles = 200, maxBytes = 256000 } = {}) {
  const found = new Map();
  const add = (file, kind) => {
    if (found.size >= maxFiles) return;
    if (!exists(file)) return;
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return;
    const relative = rel(root, file);
    if (found.has(relative)) return;
    found.set(relative, { path: relative, absolute: file, kind });
  };
  walk(root, (file) => {
    const base = path.basename(file);
    const directory = path.dirname(rel(root, file));
    if (AGENT_SOURCE_NAMES.has(base)) {
      add(file, "agent");
      return;
    }
    if (
      AGENT_SOURCE_DIRS.some((entry) => {
        if (entry.endsWith(".md")) return rel(root, file) === entry;
        return directory === entry || directory.startsWith(`${entry}/`);
      })
    ) {
      add(file, "agent");
    }
  });
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function languageFor(file) {
  return LANGUAGE_BY_EXT[path.extname(file).toLowerCase()] || null;
}

function codeStats(dir, { maxFiles = 6000 } = {}) {
  const languages = {};
  const samples = [];
  let files = 0;
  walk(
    dir,
    (file) => {
      const ext = path.extname(file).toLowerCase();
      if (!CODE_EXTS.has(ext)) return;
      files += 1;
      const language = languageFor(file);
      if (language) languages[language] = (languages[language] || 0) + 1;
      if (samples.length < 6) samples.push(rel(dir, file));
    },
    { maxFiles },
  );
  return {
    files,
    languages: Object.entries(languages)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([language, count]) => ({ language, files: count })),
    samples,
  };
}

function isCodeDir(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .some((entry) => entry.isFile() && CODE_EXTS.has(path.extname(entry.name).toLowerCase()));
  } catch {
    return false;
  }
}

function directCodeFiles(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && CODE_EXTS.has(path.extname(entry.name).toLowerCase()))
      .length;
  } catch {
    return 0;
  }
}

/**
 * Detect directory-scoped domains for nested AGENTS.md. Workspace repositories
 * are always domains; in single-repo mode we take code-bearing top-level
 * folders and the nearest directories that already contain project AGENTS.md.
 */
export function detectDomains(root, config, projectAgents = []) {
  const targets = new Map();
  const add = (target, reason) => {
    const normalized = String(target || ".").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
    if (normalized.split("/").includes("..") || path.isAbsolute(normalized)) return;
    if (normalized !== ".") {
      const absolute = path.join(root, normalized);
      if (!exists(absolute) || !fs.statSync(absolute).isDirectory()) return;
    }
    const current = targets.get(normalized) || { target: normalized, reasons: [] };
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    targets.set(normalized, current);
  };

  add(".", "root");
  if (config.workspace && config.workspace.enabled) {
    for (const repo of config.workspace.repos || []) {
      if (repo.enabled === false) continue;
      add(repo.path, "workspace repo");
    }
  }
  for (const file of projectAgents) {
    const dir = path.dirname(file.path).replace(/\\/g, "/");
    if (dir && dir !== "." && dir !== "..") add(dir, "existing project AGENTS.md");
  }

  if (!config.agents || config.agents.nested !== false) {
    const maxDepth = config.workspace && config.workspace.enabled ? 3 : 2;
    const scan = (dir, depth) => {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const relative = rel(root, full);
        const files = directCodeFiles(full);
        // A folder with code or a conventional package/service root is a domain.
        if (files >= 2 || (depth === 1 && isCodeDir(full))) {
          add(relative, files >= 2 ? `${files} code files` : "code folder");
          continue;
        }
        scan(full, depth + 1);
      }
    };
    scan(root, 1);
  }

  const max = Number(config.agents?.max_targets) || 12;
  const ordered = [...targets.values()].sort((a, b) => {
    if (a.target === ".") return -1;
    if (b.target === ".") return 1;
    const aDepth = a.target.split("/").length;
    const bDepth = b.target.split("/").length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.target.localeCompare(b.target);
  });
  const usedSlugs = new Set();
  return ordered.slice(0, max).map((entry) => {
    const absolute = entry.target === "." ? root : path.join(root, entry.target);
    const stats = codeStats(absolute);
    let slug = entry.target === "." ? "root" : slugify(entry.target.replace(/\//g, "-"), 60);
    if (entry.target !== ".") {
      let suffix = 2;
      while (usedSlugs.has(slug)) slug = `${slug}-${suffix++}`;
    }
    usedSlugs.add(slug);
    return {
      ...entry,
      slug,
      files: stats.files,
      languages: stats.languages,
      samples: stats.samples,
      agentFile: projectAgents.find((file) => path.dirname(file.path) === entry.target) || null,
    };
  });
}

function extractGuidance(content, { budget = 3200, skipManaged = true } = {}) {
  let text = String(content || "");
  if (skipManaged) {
    const start = text.indexOf(AGENTS_BEGIN);
    const end = text.indexOf(AGENTS_END, start + 1);
    if (start >= 0 && end >= 0) text = `${text.slice(0, start)}${text.slice(end + AGENTS_END.length)}`;
    else if (start >= 0) text = text.slice(0, start);
  }
  text = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  const lines = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    if (/orchid-sdd/i.test(line)) continue;
    if (/^```/.test(line.trim())) continue;
    lines.push(line);
  }
  const joined = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (joined.length <= budget) return joined;
  return `${joined.slice(0, budget).trimEnd()}\n\n<!-- truncated; full source preserved under .orchid/agents/sources/ -->`;
}

/* ------------------------------------------------------------------------- */
/* Dataset generation                                                        */
/* ------------------------------------------------------------------------- */

function yamlKey(value) {
  return JSON.stringify(value);
}

function existingMappingRows(root, config) {
  const p = agentPaths(root, config);
  if (!exists(p.contexts)) return [];
  let data;
  try {
    data = parseYaml(readText(p.contexts));
  } catch {
    return [];
  }
  const mappings = data && data.mappings && typeof data.mappings === "object" ? data.mappings : {};
  const rows = [];
  for (const [target, value] of Object.entries(mappings)) {
    if (!value || typeof value !== "object" || !value.context_source) continue;
    const normalized = target === "." ? "." : String(target).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (
      normalized !== "." &&
      (path.isAbsolute(normalized) || normalized.split("/").includes(".."))
    ) {
      continue;
    }
    const source = path.resolve(p.dir, String(value.context_source));
    if (source !== p.dir && !source.startsWith(`${p.dir}${path.sep}`)) continue;
    rows.push({
      target: normalized,
      contextSource: String(value.context_source),
      source,
      description: value.description || "",
    });
  }
  return rows;
}

function isGeneratedMapping(root, config, row) {
  const p = agentPaths(root, config);
  if (!row.source.startsWith(`${p.contextsDir}${path.sep}`)) return false;
  if (!exists(row.source)) return false;
  try {
    return readText(row.source).includes(DEV_CONTEXT_MARKER);
  } catch {
    return false;
  }
}

export function renderContextsYaml(config, domains, extras = []) {
  const lines = [];
  lines.push('version: "1"');
  lines.push(`name: ${JSON.stringify(`${config.project.name}-orchid-development`)}`);
  lines.push('description: "orchid-sdd development contexts generated from the project and existing agent context"');
  lines.push("mappings:");
  for (const domain of domains) {
    lines.push(`  ${yamlKey(domain.target)}:`);
    lines.push(`    context_source: ${JSON.stringify(`./agents/${domain.slug}/AGENTS.md`)}`);
    lines.push(
      `    description: ${JSON.stringify(domain.target === "." ? "orchid-sdd orchestrator development context" : `project domain context for ${domain.target}`)}`,
    );
  }
  for (const extra of extras) {
    lines.push(`  ${yamlKey(extra.target)}:`);
    lines.push(`    context_source: ${JSON.stringify(extra.contextSource)}`);
    lines.push(`    description: ${JSON.stringify(extra.description || "user-curated development context")}`);
  }
  lines.push("");
  return lines.join("\n");
}

function projectFactsBlock(config) {
  const workspace =
    config.workspace && config.workspace.enabled
      ? config.workspace.repos
          .filter((repo) => repo.enabled !== false)
          .map((repo) => `\`${repo.id}\` → \`${repo.path}\``)
          .join(", ")
      : "single repository";
  const tests = config.execution?.test_commands || {};
  const testLines = Object.entries(tests)
    .filter(([, value]) => value)
    .map(([name, value]) => `- ${name}: \`${value}\``)
    .join("\n");
  return `${FACTS_BEGIN}
- Project: **${config.project.name}** (profile: \`${config.project.profile}\`, default branch: \`${config.project.default_branch}\`)
- Knowledge: \`${config.knowledge_folder}\` · docblocks: \`${config.docblocks_folder}\` · constitution: \`${config.constitution_folder}\`
- Workspace: ${workspace}
${testLines || "- Tests: see `orchid-sdd.yml` (`execution.test_commands`)"}
- Personas: ${(config.personas?.enabled || []).join(", ") || "—"}
- Steering: ${(config.steering?.enabled || []).map((id) => `\`${id}\``).join(", ") || "—"}
- Model routing: default effort \`${config.models?.default_effort || "medium"}\`; mismatch policy \`${config.models?.mismatch || "warn"}\`
- Agent context folder: \`${config.agents.folder}\`; link names: ${(config.agents.link_names || []).map((name) => `\`${name}\``).join(", ")}
${FACTS_END}`;
}

function developmentContract(agentsFolder) {
  return `## Development workflow (orchid-sdd)

You are running an **orchid-sdd iteration**. This file is the active development context.
The user's project \`AGENTS.md\` is preserved and restored by \`orchid-sdd agents off\`;
do not look for it while the switch is active and do not copy its contents into this file
verbatim. Curated source snapshots live under \`${agentsFolder}/sources/\`.

### Role and first move

1. Run \`orchid-sdd status\`; if state is unclear, run \`orchid-sdd doctor\`.
2. Read the active steering context before Discovery and Logic Review:
   \`orchid-sdd steering context --phase <phase>\`.
3. Resolve routing with \`orchid-sdd route --phase <phase>\` (and \`--prompt P-###\` when
   starting a prompt). Never switch agent/model silently.
4. Query memory instead of loading the graph: \`orchid-sdd recall <topic|question|uuid|path>\`.
5. Read the nested development context for the folder you are about to change.

### Hard rules

- Never auto-invoke orchid-sdd; it is explicit-only.
- The CLI is the only writer of state, events, manifest, indexes, and the matrix.
- Never edit \`.knowledge/**\`, \`manifest.jsonld\`, or generated indexes by hand.
- Never pass a gate without evidence; never auto-pass a human gate.
- Never review your own implementation; reviewers get fresh context.
- Never merge to the default branch during build unless an active repository rule allows it.
- Never leave a prompt worktree or \`orchid/<iteration>/<prompt-id>\` branch behind.
- Keep inline comments why-only; history belongs in the UUID docblock behind the
  \`ORCHID-MEM\` anchor.
- Never store secrets or personal data in knowledge.

### Lifecycle and gates

\`setup → start → discover → assess → plan → build → review → close → handover\`
with gates \`G0…G8\`. Phase commands do not auto-pass their predecessor. Use
\`orchid-sdd gate status\` to orient and \`orchid-sdd gate pass|fail\` with evidence.

### Build and waves

- One prompt, one reviewable outcome; tests are part of the deliverable.
- \`orchid-sdd wave start <N>\` freezes a base and creates one worktree per prompt.
- Start at most \`execution.max_parallel\` prompts; keep write scopes disjoint.
- Reconcile with \`orchid-sdd wave reconcile <N> --test\`; retry after fixing a failure.
- Track execution with \`orchid-sdd prompt start|step|complete|fail|waive\`.
- Use \`orchid-sdd handoff prepare\` before switching harness; \`orchid-sdd resume\` restores.

### Context maintenance (end of every iteration)

The **project** context and the **development** context are separate flows:

1. \`orchid-sdd agents off\` restores the user's project \`AGENTS.md\` files.
2. Update the root and nested project \`AGENTS.md\` with durable project guidance.
3. Update this development context and the relevant nested context files with
   orchid-sdd-specific facts that made this iteration hard or slow.
4. Run \`orchid-sdd agents project sync\` and \`orchid-sdd agents sync\`.
5. Then continue to Logic Review and closure.

Never put project policy in the development context, and never put orchid-sdd
runtime instructions in the project context beyond the managed block.`;
}

function maintenanceChecklist(target) {
  return `## Maintenance

- Update this file at the end of an iteration when conventions, commands, entry
  points, invariants, or recurring failure modes change${target === "." ? "" : ` for \`${target}\``}.
- Keep it concise: facts that change how an orchid-sdd agent works in this folder,
  not a copy of the code or of the project \`AGENTS.md\`.
- Run \`orchid-sdd agents sync\` after editing; the command refreshes the lock and
  records the development-context evidence used at closure. Project edits also
  require \`orchid-sdd agents project sync\`.`;
}

function domainFactsBlock(domain, config) {
  const languages = domain.languages.length
    ? domain.languages.map((entry) => `\`${entry.language}\` (${entry.files})`).join(", ")
    : "—";
  const samples = domain.samples.length
    ? domain.samples.map((file) => `  - \`${file}\``).join("\n")
    : "  - —";
  const repo = (config.workspace?.repos || []).find((entry) => entry.path === domain.target);
  const repoTests = Object.entries(repo?.test_commands || {})
    .filter(([, value]) => value)
    .map(([name, value]) => `- ${name}: \`${value}\``)
    .join("\n");
  return `${FACTS_BEGIN}
- Target: \`${domain.target}\` (${domain.files} code file(s))
- Languages: ${languages}
- Why this folder is a domain: ${domain.reasons.join(", ")}
- Representative files:
${samples}
${repo ? `- Repository tests:\n${repoTests || "  - see the root config"}` : ""}
${FACTS_END}`;
}

function domainsBlock(config, domains) {
  const rows = domains
    .filter((domain) => domain.target !== ".")
    .map(
      (domain) =>
        `- \`${domain.target}\` → \`${domain.file || `${config.agents.folder}/agents/${domain.slug}/AGENTS.md`}\``,
    )
    .join("\n");
  return `${DOMAINS_BEGIN}
${rows || "- no nested domains detected; keep work scoped to the root context"}
${DOMAINS_END}`;
}

export function renderRootDevelopmentContext(config, domains, sources) {
  const domainRows = domainsBlock(config, domains);
  const projectAgentsList = sources.projectAgents.length
    ? sources.projectAgents.map((file) => `- \`${file.path}\` (${file.lines} lines)`).join("\n")
    : "- no project AGENTS.md found";
  const agentSourceList = sources.agentSources.length
    ? sources.agentSources.map((file) => `- \`${file.path}\` → \`${file.snapshot}\``).join("\n")
    : "- no additional agent context files found";
  return `${DEV_CONTEXT_MARKER}
# orchid-sdd development context

> **Active switch.** This file is linked as the project \`AGENTS.md\` while an
> orchid-sdd iteration is running. The user's project context is preserved and
> restored by \`orchid-sdd agents off\`. Project instructions must not leak into
> the orchid-sdd protocol.

${projectFactsBlock(config)}

${developmentContract(config.agents.folder)}

## Domain contexts

${domainRows}

Read the domain context before editing that folder. If a folder has no domain
context and deserves one, add a mapping to \`.orchid/agents/contexts.yml\` and run
\`orchid-sdd agents sync\`.

## Project context sources

The original project agent context is preserved here for integration, not as
active instructions:

${projectAgentsList}

Additional agent sources:

${agentSourceList}

## Imported project guidance

The extract below is curated from the project context. Treat it as project facts,
not as orchid-sdd policy: the hard rules and workflow above win on conflict.
${GUIDANCE_BEGIN}
${sources.rootGuidance || "_No project guidance was found._"}
${GUIDANCE_END}

${maintenanceChecklist(".")}
`;
}

export function renderDomainDevelopmentContext(domain, config, guidance = "") {
  return `${DEV_CONTEXT_MARKER}
# orchid-sdd development context — \`${domain.target}\`

${domainFactsBlock(domain, config)}

## Scope

Work inside \`${domain.target}\` follows this context in addition to the root
development context. Keep public contracts stable unless the prompt explicitly
changes them, and put tests next to the domain's existing test seam.

## Imported project guidance

${GUIDANCE_BEGIN}
${guidance || "_No folder-specific project guidance found._"}
${GUIDANCE_END}

${maintenanceChecklist(domain.target)}
`;
}

function upsertMarkerBlock(file, block, begin, end) {
  if (!exists(file)) return "missing";
  const content = readText(file);
  const start = content.indexOf(begin);
  const finish = content.indexOf(end, start + 1);
  if (start < 0 || finish < 0) return "unmanaged";
  const next = `${content.slice(0, start)}${block}${content.slice(finish + end.length)}`;
  if (next === content) return "unchanged";
  fs.writeFileSync(file, next, "utf8");
  return "updated";
}

function upsertFactsBlock(file, block) {
  return upsertMarkerBlock(file, block, FACTS_BEGIN, FACTS_END);
}

export function initAgentContexts(
  root,
  config,
  { force = false, preserveProjectSources = false } = {},
) {
  if (!config.agents || config.agents.enabled === false) {
    return { enabled: false, targets: [], sources: [] };
  }
  const p = agentPaths(root, config);
  for (const dir of [p.dir, p.sources, p.projectSources, p.agentSources, p.contextsDir, p.runtime]) {
    ensureDir(dir);
  }

  let projectAgents;
  let agentSources;
  let sourceRows = [];
  const previous = (() => {
    if (!preserveProjectSources || !exists(p.sourceIndex)) return null;
    try {
      return readJson(p.sourceIndex).files || null;
    } catch {
      return null;
    }
  })();

  if (previous) {
    // The visible project AGENTS.md files are the development context while the
    // switch is active. Keep the pre-switch snapshots instead of copying the
    // development files into the project-source archive.
    sourceRows = previous;
    const snapshot = (row) => {
      const absolute = path.join(root, row.snapshot);
      const content = exists(absolute) ? readText(absolute) : "";
      return {
        path: row.path,
        absolute,
        lines: row.lines || content.split("\n").length,
        bytes: Buffer.byteLength(content),
        hash: row.hash || sha256(content),
        managed: managedBlockState(absolute).complete,
        kind: row.kind,
      };
    };
    projectAgents = previous.filter((row) => row.kind === "project").map(snapshot);
    agentSources = previous.filter((row) => row.kind !== "project").map(snapshot);
  } else {
    projectAgents = collectProjectAgentFiles(root, config);
    agentSources = collectAgentSourceFiles(root, config);

    // Generated source snapshots keep the original project context available while
    // the switch replaces the visible AGENTS.md files.
    fs.rmSync(p.projectSources, { recursive: true, force: true });
    fs.rmSync(p.agentSources, { recursive: true, force: true });
    ensureDir(p.projectSources);
    ensureDir(p.agentSources);
    for (const file of agentSources) {
      const isProjectAgent = projectAgents.some((entry) => entry.path === file.path);
      const base = isProjectAgent ? p.projectSources : p.agentSources;
      const target = path.join(base, file.path);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, readText(file.absolute), "utf8");
      sourceRows.push({
        path: file.path,
        kind: isProjectAgent ? "project" : "agent",
        snapshot: rel(root, target),
        hash: sha256File(file.absolute),
        lines: readText(file.absolute).split("\n").length,
      });
    }
    writeJson(p.sourceIndex, {
      generatedAt: nowIso(),
      files: sourceRows,
    });
  }

  const detectedDomains = detectDomains(root, config, projectAgents);
  const previousMappings = existingMappingRows(root, config);
  const previousByTarget = new Map(previousMappings.map((row) => [row.target, row]));
  const warnings = [];
  const generatedDomains = [];
  const customDomains = [];
  for (const domain of detectedDomains) {
    const previous = previousByTarget.get(domain.target);
    const custom =
      domain.target !== "." &&
      previous &&
      exists(previous.source) &&
      !isGeneratedMapping(root, config, previous);
    if (custom) {
      customDomains.push(domain);
      continue;
    }
    if (domain.target !== "." && previous && !exists(previous.source)) {
      warnings.push(
        `custom mapping for "${domain.target}" points to a missing context source; regenerated`,
      );
    }
    generatedDomains.push(domain);
  }
  const domainTargets = new Set(detectedDomains.map((domain) => domain.target));
  const extras = [];
  for (const previous of previousMappings) {
    if (domainTargets.has(previous.target)) {
      if (customDomains.some((domain) => domain.target === previous.target)) {
        extras.push(previous);
      }
      continue;
    }
    if (previous.target !== ".") {
      const dir = path.join(root, previous.target);
      if (!exists(dir) || !fs.statSync(dir).isDirectory()) continue;
    }
    if (!exists(previous.source)) {
      warnings.push(
        `mapping for "${previous.target}" points to a missing context source; dropped from sync`,
      );
      continue;
    }
    extras.push(previous);
  }
  const contextsYaml = renderContextsYaml(config, generatedDomains, extras);
  fs.writeFileSync(p.contexts, contextsYaml, "utf8");

  const rootGuidance = (() => {
    const rootAgent = projectAgents.find((file) => file.path === "AGENTS.md");
    return rootAgent ? extractGuidance(readText(rootAgent.absolute)) : "";
  })();
  const sources = {
    projectAgents,
    agentSources: sourceRows.filter((row) => row.kind !== "project"),
    rootGuidance,
  };

  const rootFile = path.join(p.contextsDir, "root", "AGENTS.md");
  const domainsForRoot = detectedDomains.map((domain) => {
    const previous = previousByTarget.get(domain.target);
    const custom =
      domain.target !== "." &&
      previous &&
      exists(previous.source) &&
      !isGeneratedMapping(root, config, previous);
    return {
      ...domain,
      file:
        domain.target === "."
          ? rel(root, rootFile)
          : custom
            ? rel(root, previous.source)
            : `${config.agents.folder}/agents/${domain.slug}/AGENTS.md`,
    };
  });
  let rootGenerated = false;
  if (!exists(rootFile) || force) {
    ensureDir(path.dirname(rootFile));
    fs.writeFileSync(
      rootFile,
      renderRootDevelopmentContext(config, domainsForRoot, sources),
      "utf8",
    );
    rootGenerated = true;
  } else {
    upsertFactsBlock(rootFile, projectFactsBlock(config));
    upsertMarkerBlock(
      rootFile,
      domainsBlock(config, domainsForRoot),
      DOMAINS_BEGIN,
      DOMAINS_END,
    );
    upsertMarkerBlock(
      rootFile,
      `${GUIDANCE_BEGIN}\n${rootGuidance || "_No project guidance was found._"}\n${GUIDANCE_END}`,
      GUIDANCE_BEGIN,
      GUIDANCE_END,
    );
  }

  const entries = [];
  for (const domain of detectedDomains) {
    const previous = previousByTarget.get(domain.target);
    const custom =
      domain.target !== "." &&
      previous &&
      exists(previous.source) &&
      !isGeneratedMapping(root, config, previous);
    if (custom) {
      entries.push({
        ...domain,
        file: rel(root, previous.source),
        generated: false,
        custom: true,
        projectAgents: projectAgents
          .filter((entry) => path.dirname(entry.path) === domain.target)
          .map((entry) => entry.path),
      });
      continue;
    }
    if (domain.target === ".") {
      entries.push({
        ...domain,
        file: rel(root, rootFile),
        generated: rootGenerated,
        projectAgents: projectAgents.filter((file) => file.path === "AGENTS.md").map((file) => file.path),
      });
      continue;
    }
    const file = path.join(p.contextsDir, domain.slug, "AGENTS.md");
    const guidance = domain.agentFile
      ? extractGuidance(readText(domain.agentFile.absolute))
      : "";
    let generated = false;
    if (!exists(file) || force) {
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, renderDomainDevelopmentContext(domain, config, guidance), "utf8");
      generated = true;
    } else {
      upsertFactsBlock(file, domainFactsBlock(domain, config));
      upsertMarkerBlock(
        file,
        `${GUIDANCE_BEGIN}\n${guidance || "_No folder-specific project guidance found._"}\n${GUIDANCE_END}`,
        GUIDANCE_BEGIN,
        GUIDANCE_END,
      );
    }
    entries.push({
      ...domain,
      file: rel(root, file),
      generated,
      projectAgents: projectAgents
        .filter((entry) => path.dirname(entry.path) === domain.target)
        .map((entry) => entry.path),
    });
  }
  const entryTargets = new Set(entries.map((entry) => entry.target));
  for (const extra of extras) {
    if (entryTargets.has(extra.target)) continue;
    entryTargets.add(extra.target);
    entries.push({
      target: extra.target,
      slug: extra.target === "." ? "root" : slugify(extra.target.replace(/\//g, "-"), 60),
      reasons: ["user-curated mapping"],
      files: 0,
      languages: [],
      samples: [],
      agentFile: null,
      file: rel(root, extra.source),
      generated: false,
      custom: true,
      projectAgents: projectAgents
        .filter((entry) => path.dirname(entry.path) === extra.target)
        .map((entry) => entry.path),
    });
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    project: {
      name: config.project.name,
      profile: config.project.profile,
      folder: config.agents.folder,
    },
    targets: entries.map((entry) => ({
      target: entry.target,
      file: entry.file,
      reasons: entry.reasons,
      files: entry.files,
      languages: entry.languages,
      existingProjectAgents: entry.projectAgents,
    })),
    sources: sourceRows,
    projectAgents: projectAgents.map((file) => ({
      path: file.path,
      lines: file.lines,
      bytes: file.bytes,
      hash: file.hash,
      managed: file.managed,
    })),
  };
  writeJson(p.manifest, manifest);
  return {
    enabled: true,
    folder: rel(root, p.dir),
    targets: entries.map((entry) => entry.target),
    files: entries.map((entry) => entry.file),
    sources: sourceRows.map((row) => row.path),
    warnings,
  };
}

export function datasetDigest(root, config) {
  const p = agentPaths(root, config);
  const files = [];
  if (exists(p.contexts)) files.push(p.contexts);
  const collect = (dir) => {
    if (!exists(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  collect(p.contextsDir);
  try {
    for (const mapping of readMappings(root, config)) files.push(mapping.source);
  } catch {
    /* doctor reports invalid mappings */
  }
  return sha256(
    files
      .sort()
      .map((file) => {
        try {
          return `${rel(root, file)}:${sha256File(file)}`;
        } catch {
          return `${rel(root, file)}:missing`;
        }
      })
      .join("\n"),
  );
}

/**
 * Build the context pack for a development prompt. The orchestrator hands this
 * to subagents so they read the orchid-sdd development context instead of the
 * user-owned AGENTS.md that may still exist in a prompt worktree.
 */
export function buildPromptContextPack(root, config, scopes = []) {
  if (!config.agents || config.agents.enabled === false) return null;
  let mappings;
  try {
    mappings = readMappings(root, config);
  } catch {
    return null;
  }
  const normalized = (scopes || []).map((scope) =>
    String(scope).replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, ""),
  );
  const selected = mappings.filter((mapping) => {
    if (mapping.target === ".") return true;
    return normalized.some(
      (scope) =>
        scope === mapping.target ||
        scope.startsWith(`${mapping.target}/`) ||
        mapping.target.startsWith(`${scope.replace(/\/+$/, "")}/`),
    );
  });
  if (!selected.length) return null;
  const sections = selected.map((mapping) => {
    const label = mapping.target === "." ? "root" : mapping.target;
    return `## Context: ${label}\n\n<!-- source: ${rel(root, mapping.source)} -->\n\n${readText(mapping.source).trim()}\n`;
  });
  return {
    targets: selected.map((mapping) => mapping.target),
    files: selected.map((mapping) => rel(root, mapping.source)),
    content: `# orchid-sdd development context pack

> This is the active orchid-sdd development context. Do not follow the
> project \`AGENTS.md\` that may be present in a prompt worktree; it is
> user-owned and preserved for after the iteration. The rules in this pack win.

${sections.join("\n")}`,
  };
}

export function projectDigest(root, config) {
  return sha256(
    collectProjectAgentFiles(root, config)
      .map((file) => `${file.path}:${file.hash}`)
      .join("\n"),
  );
}

export function syncProjectContext(root, config, { state = null } = {}) {
  if (state?.agentContext?.active) {
    throw new OrchidError(
      "the development agent context is active; run `orchid-sdd agents off` before editing or syncing project AGENTS.md files",
    );
  }
  const p = agentPaths(root, config);
  ensureDir(p.dir);
  const rootFile = path.join(root, "AGENTS.md");
  const managed = upsertManaged(
    rootFile,
    agentsBlock(config.knowledge_folder, config.constitution_folder, {
      enabled: !config.agents || config.agents.enabled !== false,
      agentsFolder: config.agents.folder,
    }),
  );
  const files = collectProjectAgentFiles(root, config);
  const manifest = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    managedBlock: managed,
    files: files.map((file) => ({
      path: file.path,
      lines: file.lines,
      bytes: file.bytes,
      hash: file.hash,
      managed: file.managed,
      domain: path.dirname(file.path) === "." ? "root" : path.dirname(file.path),
    })),
  };
  writeJson(p.projectContext, manifest);
  return { managed, files: files.map((file) => file.path), hash: projectDigest(root, config) };
}

/* ------------------------------------------------------------------------- */
/* agent-contexts integration                                                */
/* ------------------------------------------------------------------------- */

function resolveContextsBin() {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("agent-contexts/package.json");
    const bin = path.join(path.dirname(pkg), "bin", "contexts.js");
    return exists(bin) ? bin : null;
  } catch {
    return null;
  }
}

function readMappings(root, config) {
  const p = agentPaths(root, config);
  if (!exists(p.contexts)) return [];
  let data;
  try {
    data = parseYaml(readText(p.contexts));
  } catch (error) {
    throw new OrchidError(`invalid ${rel(root, p.contexts)}: ${error.message}`);
  }
  const mappings = data && data.mappings && typeof data.mappings === "object" ? data.mappings : {};
  const rows = [];
  for (const [target, value] of Object.entries(mappings)) {
    if (!value || typeof value !== "object" || !value.context_source) {
      throw new OrchidError(
        `${rel(root, p.contexts)}: mapping "${target}" must have a context_source`,
      );
    }
    const normalized = target === "." ? "." : String(target).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (normalized !== "." && (path.isAbsolute(normalized) || normalized.split("/").includes(".."))) {
      throw new OrchidError(`${rel(root, p.contexts)}: mapping target escapes the project: ${target}`);
    }
    const source = path.resolve(p.dir, String(value.context_source));
    if (!source.startsWith(`${p.dir}${path.sep}`)) {
      throw new OrchidError(
        `${rel(root, p.contexts)}: context_source escapes the agent context folder: ${value.context_source}`,
      );
    }
    if (!exists(source)) {
      throw new OrchidError(
        `${rel(root, p.contexts)}: context_source does not exist: ${value.context_source}`,
      );
    }
    rows.push({ target: normalized, source, description: value.description || "" });
  }
  return rows;
}

function activeMappings(root, config) {
  return readMappings(root, config).filter((mapping) => {
    if (mapping.target === ".") return true;
    const dir = path.join(root, mapping.target);
    return exists(dir) && fs.statSync(dir).isDirectory();
  });
}

function runContexts(root, args) {
  const bin = resolveContextsBin();
  if (!bin) {
    throw new OrchidError(
      "agent-contexts is not installed; run `npm install orchid-sdd` or use `agents.mode: native`",
    );
  }
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    timeout: 120000,
  });
  if (result.error) {
    throw new OrchidError(`agent-contexts failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("; ");
    throw new OrchidError(`agent-contexts ${args[0]} failed (exit ${result.status}): ${detail}`);
  }
  const lines = String(result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith("{") || lines[i].startsWith("[")) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        break;
      }
    }
  }
  return null;
}

/**
 * `agent-contexts` replaces a symlink that points outside its cache without a
 * backup. Detect that case and prefer the native mode, which preserves the link.
 */
function foreignLink(root, config) {
  let mappings;
  try {
    mappings = activeMappings(root, config);
  } catch {
    return null;
  }
  const linkNames = config.agents.link_names || ["AGENTS.md"];
  const cache = realOrSelf(path.join(root, ".contexts"));
  const source = realOrSelf(agentPaths(root, config).dir);
  for (const mapping of mappings) {
    for (const linkName of linkNames) {
      const linkPath = linkTargetPath(root, mapping.target, linkName);
      try {
        if (!fs.lstatSync(linkPath).isSymbolicLink()) continue;
        const real = fs.realpathSync(linkPath);
        if (!real.startsWith(`${cache}${path.sep}`) && !real.startsWith(`${source}${path.sep}`)) {
          return rel(root, linkPath);
        }
      } catch {
        /* missing or broken links are handled by the linker */
      }
    }
  }
  return null;
}

function lockIsOurs(root, config) {
  const lock = path.join(root, "contexts.lock");
  if (!exists(lock)) return false;
  try {
    const data = readJson(lock);
    const dir = agentPaths(root, config).dir;
    return Object.values(data.contexts || {}).some((entry) => {
      const source = String(entry?.source || "");
      return source === dir || source.startsWith(`${dir}${path.sep}`);
    });
  } catch {
    return false;
  }
}

function foreignLock(root, config) {
  const lock = path.join(root, "contexts.lock");
  if (!exists(lock)) return false;
  const p = agentPaths(root, config);
  if (exists(p.libraryMarker)) {
    try {
      const marker = readJson(p.libraryMarker);
      return marker.lockHash !== sha256File(lock);
    } catch {
      return true;
    }
  }
  return !lockIsOurs(root, config);
}

function chooseMode(root, config, state) {
  const override = String(process.env.ORCHID_AGENTS_MODE || "").toLowerCase();
  const configured = String((config.agents && config.agents.mode) || "auto").toLowerCase();
  const mode = ["auto", "library", "native"].includes(override) ? override : configured;
  if (mode === "native") return { mode: "native", reason: "configured" };
  const bin = resolveContextsBin();
  const active = state.agentContext && state.agentContext.active;
  const symlink = foreignLink(root, config);
  if (mode === "library") {
    if (!bin) {
      throw new OrchidError(
        "agents.mode=library requires the agent-contexts package; install orchid-sdd dependencies or use agents.mode=native",
      );
    }
    if (foreignLock(root, config) && !active) {
      throw new OrchidError(
        "contexts.lock is not managed by orchid-sdd; use agents.mode=native or move the existing lock aside",
      );
    }
    if (symlink) {
      throw new OrchidError(
        `${symlink} is a user-managed symlink; use agents.mode=native so orchid-sdd can preserve and restore it`,
      );
    }
    return { mode: "library", reason: "configured" };
  }
  if (bin && !symlink && (active || !foreignLock(root, config))) {
    return { mode: "library", reason: bin ? "agent-contexts available" : "native fallback" };
  }
  return {
    mode: "native",
    reason: symlink
      ? `user-managed symlink preserved: ${symlink}`
      : !bin
        ? "agent-contexts is not installed"
        : "foreign contexts.lock",
  };
}

function linkTargetPath(root, target, linkName) {
  return target === "."
    ? path.join(root, linkName)
    : path.join(root, target, linkName);
}

function backupRoot(root, config) {
  return path.join(agentPaths(root, config).runtime, "backups", nowIso().replace(/[:.]/g, "-"));
}

function copyFile(source, target) {
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function realOrSelf(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

function isOwnedLink(root, config, linkPath, source) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const real = fs.realpathSync(linkPath);
      const cache = realOrSelf(path.join(root, ".contexts"));
      const agentDir = realOrSelf(agentPaths(root, config).dir);
      return real.startsWith(`${cache}${path.sep}`) || real.startsWith(`${agentDir}${path.sep}`);
    }
    if (stat.isFile()) {
      if (source && exists(source) && sha256File(linkPath) === sha256File(source)) return true;
      return readText(linkPath).includes(DEV_CONTEXT_MARKER);
    }
  } catch {
    return false;
  }
  return false;
}

function removeIfExists(file) {
  if (exists(file)) fs.rmSync(file, { force: true });
}

function restoreNativeEntry(root, config, entry, conflictDir, mappings) {
  const linkPath = path.join(root, entry.linkPath);
  const backup = entry.backup ? path.join(root, entry.backup) : null;
  const backupAvailable = Boolean(backup && exists(backup));
  const alreadyRestored = Boolean(backup) && !backupAvailable;
  const source = (mappings || []).find((mapping) => mapping.target === entry.target);
  if (exists(linkPath)) {
    if (alreadyRestored) {
      if (isOwnedLink(root, config, linkPath, source ? source.source : null)) {
        removeIfExists(linkPath);
      }
      return;
    }
    const owned = isOwnedLink(root, config, linkPath, source ? source.source : null);
    if (owned) {
      removeIfExists(linkPath);
    } else {
      ensureDir(conflictDir);
      const target = path.join(conflictDir, entry.linkPath);
      ensureDir(path.dirname(target));
      fs.renameSync(linkPath, target);
    }
  }
  if (backupAvailable && exists(path.dirname(linkPath))) {
    fs.renameSync(backup, linkPath);
  }
}

function nativeActivate(root, config, state) {
  const mappings = activeMappings(root, config);
  const linkNames = config.agents.link_names || ["AGENTS.md"];
  const runtimeFile = agentPaths(root, config).runtimeFile;
  const previous = (() => {
    if (!exists(runtimeFile)) return null;
    try {
      return readJson(runtimeFile);
    } catch {
      return null;
    }
  })();
  const previousEntries = new Map(
    (previous?.entries || []).map((entry) => [`${entry.target}\0${entry.linkName}`, entry]),
  );
  const backupDir = previous?.backupDir
    ? path.join(root, previous.backupDir)
    : backupRoot(root, config);
  const currentKeys = new Set();
  for (const mapping of mappings) {
    for (const linkName of linkNames) currentKeys.add(`${mapping.target}\0${linkName}`);
  }
  const conflictDir = path.join(
    agentPaths(root, config).runtime,
    "conflicts",
    nowIso().replace(/[:.]/g, "-"),
  );
  for (const [key, entry] of previousEntries) {
    if (currentKeys.has(key)) continue;
    restoreNativeEntry(root, config, entry, conflictDir, mappings);
  }
  const activation = {
    schemaVersion: 1,
    mode: "native",
    createdAt: previous?.createdAt || nowIso(),
    backupDir: rel(root, backupDir),
    iteration: state.activeIteration || previous?.iteration || null,
    linkNames,
    targets: mappings.map((mapping) => mapping.target),
    entries: [],
  };
  try {
    for (const mapping of mappings) {
      for (const linkName of linkNames) {
        const linkPath = linkTargetPath(root, mapping.target, linkName);
        const key = `${mapping.target}\0${linkName}`;
        const previousEntry = previousEntries.get(key);
        let backup = previousEntry?.backup || null;
        if (backup && !exists(path.join(root, backup))) backup = null;
        const linkExists = exists(linkPath);
        if (linkExists && fs.statSync(linkPath).isDirectory()) {
          throw new OrchidError(`cannot switch agent context: ${rel(root, linkPath)} is a directory`);
        }
        const owned = linkExists
          ? isOwnedLink(root, config, linkPath, mapping.source)
          : false;
        const plannedBackup =
          linkExists && !owned && !backup
            ? path.join(backupDir, mapping.target === "." ? "." : mapping.target, linkName)
            : null;
        if (plannedBackup) backup = rel(root, plannedBackup);
        activation.entries.push({
          target: mapping.target,
          linkName,
          linkPath: rel(root, linkPath),
          backup,
        });
        // Persist the journal before moving or creating anything so a crash can
        // always restore the original project file.
        writeJson(runtimeFile, activation);
        if (linkExists) {
          if (owned) {
            removeIfExists(linkPath);
          } else if (plannedBackup) {
            ensureDir(path.dirname(plannedBackup));
            fs.renameSync(linkPath, plannedBackup);
          } else {
            // Keep the original restore point; preserve the unexpected edit separately.
            const conflict = path.join(
              agentPaths(root, config).runtime,
              "conflicts",
              nowIso().replace(/[:.]/g, "-"),
              mapping.target === "." ? "." : mapping.target,
              linkName,
            );
            ensureDir(path.dirname(conflict));
            fs.renameSync(linkPath, conflict);
          }
        }
        copyFile(mapping.source, linkPath);
      }
    }
  } catch (error) {
    nativeDeactivate(root, config, state, { silent: true });
    throw error;
  }
  writeJson(runtimeFile, activation);
  return activation;
}

function nativeDeactivate(root, config, state, { silent = false } = {}) {
  const p = agentPaths(root, config);
  if (!exists(p.runtimeFile)) return { restored: 0, conflicts: [] };
  let activation;
  try {
    activation = readJson(p.runtimeFile);
  } catch {
    return { restored: 0, conflicts: [] };
  }
  const conflicts = [];
  const conflictDir = path.join(p.runtime, "conflicts", nowIso().replace(/[:.]/g, "-"));
  let mappings = [];
  try {
    mappings = readMappings(root, config);
  } catch {
    mappings = [];
  }
  for (const entry of activation.entries || []) {
    const linkPath = path.join(root, entry.linkPath);
    const source = mappings.find((mapping) => mapping.target === entry.target);
    const before = exists(linkPath) && !isOwnedLink(root, config, linkPath, source ? source.source : null);
    restoreNativeEntry(root, config, entry, conflictDir, mappings);
    if (before && exists(path.join(conflictDir, entry.linkPath))) {
      conflicts.push({
        path: entry.linkPath,
        savedAs: rel(root, path.join(conflictDir, entry.linkPath)),
      });
    }
  }
  removeIfExists(p.runtimeFile);
  if (!silent && conflicts.length) {
    process.stdout.write(
      `  [warn] changed agent context files were preserved under ${rel(root, conflictDir)}\n`,
    );
  }
  return { restored: (activation.entries || []).filter((entry) => entry.backup).length, conflicts };
}

function restoreLibraryBackups(root, config, targets) {
  const linkNames = config.agents.link_names || ["AGENTS.md"];
  const restored = [];
  for (const target of targets) {
    for (const linkName of linkNames) {
      const linkPath = linkTargetPath(root, target, linkName);
      const bak = `${linkPath}.bak`;
      if (!exists(bak)) continue;
      if (exists(linkPath)) {
        try {
          const stat = fs.lstatSync(linkPath);
          if (stat.isSymbolicLink()) removeIfExists(linkPath);
          else fs.renameSync(linkPath, `${linkPath}.orchid-conflict`);
        } catch {
          /* keep the file; the next doctor run reports it */
        }
      }
      fs.renameSync(bak, linkPath);
      restored.push(rel(root, linkPath));
    }
  }
  return restored;
}

function libraryActivate(root, config, state) {
  const symlink = foreignLink(root, config);
  if (symlink) {
    throw new OrchidError(
      `${symlink} is a user-managed symlink; run \`orchid-sdd agents off\`, set agents.mode=native, then \`orchid-sdd agents on\``,
    );
  }
  const mappings = activeMappings(root, config);
  const linkNames = config.agents.link_names || ["AGENTS.md"];
  const args = [
    "add",
    config.agents.folder,
    "--target",
    "*",
    "--link-as",
    ...linkNames,
    ...(process.env.ORCHID_AGENTS_COPY === "1" ? ["--copy"] : []),
    "--force",
    "-y",
    "--json",
  ];
  try {
    runContexts(root, args);
  } catch (error) {
    const p = agentPaths(root, config);
    try {
      if (exists(path.join(root, "contexts.lock"))) runContexts(root, ["reset", "-y", "--json"]);
      else restoreLibraryBackups(root, config, mappings.map((mapping) => mapping.target));
    } catch {
      /* best-effort rollback; doctor reports leftovers */
    }
    removeIfExists(p.libraryMarker);
    throw error;
  }
  const p = agentPaths(root, config);
  ensureDir(p.runtime);
  ensureLocalExclude(root);
  const lock = path.join(root, "contexts.lock");
  writeJson(p.libraryMarker, {
    schemaVersion: 1,
    mode: "library",
    createdAt: nowIso(),
    iteration: state.activeIteration || null,
    targets: mappings.map((mapping) => mapping.target),
    linkNames,
    lockHash: exists(lock) ? sha256File(lock) : null,
  });
  return {
    schemaVersion: 1,
    mode: "library",
    createdAt: nowIso(),
    iteration: state.activeIteration || null,
    linkNames,
    targets: mappings.map((mapping) => mapping.target),
    entries: [],
  };
}

function cleanupGeneratedBackupCopies(root, config, targets) {
  const linkNames = config.agents.link_names || ["AGENTS.md"];
  for (const target of targets) {
    const dir = target === "." ? root : path.join(root, target);
    if (!exists(dir) || !fs.statSync(dir).isDirectory()) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of linkNames) {
      for (const entry of entries) {
        if (!entry.startsWith(`${name}.bak.`)) continue;
        const file = path.join(dir, entry);
        try {
          if (readText(file).includes(DEV_CONTEXT_MARKER)) fs.rmSync(file, { force: true });
        } catch {
          /* keep unreadable leftovers for doctor */
        }
      }
    }
  }
}

function libraryDeactivate(root, config, state) {
  const p = agentPaths(root, config);
  let targets = (state.agentContext && state.agentContext.targets) || [];
  if (!targets.length) {
    try {
      targets = activeMappings(root, config).map((mapping) => mapping.target);
    } catch {
      targets = ["."];
    }
  }
  let resetError = null;
  if (exists(path.join(root, "contexts.lock"))) {
    try {
      runContexts(root, ["reset", "-y", "--json"]);
    } catch (error) {
      resetError = error;
    }
  } else {
    restoreLibraryBackups(root, config, targets);
    if (exists(path.join(root, ".contexts"))) {
      fs.rmSync(path.join(root, ".contexts"), { recursive: true, force: true });
    }
  }
  if (resetError) {
    const restored = restoreLibraryBackups(root, config, targets);
    removeIfExists(path.join(root, "contexts.lock"));
    removeIfExists(p.libraryMarker);
    if (!restored.length) throw resetError;
  }
  removeIfExists(p.libraryMarker);
  cleanupGeneratedBackupCopies(root, config, targets);
  removeLocalExclude(root);
  return { restored: targets.length };
}

/* ------------------------------------------------------------------------- */
/* Public lifecycle API                                                      */
/* ------------------------------------------------------------------------- */

export function activateAgentContexts(root, config, state, { locked = false, reason = "iteration start" } = {}) {
  if (!config.agents || config.agents.enabled === false) {
    return { active: false, skipped: "agents.enabled is false" };
  }
  const run = () => {
    const p = agentPaths(root, config);
    if (!exists(p.contexts)) {
      initAgentContexts(root, config, {
        preserveProjectSources: Boolean(
          state.agentContext?.active || exists(p.libraryMarker) || exists(p.runtimeFile),
        ),
      });
    }
    if (state.agentContext?.active) {
      // Re-link to refresh changes made while the switch was active.
      if (state.agentContext.mode === "library") libraryActivate(root, config, state);
      else nativeActivate(root, config, state);
      return {
        active: true,
        mode: state.agentContext.mode,
        targets: state.agentContext.targets,
        refreshed: true,
      };
    }
    const mode = chooseMode(root, config, state);
    const activation =
      mode.mode === "library" ? libraryActivate(root, config, state) : nativeActivate(root, config, state);
    const mappings = activeMappings(root, config);
    state.agentContext = {
      ...(state.agentContext || {}),
      active: true,
      mode: mode.mode,
      linkNames: config.agents.link_names || ["AGENTS.md"],
      targets: mappings.map((mapping) => mapping.target),
      activatedAt: nowIso(),
      iteration: state.activeIteration || null,
      datasetHash: datasetDigest(root, config),
      runtime: rel(root, agentPaths(root, config).runtimeFile),
    };
    appendEvent(
      root,
      config,
      state,
      {
        type: "agents.activated",
        subject: "agents:development-context",
        payload: {
          mode: mode.mode,
          targets: state.agentContext.targets,
          linkNames: state.agentContext.linkNames,
          iteration: state.activeIteration || null,
          reason,
          activation: rel(root, agentPaths(root, config).libraryMarker),
        },
      },
      { locked },
    );
    return {
      active: true,
      mode: mode.mode,
      reason: mode.reason,
      targets: state.agentContext.targets,
    };
  };
  if (locked) return run();
  return withStateLock(root, run, { purpose: "agents activate", ttlMs: 120000 });
}

export function deactivateAgentContexts(root, config, state, { locked = false, reason = "manual" } = {}) {
  const run = () => {
    const active = Boolean(state.agentContext && state.agentContext.active);
    const p = agentPaths(root, config);
    const lock = path.join(root, "contexts.lock");
    if (!active && !exists(p.runtimeFile) && !exists(p.libraryMarker)) {
      if (exists(lock) && !lockIsOurs(root, config)) {
        return {
          active: false,
          already: true,
          foreignLock: true,
          message:
            "contexts.lock exists but is not managed by orchid-sdd; leave it untouched",
        };
      }
      if (!exists(lock)) return { active: false, already: true };
    }
    const mode =
      state.agentContext?.mode ||
      (exists(p.libraryMarker) || (exists(path.join(root, "contexts.lock")) && lockIsOurs(root, config))
        ? "library"
        : exists(p.runtimeFile)
          ? "native"
          : null);
    if (mode === "library") libraryDeactivate(root, config, state);
    else if (mode === "native") nativeDeactivate(root, config, state);
    else return { active: false, already: true, foreignLock: exists(path.join(root, "contexts.lock")) };
    state.agentContext = {
      ...(state.agentContext || {}),
      active: false,
      mode: null,
      linkNames: [],
      targets: [],
      activatedAt: null,
      runtime: null,
    };
    appendEvent(
      root,
      config,
      state,
      {
        type: "agents.deactivated",
        subject: "agents:development-context",
        payload: {
          mode,
          iteration: state.activeIteration || null,
          reason,
        },
      },
      { locked },
    );
    return { active: false, mode, reason };
  };
  if (locked) return run();
  return withStateLock(root, run, { purpose: "agents deactivate", ttlMs: 120000 });
}

export function syncAgentContexts(root, config, state, { locked = false, json = false, note = null } = {}) {
  if (!config.agents || config.agents.enabled === false) {
    return {
      enabled: false,
      targets: [],
      files: [],
      warnings: [],
      datasetHash: null,
      project: null,
      active: false,
      mode: null,
    };
  }
  const run = () => {
    const p = agentPaths(root, config);
    const init = initAgentContexts(root, config, {
      preserveProjectSources: Boolean(
        state.agentContext?.active || exists(p.libraryMarker) || exists(p.runtimeFile),
      ),
    });
    const digest = datasetDigest(root, config);
    const iteration = state.activeIteration || state.lastIteration || null;
    const at = nowIso();
    state.agentContext = {
      ...(state.agentContext || {}),
      datasetHash: digest,
      lastSync: { at, iteration, datasetHash: digest, note: note || null },
    };
    if (
      state.agentContext.lastMaintenance &&
      state.agentContext.lastMaintenance.iteration === iteration
    ) {
      state.agentContext.lastMaintenance = {
        ...state.agentContext.lastMaintenance,
        datasetHash: digest,
      };
    }
    if (state.agentContext.active) {
      const mode = state.agentContext.mode;
      if (mode === "library") libraryActivate(root, config, state);
      else nativeActivate(root, config, state);
    }
    appendEvent(
      root,
      config,
      state,
      {
        type: "agents.synced",
        subject: "agents:development-context",
        payload: {
          iteration,
          datasetHash: digest,
          projectHash: null,
          maintained: false,
          note: note || null,
        },
      },
      { locked },
    );
    writeState(root, state);
    return {
      targets: init.targets,
      files: init.files,
      warnings: init.warnings || [],
      datasetHash: digest,
      project: null,
      active: Boolean(state.agentContext.active),
      mode: state.agentContext.mode,
    };
  };
  if (locked) return run();
  return withStateLock(root, run, { purpose: "agents sync", ttlMs: 120000 });
}

export function agentContextStatus(root, config, state) {
  const p = agentPaths(root, config);
  const init = exists(p.contexts) ? null : { missing: true };
  let targets = [];
  let links = [];
  let error = null;
  try {
    const mappings = activeMappings(root, config);
    targets = mappings.map((mapping) => mapping.target);
    if (state.agentContext?.active) {
      const linkNames = state.agentContext.linkNames || config.agents.link_names || ["AGENTS.md"];
      for (const target of state.agentContext.targets || []) {
        for (const name of linkNames) {
          const file = target === "." ? path.join(root, name) : path.join(root, target, name);
          let healthy = false;
          try {
            healthy = exists(file) && readText(file).includes(DEV_CONTEXT_MARKER);
          } catch {
            healthy = false;
          }
          links.push({ target, name, path: rel(root, file), healthy });
        }
      }
    }
  } catch (caught) {
    targets = [];
    error = caught.message;
  }
  let library = null;
  if (exists(p.libraryMarker)) {
    try {
      library = readJson(p.libraryMarker);
    } catch {
      library = { unreadable: true };
    }
  }
  let projectHash = null;
  if (!state.agentContext?.active && exists(p.contexts)) {
    try {
      projectHash = projectDigest(root, config);
    } catch {
      projectHash = null;
    }
  }
  return {
    enabled: Boolean(config.agents && config.agents.enabled !== false),
    folder: rel(root, p.dir),
    initialized: exists(p.contexts),
    datasetHash: exists(p.contexts) ? datasetDigest(root, config) : null,
    projectHash,
    projectDrift: Boolean(
      projectHash &&
        state.agentContext?.lastMaintenance?.projectHash &&
        state.agentContext.lastMaintenance.projectHash !== projectHash,
    ),
    targets,
    links,
    active: Boolean(state.agentContext && state.agentContext.active),
    mode: state.agentContext?.mode || null,
    linkNames: state.agentContext?.linkNames || config.agents.link_names || [],
    activeTargets: state.agentContext?.targets || [],
    activatedAt: state.agentContext?.activatedAt || null,
    lastSync: state.agentContext?.lastSync || null,
    lastMaintenance: state.agentContext?.lastMaintenance || null,
    library,
    missing: init,
    error,
    lock: exists(path.join(root, "contexts.lock")),
    lockOurs: lockIsOurs(root, config),
    foreignLock:
      exists(path.join(root, "contexts.lock")) &&
      !exists(p.libraryMarker) &&
      !lockIsOurs(root, config),
    contextsCache: exists(path.join(root, ".contexts")),
  };
}

export function assertAgentMaintenance(root, config, state, { skip = false } = {}) {
  if (skip || !config.agents || config.agents.enabled === false) {
    return { required: false, problems: [], warnings: [] };
  }
  const level = config.agents.maintenance || "warn";
  if (level === "off") return { required: false, problems: [], warnings: [] };
  const problems = [];
  const warnings = [];
  if (state.agentContext?.active) {
    const message =
      "the development agent context is still active; run `orchid-sdd agents off`, maintain the project AGENTS.md files, then `orchid-sdd agents sync` before closure";
    if (level === "required") problems.push(message);
    else warnings.push(message);
  }
  const maintenance = state.agentContext?.lastMaintenance;
  const lastSync = state.agentContext?.lastSync;
  if (!maintenance || !lastSync) {
    const message =
      "no agent-context maintenance recorded for this iteration; run `orchid-sdd agents off`, update the project AGENTS.md and `.orchid/agents` contexts, then run `agents project sync` and `agents sync`";
    if (level === "required") problems.push(message);
    else warnings.push(message);
  } else {
    if (state.activeIteration && maintenance.iteration !== state.activeIteration) {
      const message = `agent-context maintenance belongs to iteration "${maintenance.iteration || "none"}"; sync again for "${state.activeIteration}"`;
      if (level === "required") problems.push(message);
      else warnings.push(message);
    }
    if (state.activeIteration && lastSync.iteration !== state.activeIteration) {
      const message = `development context sync belongs to iteration "${lastSync.iteration || "none"}"; run \`orchid-sdd agents sync\` again`;
      if (level === "required") problems.push(message);
      else warnings.push(message);
    }
    let digest = null;
    try {
      digest = datasetDigest(root, config);
    } catch {
      digest = null;
    }
    if (digest && lastSync.datasetHash !== digest) {
      const message =
        "the development agent context changed after the last sync; run `orchid-sdd agents sync` again";
      if (level === "required") problems.push(message);
      else warnings.push(message);
    }
    let projectHash = null;
    try {
      projectHash = projectDigest(root, config);
    } catch {
      projectHash = null;
    }
    if (!state.agentContext.active && projectHash && maintenance.projectHash !== projectHash) {
      const message =
        "the project AGENTS.md files changed after the last project sync; run `orchid-sdd agents project sync` again";
      if (level === "required") problems.push(message);
      else warnings.push(message);
    }
  }
  return { required: level === "required", level, problems, warnings };
}

export function isManagedAgentPath(root, config, state, relativePath) {
  const value = String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (value === "contexts.lock" || value === ".contexts" || value.startsWith(".contexts/")) {
    return true;
  }
  if (value === ".orchid/agents" || value.startsWith(".orchid/agents/")) return true;
  const linkNames = (config.agents && config.agents.link_names) || ["AGENTS.md"];
  for (const name of linkNames) {
    if (value.includes(`${name}.bak`)) return true;
  }
  if (state?.agentContext?.active) {
    for (const target of state.agentContext.targets || []) {
      for (const name of state.agentContext.linkNames || linkNames) {
        const expected = target === "." ? name : `${target}/${name}`;
        if (value === expected) return true;
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------------------- */
/* CLI                                                                       */
/* ------------------------------------------------------------------------- */

function printStatus(summary) {
  process.stdout.write(
    `Agent contexts: ${summary.active ? `active (${summary.mode})` : "off"} · ${summary.targets.length} target(s)\n`,
  );
  process.stdout.write(`  folder: ${summary.folder}${summary.initialized ? "" : " (not initialized)"}\n`);
  if (summary.active) {
    process.stdout.write(`  targets: ${summary.activeTargets.join(", ") || "—"}\n`);
    process.stdout.write(`  link names: ${summary.linkNames.join(", ") || "—"}\n`);
  }
  if (summary.lastSync) {
    process.stdout.write(`  last sync: ${summary.lastSync.at} (${summary.lastSync.iteration || "—"})\n`);
  }
  if (summary.lastMaintenance) {
    process.stdout.write(
      `  project maintenance: ${summary.lastMaintenance.at} (${summary.lastMaintenance.iteration || "—"})\n`,
    );
  }
  if (summary.lock) {
    process.stdout.write(
      `  lock: contexts.lock present${summary.foreignLock ? " (foreign; left untouched)" : ""}\n`,
    );
  }
  if (summary.error) process.stdout.write(`  [error] ${summary.error}\n`);
  const broken = (summary.links || []).filter((link) => !link.healthy);
  if (broken.length) {
    process.stdout.write(
      `  [warn] broken link(s): ${broken.map((link) => link.path).join(", ")}; run \`agents on\`\n`,
    );
  }
  if (summary.missing) process.stdout.write("  [warn] run `orchid-sdd agents init`\n");
}

function projectAction(root, config, state, args) {
  const sub = String(args.sub || "list").toLowerCase();
  if (state.agentContext?.active) {
    throw new OrchidError(
      "the development agent context is active; run `orchid-sdd agents off` before inspecting or editing project AGENTS.md files",
    );
  }
  if (sub === "list") {
    const files = collectProjectAgentFiles(root, config);
    if (args.json) {
      process.stdout.write(`${formatJson(files.map(({ absolute, ...rest }) => rest))}\n`);
      return 0;
    }
    if (!files.length) {
      process.stdout.write("No project AGENTS.md files found.\n");
      return 0;
    }
    for (const file of files) {
      process.stdout.write(
        `${file.path}  ${file.lines} line(s)  ${file.managed ? "managed" : "user-only"}\n`,
      );
    }
    return 0;
  }
  if (sub === "sync") {
    const run = () => {
      const result = syncProjectContext(root, config, { state });
      if (!state.agentContext?.active) {
        const iteration = state.activeIteration || state.lastIteration || null;
        state.agentContext = {
          ...(state.agentContext || {}),
          lastMaintenance: {
            at: nowIso(),
            iteration,
            datasetHash: datasetDigest(root, config),
            projectHash: result.hash,
          },
        };
      }
      appendEvent(root, config, state, {
        type: "agents.project_synced",
        subject: "agents:project-context",
        payload: {
          files: result.files,
          hash: result.hash,
          projectHash: result.hash,
          managed: result.managed,
          iteration: state.activeIteration || state.lastIteration || null,
          datasetHash: state.agentContext?.datasetHash || null,
        },
      }, { locked: true });
      writeState(root, state);
      return result;
    };
    const result = args.__locked
      ? run()
      : withStateLock(root, run, { purpose: "agents project sync", ttlMs: 120000 });
    if (args.json) {
      process.stdout.write(`${formatJson(result)}\n`);
      return 0;
    }
    process.stdout.write(
      `Project agent context: ${result.files.length} file(s); root block ${result.managed}\n`,
    );
    for (const file of result.files) process.stdout.write(`  ${file}\n`);
    return 0;
  }
  if (sub === "add") {
    const dir = String(args.dir || args.target || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!dir || dir === "." || path.isAbsolute(dir) || dir.split("/").includes("..")) {
      throw new OrchidError("agents project add requires a relative directory inside the project");
    }
    const absolute = path.join(root, dir);
    ensureDir(absolute);
    const file = path.join(absolute, "AGENTS.md");
    if (exists(file)) {
      throw new OrchidError(`${rel(root, file)} already exists; orchid-sdd never overwrites it`);
    }
    const title = String(args.title || dir).replace(/[\r\n]+/g, " ").trim() || dir;
    fs.writeFileSync(
      file,
      `# ${title}\n\n<!-- Project agent context for ${dir}. Keep it focused on this domain. -->\n\n## Purpose\n\nDescribe what this folder owns and why it exists.\n\n## Conventions\n\n- Project conventions that apply only to this folder.\n- Read the root \`AGENTS.md\` for the orchid-sdd memory contract.\n\n## Commands\n\n- How to build, test, and lint this folder.\n\n## Boundaries\n\n- What must not be changed here without an ADR.\n`,
      "utf8",
    );
    process.stdout.write(`Created ${rel(root, file)}\n`);
    return 0;
  }
  throw new OrchidError(`unknown agents project action "${sub}" (use list, sync, or add)`);
}

export function agentsCommand(root, skillRoot, args = {}) {
  const action = String(args.action || "status").toLowerCase();
  const { config } = loadConfig(root);
  const state = readState(root);

  if (action === "status") {
    const summary = agentContextStatus(root, config, state);
    if (args.json) {
      process.stdout.write(`${formatJson(summary)}\n`);
      return 0;
    }
    printStatus(summary);
    return 0;
  }

  if (action === "list") {
    const mappings = readMappings(root, config);
    const rows = mappings.map((mapping) => ({
      target: mapping.target,
      source: rel(root, mapping.source),
      description: mapping.description,
      exists: mapping.target === "." || exists(path.join(root, mapping.target)),
    }));
    if (args.json) {
      process.stdout.write(`${formatJson(rows)}\n`);
      return 0;
    }
    if (!rows.length) {
      process.stdout.write("No agent context mappings; run `orchid-sdd agents init`.\n");
      return 0;
    }
    for (const row of rows) {
      process.stdout.write(
        `${row.exists ? "ok" : "drift"}  ${row.target.padEnd(28)} ${row.source}\n`,
      );
    }
    return 0;
  }

  if (action === "show") {
    const target = args.target === undefined ? "." : String(args.target);
    const mapped = readMappings(root, config).find(
      (mapping) => mapping.target === target || mapping.target === target.replace(/^\.\//, ""),
    );
    if (!mapped) throw new OrchidError(`no development context mapped for "${target}"`);
    const content = readText(mapped.source);
    if (args.json) {
      process.stdout.write(
        `${formatJson({ target: mapped.target, file: rel(root, mapped.source), content })}\n`,
      );
      return 0;
    }
    process.stdout.write(content);
    return 0;
  }

  if (action === "init") {
    const p = agentPaths(root, config);
    const run = () =>
      initAgentContexts(root, config, {
        force: Boolean(args.force),
        preserveProjectSources: Boolean(
          state.agentContext?.active || exists(p.libraryMarker) || exists(p.runtimeFile),
        ),
      });
    const result = args.__locked
      ? run()
      : withStateLock(root, run, { purpose: "agents init", ttlMs: 120000 });
    if (args.json) {
      process.stdout.write(`${formatJson(result)}\n`);
      return 0;
    }
    process.stdout.write(
      `Agent context dataset: ${result.targets.length} target(s) in ${result.folder || config.agents.folder}\n`,
    );
    for (const file of result.files || []) process.stdout.write(`  ${file}\n`);
    for (const warning of result.warnings || []) process.stdout.write(`  [warn] ${warning}\n`);
    return 0;
  }

  if (action === "sync") {
    const result = syncAgentContexts(root, config, state, {
      locked: Boolean(args.__locked),
      json: Boolean(args.json),
      note: args.note,
    });
    if (args.json) {
      process.stdout.write(`${formatJson(result)}\n`);
      return 0;
    }
    if (result.enabled === false) {
      process.stdout.write("Agent contexts are disabled; nothing to sync.\n");
      return 0;
    }
    process.stdout.write(
      `Agent development context synced: ${result.targets.length} target(s)\n`,
    );
    if (result.active) process.stdout.write(`  refreshed active switch (${result.mode})\n`);
    for (const warning of result.warnings || []) process.stdout.write(`  [warn] ${warning}\n`);
    return 0;
  }

  if (action === "on" || action === "activate") {
    const result = activateAgentContexts(root, config, state, {
      locked: Boolean(args.__locked),
      reason: args.reason || "manual activate",
    });
    if (args.json) {
      process.stdout.write(`${formatJson(result)}\n`);
      return 0;
    }
    if (!result.active) {
      process.stdout.write("Agent contexts are disabled; nothing to activate.\n");
      return 0;
    }
    process.stdout.write(
      `Agent development context active (${result.mode}): ${(result.targets || []).join(", ")}\n`,
    );
    process.stdout.write("  Run `orchid-sdd agents off` to restore the project AGENTS.md files.\n");
    return 0;
  }

  if (action === "off" || action === "deactivate") {
    const result = deactivateAgentContexts(root, config, state, {
      locked: Boolean(args.__locked),
      reason: args.reason || "manual deactivate",
    });
    if (args.json) {
      process.stdout.write(`${formatJson(result)}\n`);
      return 0;
    }
    process.stdout.write(
      result.already ? "Agent development context is already off.\n" : "Agent development context off; project AGENTS.md restored.\n",
    );
    if (result.foreignLock) {
      process.stdout.write(
        "  [info] a foreign contexts.lock is present; orchid-sdd left it untouched\n",
      );
    }
    return 0;
  }

  if (action === "project") {
    return projectAction(root, config, state, {
      ...args,
      sub: args.sub || "list",
      __locked: Boolean(args.__locked),
    });
  }

  throw new OrchidError(
    `unknown agents action "${action}" (use init, sync, on, off, status, list, show, or project)`,
  );
}

/** Reconcile the switch after replaying events (resume). */
export function reconcileAgentContext(root, config, state, { locked = false } = {}) {
  if (!config.agents || config.agents.enabled === false) {
    if (state.agentContext?.active) {
      return deactivateAgentContexts(root, config, state, { locked, reason: "resume" });
    }
    return null;
  }
  const shouldBeActive =
    Boolean(state.activeIteration) && (config.agents.switch || "on_start") === "on_start";
  // Re-linking is idempotent and repairs broken symlinks after a cache cleanup
  // or a crashed activation.
  if (shouldBeActive) {
    return activateAgentContexts(root, config, state, { locked, reason: "resume" });
  }
  if (state.agentContext?.active) {
    return deactivateAgentContexts(root, config, state, { locked, reason: "resume" });
  }
  return null;
}
