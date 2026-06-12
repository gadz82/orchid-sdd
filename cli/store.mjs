import fs from "node:fs";
import path from "node:path";
import {
  SCHEMA_VERSION,
  SKILL_VERSION,
  OrchidError,
  exists,
  ensureDir,
  month,
  nowIso,
  readJson,
  readText,
  sha256,
  sortObject,
  stableStringify,
  stripVolatile,
  sortUnique,
  uuid7,
  writeJson,
} from "./util.mjs";

export function paths(root, cfg) {
  const knowledge = path.resolve(root, cfg.knowledge_folder);
  return {
    root,
    knowledge,
    manifest: path.join(knowledge, cfg.knowledge.manifest),
    events: path.join(knowledge, "events"),
    index: path.join(knowledge, "index"),
    context: path.join(knowledge, "context"),
    iterations: path.join(knowledge, "iterations"),
    input: path.join(knowledge, "input"),
    runLog: path.resolve(root, cfg.telemetry.run_log),
    state: path.join(root, ".orchid", "state.json"),
    docblocks: path.resolve(root, cfg.docblocks_folder),
    constitution: path.resolve(root, cfg.constitution_folder),
    customizations: path.resolve(root, cfg.customizations_folder),
    steering: path.resolve(
      root,
      (cfg.steering && cfg.steering.search_paths && cfg.steering.search_paths[0]) || ".orchid/steering",
    ),
  };
}

export const GATES = ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];

export function newState(cfg, configHash) {
  return {
    schemaVersion: 1,
    skillVersion: SKILL_VERSION,
    configHash,
    activeIteration: null,
    lastIteration: null,
    iterationTitle: null,
    iterationRigor: null,
    phase: "setup",
    gates: Object.fromEntries(GATES.map((gate) => [gate, "pending"])),
    locks: {},
    lastEvent: null,
  };
}

export function readState(root) {
  const file = path.join(root, ".orchid", "state.json");
  if (!exists(file)) throw new OrchidError("no .orchid/state.json; run `orchid-sdd setup` first");
  return readJson(file);
}

export function writeState(root, state) {
  const file = path.join(root, ".orchid", "state.json");
  writeJson(file, state);
}

export function appendEvent(root, cfg, state, { type, subject = null, payload = {}, actor = "orchestrator", phase = null }) {
  const p = paths(root, cfg);
  ensureDir(p.events);
  const file = path.join(p.events, `${month()}.jsonl`);
  let prev = null;
  if (exists(file)) {
    const lines = readText(file).split("\n").filter(Boolean);
    if (lines.length) prev = sha256(lines[lines.length - 1]);
  }
  const event = {
    eventId: uuid7(),
    ts: nowIso(),
    iteration: state.activeIteration || null,
    phase: phase || state.phase || "setup",
    actor,
    type,
    subject,
    payload,
    prev,
  };
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  state.lastEvent = event.eventId;
  writeState(root, state);
  return event;
}

export function readEvents(root, cfg) {
  const dir = paths(root, cfg).events;
  if (!exists(dir)) return [];
  const events = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl")).sort()) {
    const file = path.join(dir, name);
    const lines = readText(file).split("\n");
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      try {
        events.push(JSON.parse(line));
      } catch (error) {
        throw new OrchidError(`invalid event JSON at ${name}:${i + 1}: ${error.message}`);
      }
    });
  }
  return events;
}

function readPlan(root, cfg, iteration) {
  if (!iteration) return null;
  const file = path.join(paths(root, cfg).iterations, iteration, "plan", "plan.json");
  if (!exists(file)) return null;
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function buildDependencies(plan) {
  const deps = {};
  if (!plan) return deps;
  let prompts = [];
  if (Array.isArray(plan.prompts)) prompts = plan.prompts;
  else if (plan.prompts && typeof plan.prompts === "object") {
    prompts = Object.entries(plan.prompts).map(([id, value]) => ({ id, ...value }));
  }
  for (const prompt of prompts) {
    if (!prompt || !prompt.id) continue;
    deps[prompt.id] = {
      dependsOn: prompt.dependsOn || prompt.depends_on || [],
      wave: prompt.wave || null,
      writeScopes: prompt.writeScopes || (prompt.scope && prompt.scope.write) || [],
    };
  }
  return deps;
}

function push(index, key, value) {
  if (!key) return;
  if (!index[key]) index[key] = [];
  index[key].push(value);
}

function sortedIndex(index) {
  const out = {};
  for (const key of Object.keys(index).sort()) out[key] = sortUnique(index[key]);
  return out;
}

export function buildIndexes(nodes, events, plan) {
  const topics = {};
  const questions = {};
  const codeAnchors = {};
  const supersession = {};
  const requirements = {};
  const repos = {};

  for (const node of nodes) {
    const id = node["@id"];
    for (const topic of node.topics || []) push(topics, String(topic), id);
    for (const question of node.answers || []) push(questions, String(question), id);
    if (node.codeAnchor) push(codeAnchors, String(node.codeAnchor), id);
    if (node.repo) push(repos, String(node.repo), id);
    for (const relation of node.relations || []) {
      if (relation.predicate === "supersedes" && relation.target) {
        push(supersession, String(relation.target), id);
      }
    }
  }

  for (const node of nodes) {
    if (node["@type"] !== "orchid:Requirement") continue;
    const key = (node.aliases && node.aliases[0]) || node["@id"];
    const entry = {
      id: node["@id"],
      description: node.description || "",
      scenarios: [],
      prompts: [],
      tests: [],
      anchors: [],
      decisions: [],
    };
    for (const other of nodes) {
      for (const relation of other.relations || []) {
        const isTarget =
          relation.target === node["@id"] ||
          (node.aliases || []).includes(relation.target);
        if (!isTarget) continue;
        const type = other["@type"];
        if (type === "orchid:Scenario") entry.scenarios.push(other["@id"]);
        else if (type === "orchid:Prompt") entry.prompts.push(other["@id"]);
        else if (type === "orchid:CodeUnit") entry.anchors.push(other["@id"]);
        else if (type === "orchid:Decision") entry.decisions.push(other["@id"]);
        else if (type === "orchid:Test") entry.tests.push(other["@id"]);
      }
    }
    for (const field of ["scenarios", "prompts", "tests", "anchors", "decisions"]) {
      entry[field] = sortUnique(entry[field]);
    }
    requirements[key] = entry;
  }

  const timeline = events.map((event) => ({
    ts: event.ts,
    event: event.type,
    iteration: event.iteration,
    phase: event.phase,
    subject: event.subject,
  }));

  return {
    topics: sortedIndex(topics),
    questions: sortedIndex(questions),
    codeAnchors: sortedIndex(codeAnchors),
    requirements: sortObject(requirements),
    dependencies: sortObject(buildDependencies(plan)),
    timeline,
    supersession: sortedIndex(supersession),
    repos: sortedIndex(repos),
  };
}

export function project(root, cfg, state) {
  const events = readEvents(root, cfg);
  const nodes = new Map();
  const iterations = new Map();
  const gates = { ...state.gates };

  for (const event of events) {
    const payload = event.payload || {};
    if (event.type === "node.recorded" && payload.node) {
      const node = { ...payload.node };
      if (!node.iteration) node.iteration = event.iteration;
      nodes.set(node["@id"], node);
    } else if (event.type === "node.updated" && payload.id) {
      const current = nodes.get(payload.id);
      if (current) nodes.set(payload.id, { ...current, ...(payload.patch || {}), updatedAt: event.ts });
    } else if (event.type === "iteration.started" && payload.id) {
      iterations.set(payload.id, { ...payload });
    } else if ((event.type === "iteration.closed" || event.type === "iteration.abandoned") && payload.id) {
      iterations.set(payload.id, { ...(iterations.get(payload.id) || { id: payload.id }), ...payload });
    } else if (event.type === "gate.passed" && payload.gate) {
      gates[payload.gate] = "passed";
    } else if (event.type === "gate.failed" && payload.gate) {
      gates[payload.gate] = "failed";
    }
  }

  const active = state.activeIteration;
  const projectNodes = [...nodes.values()].filter(
    (node) => node.scope === "project" || node.iteration === null || node.iteration === "project",
  );
  const iterationNodes = active
    ? [...nodes.values()].filter((node) => node.iteration === active)
    : [];
  const manifestNodes = [
    ...new Map(
      [...projectNodes, ...iterationNodes].map((node) => [node["@id"], node]),
    ).values(),
  ].sort(
    (a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
      a["@id"].localeCompare(b["@id"]),
  );
  const plan = readPlan(root, cfg, active);
  const indexes = buildIndexes(manifestNodes, events, plan);
  const meta = active ? iterations.get(active) || {} : {};

  const history = [];
  const seen = new Set();
  if (exists(paths(root, cfg).iterations)) {
    const dirs = fs.readdirSync(paths(root, cfg).iterations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const name of dirs) {
      if (name === active || seen.has(name)) continue;
      const snapshot = path.join(paths(root, cfg).iterations, name, "iteration.jsonld");
      if (exists(snapshot)) {
        try {
          const data = readJson(snapshot);
          const iteration = data.iteration || {};
          history.push({
            iteration: name,
            manifest: `iterations/${name}/iteration.jsonld`,
            summary: `${iteration.title || name} — ${iteration.status || "closed"}`,
            status: iteration.status || "closed",
          });
          seen.add(name);
        } catch {
          /* ignore unreadable snapshots; doctor reports them */
        }
      }
    }
  }
  for (const [id, iteration] of iterations) {
    if (id === active || seen.has(id)) continue;
    history.push({
      iteration: id,
      manifest: null,
      summary: `${iteration.title || id} — ${iteration.status || "closed"}`,
      status: iteration.status || "closed",
    });
    seen.add(id);
  }
  history.sort((a, b) => a.iteration.localeCompare(b.iteration));

  const manifest = {
    "@context": "context/orchid-v1.jsonld",
    "@id": `urn:orchid:manifest:${String(cfg.project.name).replace(/[^A-Za-z0-9._-]+/g, "-")}:${active || "none"}`,
    "@type": "orchid:Manifest",
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso(),
    project: { name: cfg.project.name, profile: cfg.project.profile },
    iteration: active
      ? {
          "@id": `urn:orchid:iteration:${active}`,
          title: meta.title || state.iterationTitle || active,
          phase: state.phase,
          status: "active",
          specVersion: meta.specVersion || "1.0.0",
          rigor: meta.rigor || state.iterationRigor || "M",
        }
      : null,
    gates,
    indexes: {
      topics: "index/topics.json",
      questions: "index/questions.json",
      codeAnchors: "index/code-anchors.json",
      requirements: "index/requirements.json",
      dependencies: "index/dependencies.json",
      timeline: "index/timeline.json",
      repos: "index/repos.json",
    },
    workspace:
      cfg.workspace && cfg.workspace.enabled
        ? {
            enabled: true,
            repos: (cfg.workspace.repos || []).map((repo) => ({
              id: repo.id,
              path: repo.path,
              profile: repo.profile,
              enabled: repo.enabled !== false,
              git: repo.git !== false,
            })),
          }
        : { enabled: false, repos: [] },
    history,
    nodes: manifestNodes,
  };

  return { manifest, indexes, events, nodes: [...nodes.values()], iterations };
}

export function writeProjection(root, cfg, state) {
  const p = paths(root, cfg);
  const { manifest, indexes } = project(root, cfg, state);
  ensureDir(p.index);
  writeJson(p.manifest, manifest);
  writeJson(path.join(p.index, "topics.json"), indexes.topics);
  writeJson(path.join(p.index, "questions.json"), indexes.questions);
  writeJson(path.join(p.index, "code-anchors.json"), indexes.codeAnchors);
  writeJson(path.join(p.index, "requirements.json"), indexes.requirements);
  writeJson(path.join(p.index, "dependencies.json"), indexes.dependencies);
  writeJson(path.join(p.index, "timeline.json"), indexes.timeline);
  writeJson(path.join(p.index, "supersession.json"), indexes.supersession);
  writeJson(path.join(p.index, "repos.json"), indexes.repos);
  return { manifest, indexes };
}

export function checkProjection(root, cfg, state) {
  const p = paths(root, cfg);
  const drift = [];
  if (!exists(p.manifest)) return ["manifest.jsonld"];
  const built = project(root, cfg, state);
  const diskManifest = readJson(p.manifest);
  if (stableStringify(stripVolatile(diskManifest)) !== stableStringify(stripVolatile(built.manifest))) {
    drift.push("manifest.jsonld");
  }
  const files = {
    "topics.json": built.indexes.topics,
    "questions.json": built.indexes.questions,
    "code-anchors.json": built.indexes.codeAnchors,
    "requirements.json": built.indexes.requirements,
    "dependencies.json": built.indexes.dependencies,
    "timeline.json": built.indexes.timeline,
    "supersession.json": built.indexes.supersession,
    "repos.json": built.indexes.repos,
  };
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(p.index, name);
    if (!exists(file)) {
      drift.push(`index/${name}`);
      continue;
    }
    if (stableStringify(readJson(file)) !== stableStringify(value)) drift.push(`index/${name}`);
  }
  return drift;
}

export function loadManifest(root, cfg) {
  const file = paths(root, cfg).manifest;
  if (!exists(file)) throw new OrchidError(`${file} is missing; run \`orchid-sdd index\``);
  return readJson(file);
}

export function writeIterationSnapshot(root, cfg, state, status, reason = null, workspace = null) {
  const id = state.activeIteration;
  if (!id) throw new OrchidError("no active iteration to snapshot");
  const { manifest } = project(root, cfg, state);
  const dir = path.join(paths(root, cfg).iterations, id);
  if (!exists(dir)) throw new OrchidError(`iteration directory is missing: ${dir}`);
  const snapshot = {
    "@context": "context/orchid-v1.jsonld",
    "@id": `urn:orchid:iteration:${id}`,
    "@type": "orchid:IterationSnapshot",
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso(),
    project: { name: cfg.project.name, profile: cfg.project.profile },
    iteration: {
      ...(manifest.iteration || { "@id": `urn:orchid:iteration:${id}` }),
      status,
      closedAt: nowIso(),
      ...(reason ? { reason } : {}),
    },
    gates: manifest.gates,
    nodes: manifest.nodes,
    ...(workspace ? { workspace } : {}),
  };
  const file = path.join(dir, "iteration.jsonld");
  writeJson(file, snapshot);
  return file;
}

export function moveMerge(src, dst) {
  if (!exists(src)) return false;
  ensureDir(path.dirname(dst));
  if (!exists(dst)) {
    fs.renameSync(src, dst);
    return true;
  }
  for (const entry of fs.readdirSync(src)) {
    moveMerge(path.join(src, entry), path.join(dst, entry));
  }
  fs.rmSync(src, { recursive: true, force: true });
  return true;
}

export function archiveTransients(root, cfg, state) {
  if (!state.activeIteration) return [];
  const iteration = path.join(paths(root, cfg).iterations, state.activeIteration);
  const audit = path.join(iteration, "audit");
  const moved = [];
  const pairs = [
    [path.join(iteration, "plan", "prompts"), path.join(audit, "prompts"), "prompts"],
    [path.join(iteration, "execution", "runs"), path.join(audit, "runs"), "runs"],
  ];
  for (const [src, dst, label] of pairs) {
    if (moveMerge(src, dst)) moved.push(label);
  }
  return moved;
}

export function listIterations(root, cfg) {
  const dir = paths(root, cfg).iterations;
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
