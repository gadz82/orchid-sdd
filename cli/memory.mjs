import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import { parseFrontMatter } from "./yaml.mjs";
import {
  appendEvent,
  checkProjection,
  loadManifest,
  paths,
  readState,
  writeProjection,
  writeState,
} from "./store.mjs";
import {
  OrchidError,
  exists,
  formatJson,
  isUuid7,
  rel,
  sha256File,
  splitCommas,
  splitSemicolons,
  uuid7,
  walkFiles,
} from "./util.mjs";

export const NODE_TYPES = new Set([
  "Requirement",
  "Scenario",
  "Question",
  "Answer",
  "Decision",
  "ADR",
  "Prompt",
  "Run",
  "Review",
  "Finding",
  "CodeUnit",
  "Message",
  "AuditArchive",
  "Release",
  "Assumption",
  "Test",
]);

function context(root) {
  const loaded = loadConfig(root);
  const state = readState(root);
  return { config: loaded.config, hash: loaded.hash, state };
}

export function newUuid() {
  process.stdout.write(`${uuid7()}\n`);
  return 0;
}

export function record(root, args) {
  const { config, state } = context(root);
  const type = args.type;
  if (!type || !NODE_TYPES.has(type)) {
    throw new OrchidError(`--type must be one of: ${[...NODE_TYPES].join(", ")}`);
  }
  const description = String(args.description || "").trim();
  if (!description) throw new OrchidError("--description is required");
  if (description.length > 160) {
    throw new OrchidError(`--description must be at most 160 characters (got ${description.length})`);
  }
  const topics = splitCommas(args.topics);
  if (topics.length < 3 || topics.length > 7) {
    throw new OrchidError("--topics must contain 3 to 7 comma-separated tags");
  }
  const scope = args.scope === "project" ? "project" : "iteration";
  const iteration = scope === "project" ? null : args.iteration || state.activeIteration;
  if (scope === "iteration" && !iteration) {
    throw new OrchidError("no active iteration; run `orchid-sdd start` first or use --scope project");
  }
  const repo = args.repo ? String(args.repo) : null;
  if (repo) {
    const known = ((config.workspace && config.workspace.repos) || []).some(
      (entry) => entry.id === repo && entry.enabled !== false,
    );
    if (!known) throw new OrchidError(`unknown or disabled workspace repo "${repo}"`);
  }

  let rawId = String(args.id || uuid7()).replace(/^urn:uuid:/, "");
  if (!isUuid7(rawId)) throw new OrchidError(`memory id must be a UUIDv7: ${rawId}`);
  const id = `urn:uuid:${rawId}`;

  const questions = splitSemicolons(args.questions);
  const aliases = Array.isArray(args.alias) ? args.alias : args.alias ? [args.alias] : [];
  const relationArgs = Array.isArray(args.relation) ? args.relation : args.relation ? [args.relation] : [];
  const relations = relationArgs.map((entry) => {
    const at = entry.indexOf(":");
    if (at < 1) throw new OrchidError(`invalid --relation "${entry}" (expected predicate:target)`);
    return { predicate: entry.slice(0, at), target: entry.slice(at + 1) };
  });

  let artifact = args.artifact ? String(args.artifact).replace(/\\/g, "/") : null;
  let hash = null;
  if (artifact) {
    const candidates = path.isAbsolute(artifact)
      ? [artifact]
      : [
          ...(iteration
            ? [path.join(paths(root, config).iterations, iteration, artifact)]
            : []),
          path.join(root, artifact),
        ];
    const found = candidates.find((file) => fs.existsSync(file));
    if (found) hash = sha256File(found);
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const node = {
    "@id": id,
    "@type": `orchid:${type}`,
    description,
    status: args.status || "accepted",
    topics,
    provenance: {
      phase: state.phase,
      persona: args.actor || "orchestrator",
      run: null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    iteration,
    scope,
  };
  if (questions.length) node.answers = questions;
  if (aliases.length) node.aliases = aliases;
  if (relations.length) node.relations = relations;
  if (artifact) node.artifact = artifact;
  if (args.code) node.codeAnchor = String(args.code);
  if (repo) node.repo = repo;
  if (hash) node.hash = hash;

  appendEvent(root, config, state, {
    type: "node.recorded",
    subject: id,
    payload: { node },
    actor: args.actor || "orchestrator",
  });
  writeProjection(root, config, state);
  writeState(root, state);

  if (args.json) {
    process.stdout.write(`${formatJson(node)}\n`);
  } else {
    process.stdout.write(`Recorded ${id} (${type})\n`);
    process.stdout.write(`  ${description}\n`);
    process.stdout.write(
      `  ${scope === "project" ? "scope project" : `iteration ${iteration}`}\n`,
    );
  }
  return 0;
}

export function index(root, args) {
  const { config, state } = context(root);
  if (args.check) {
    const drift = checkProjection(root, config, state);
    if (drift.length) {
      process.stdout.write(`Projection is stale:\n${drift.map((item) => `  - ${item}`).join("\n")}\n`);
      process.stdout.write("Run `orchid-sdd index` to rebuild.\n");
      return 1;
    }
    process.stdout.write("Projection is up to date.\n");
    return 0;
  }
  const { manifest, indexes } = writeProjection(root, config, state);
  if (args.json) {
    process.stdout.write(
      `${formatJson({
        iteration: manifest.iteration ? manifest.iteration["@id"] : null,
        nodes: manifest.nodes.length,
        history: manifest.history.length,
        indexes: Object.keys(indexes),
      })}\n`,
    );
    return 0;
  }
  const label = manifest.iteration ? manifest.iteration.title : "no active iteration";
  process.stdout.write(`Indexed ${manifest.nodes.length} node(s) for ${label}\n`);
  process.stdout.write(`  manifest ${paths(root, config).manifest}\n`);
  process.stdout.write(`  indexes  ${Object.keys(indexes).length} files\n`);
  return 0;
}

export function recall(root, args) {
  const { config } = context(root);
  const manifest = loadManifest(root, config);
  const nodes = [...manifest.nodes];
  for (const entry of manifest.history || []) {
    if (!entry.manifest) continue;
    const file = path.join(paths(root, config).knowledge, entry.manifest);
    if (fs.existsSync(file)) {
      try {
        const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
        nodes.push(...(snapshot.nodes || []));
      } catch {
        /* doctor reports unreadable history */
      }
    }
  }

  const query = String(args.query || "").trim();
  if (!query) throw new OrchidError("recall requires a uuid, topic, question, or path");
  const needle = query.toLowerCase().replace(/^urn:uuid:/, "");
  const matches = [];
  const seen = new Set();
  const add = (node) => {
    if (node && !seen.has(node["@id"])) {
      seen.add(node["@id"]);
      matches.push(node);
    }
  };

  for (const node of nodes) {
    if (args.repo && node.repo !== args.repo) continue;
    const id = node["@id"].replace(/^urn:uuid:/, "").toLowerCase();
    const aliases = (node.aliases || []).map((value) => String(value).toLowerCase());
    const topics = (node.topics || []).map((value) => String(value).toLowerCase());
    const answers = (node.answers || []).map((value) => String(value).toLowerCase());
    const code = String(node.codeAnchor || "").toLowerCase();
    const description = String(node.description || "").toLowerCase();
    if (
      id === needle ||
      aliases.includes(needle) ||
      topics.includes(needle) ||
      answers.some((value) => value.includes(needle)) ||
      (code && (code === needle || code.includes(needle))) ||
      description.includes(needle)
    ) {
      add(node);
    }
    if (matches.length >= 20) break;
  }

  if (!matches.length) {
    process.stdout.write(`No memory found for "${query}".\n`);
    return 0;
  }

  const hops = Math.min(Math.max(Number.parseInt(args.hops || "1", 10) || 1, 1), 2);
  const byId = new Map(nodes.map((node) => [node["@id"], node]));
  const related = [];
  const relatedSeen = new Set(matches.map((node) => node["@id"]));
  let frontier = [...matches];
  for (let hop = 0; hop < hops; hop += 1) {
    const next = [];
    for (const node of frontier) {
      for (const relation of node.relations || []) {
        const target = byId.get(relation.target);
        if (target && !relatedSeen.has(target["@id"])) {
          relatedSeen.add(target["@id"]);
          related.push(target);
          next.push(target);
        }
      }
      for (const other of nodes) {
        for (const relation of other.relations || []) {
          if (relation.target === node["@id"] && !relatedSeen.has(other["@id"])) {
            relatedSeen.add(other["@id"]);
            related.push(other);
            next.push(other);
          }
        }
      }
    }
    frontier = next;
  }

  if (args.json) {
    process.stdout.write(`${formatJson({ query, matches, related })}\n`);
    return 0;
  }

  const render = (node) => {
    const lines = [`## ${node["@id"]} — ${node["@type"] || "memory"}`, "", node.description || ""];
    if (node.artifact) lines.push("", `- artifact: \`${node.artifact}\``);
    if (node.codeAnchor) lines.push(`- code: \`${node.codeAnchor}\``);
    if (node.topics && node.topics.length) lines.push(`- topics: ${node.topics.join(", ")}`);
    if (node.answers && node.answers.length) lines.push(`- answers: ${node.answers.map((q) => `"${q}"`).join("; ")}`);
    for (const relation of node.relations || []) {
      const target = byId.get(relation.target);
      lines.push(`- ${relation.predicate} → ${relation.target}${target ? ` (${target.description})` : ""}`);
    }
    return lines.join("\n");
  };

  process.stdout.write(`# Recall: ${query}\n\n`);
  for (const node of matches) process.stdout.write(`${render(node)}\n\n`);
  if (related.length) {
    process.stdout.write(`## Related (${hops} hop${hops > 1 ? "s" : ""})\n\n`);
    for (const node of related) process.stdout.write(`${render(node)}\n\n`);
  }
  return 0;
}

const CODE_EXTS = [
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java",
  ".kt", ".rb", ".php", ".cs", ".swift", ".scala", ".sql", ".sh", ".bash", ".yaml", ".yml",
];
const EXCLUDES = [
  ".git", "node_modules", ".knowledge", ".orchid", "dist", "build", "target",
  "vendor", "coverage", ".venv", "venv", "__pycache__", ".next",
  ".pytest_cache", ".ruff_cache", ".serena", ".orchid-migration-bck",
];

export function lint(root, args) {
  const { config } = context(root);
  const manifest = loadManifest(root, config);
  const nodes = [...manifest.nodes];
  for (const entry of manifest.history || []) {
    if (!entry.manifest) continue;
    const file = path.join(paths(root, config).knowledge, entry.manifest);
    if (fs.existsSync(file)) {
      try {
        nodes.push(...(JSON.parse(fs.readFileSync(file, "utf8")).nodes || []));
      } catch {
        /* doctor reports unreadable history */
      }
    }
  }

  const errors = [];
  const warnings = [];
  const anchors = new Map();
  const maxComment = Number(config.docblocks.max_behavior_comment_chars) || 500;

  for (const file of walkFiles(root, CODE_EXTS, EXCLUDES)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.includes("ORCHID-MEM")) {
        const re = /ORCHID-MEM:\s*([0-9a-f-]{36})/gi;
        let match;
        while ((match = re.exec(line))) {
          const uuid = match[1].toLowerCase();
          if (!isUuid7(uuid)) errors.push(`${rel(root, file)}:${index + 1}: anchor is not a UUIDv7: ${uuid}`);
          if (!anchors.has(uuid)) anchors.set(uuid, []);
          anchors.get(uuid).push({ file, line: index + 1 });
        }
        if (trimmed.length > 180) {
          warnings.push(`${rel(root, file)}:${index + 1}: anchor line is longer than 180 characters`);
        }
      } else if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("--")) {
        const body = trimmed.replace(/^(\/\/|#|--)\s?/, "");
        if (body.length > maxComment) {
          errors.push(`${rel(root, file)}:${index + 1}: comment is ${body.length} chars (max ${maxComment})`);
        }
      }
    });
  }

  const docblocks = new Map();
  if (exists(paths(root, config).docblocks)) {
    for (const file of walkFiles(paths(root, config).docblocks, [".md"], [])) {
      let data;
      try {
        data = parseFrontMatter(fs.readFileSync(file, "utf8")).data;
      } catch (error) {
        errors.push(`${rel(root, file)}: invalid front matter: ${error.message}`);
        continue;
      }
      if (!data.memory) continue;
      const uuid = String(data.memory).toLowerCase();
      if (!isUuid7(uuid)) errors.push(`${rel(root, file)}: memory is not a UUIDv7: ${uuid}`);
      if (docblocks.has(uuid)) errors.push(`${rel(root, file)}: duplicate docblock memory ${uuid}`);
      docblocks.set(uuid, { file, data });
    }
  }

  const codeUnits = new Set(
    nodes
      .filter((node) => node["@type"] === "orchid:CodeUnit")
      .map((node) => node["@id"].replace(/^urn:uuid:/, "").toLowerCase()),
  );

  for (const [uuid, locations] of anchors) {
    if (locations.length > 1) {
      errors.push(`duplicate anchor ${uuid}: ${locations.map((item) => `${rel(root, item.file)}:${item.line}`).join(", ")}`);
    }
    if (!codeUnits.has(uuid)) {
      errors.push(`anchor ${uuid} has no CodeUnit node; record one with \`orchid-sdd record --type CodeUnit\``);
    }
    if (config.docblocks.require_docblock_for_anchor && !docblocks.has(uuid)) {
      errors.push(`anchor ${uuid} has no docblock at ${config.docblocks_folder}/<uuid>.md`);
    }
  }

  for (const [uuid, item] of docblocks) {
    const code = String(item.data.code || "");
    if (!code) {
      errors.push(`${rel(root, item.file)}: docblock is missing 'code:'`);
      continue;
    }
    const target = code.split("#")[0];
    if (!fs.existsSync(path.join(root, target))) {
      errors.push(`${rel(root, item.file)}: code target does not exist: ${target}`);
    }
    if (!anchors.has(uuid)) {
      errors.push(`${rel(root, item.file)}: no ORCHID-MEM anchor found for ${uuid}`);
    }
    if (!codeUnits.has(uuid)) {
      errors.push(`${rel(root, item.file)}: no CodeUnit node for ${uuid}`);
    }
  }

  for (const uuid of codeUnits) {
    if (!anchors.has(uuid)) warnings.push(`CodeUnit ${uuid} has no anchor in code`);
  }

  const result = { errors, warnings, anchors: anchors.size, docblocks: docblocks.size, nodes: nodes.length };
  if (args.json) {
    process.stdout.write(`${formatJson(result)}\n`);
    return errors.length ? 1 : 0;
  }
  process.stdout.write(`Lint: ${anchors.size} anchor(s), ${docblocks.size} docblock(s), ${nodes.length} node(s)\n`);
  for (const message of errors) process.stdout.write(`  [error] ${message}\n`);
  for (const message of warnings) process.stdout.write(`  [warn]  ${message}\n`);
  process.stdout.write(`\n${errors.length} error(s), ${warnings.length} warning(s)\n`);
  return errors.length ? 1 : 0;
}
