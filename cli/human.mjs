import fs from "node:fs";
import path from "node:path";
import { paths } from "./store.mjs";
import { exists } from "./util.mjs";
import { parseFrontMatter } from "./yaml.mjs";

export const GATE_INFO = {
  G0: { title: "Setup check", short: "setup" },
  G1: { title: "Intent approval", short: "intent" },
  G2: { title: "Discovery sign-off", short: "discovery" },
  G3: { title: "Assessment approval", short: "assessment" },
  G4: { title: "Plan approval", short: "plan" },
  G5: { title: "Prompt verification", short: "prompt" },
  G6: { title: "Logic review approval", short: "logic review" },
  G7: { title: "Closure approval", short: "closure" },
  G8: { title: "Handover acceptance", short: "handover" },
};

export const PHASE_INFO = {
  intent: "Intent — requirements and technical direction",
  discovery: "Discovery — business requirements and scenarios",
  assessment: "Assessment — technical impact and decisions",
  planning: "Planning — prompts and dependencies",
  build: "Build — implementation and code review",
  code_review: "Code review — adversarial quality check",
  logic_review: "Logic review — business acceptance",
  setup: "Setup",
  ready: "Ready to start",
  closed: "Closed",
  handover: "Handover",
  complete: "Complete",
  abandoned: "Abandoned",
};

export const GATE_STATUS = {
  pending: "waiting",
  passed: "approved",
  failed: "blocked",
  in_progress: "in progress",
};

export function gateLabel(name) {
  const info = GATE_INFO[name];
  return info ? `${info.title} (${name})` : name;
}

export function phaseLabel(phase) {
  return PHASE_INFO[phase] || phase;
}

export function phaseShort(phase) {
  return (PHASE_INFO[phase] || phase).split(" — ")[0];
}

export function identityLabel(identity = {}) {
  const agent = identity.agent || "unknown agent";
  const model = identity.model || "unknown model";
  return `${agent} / ${model}`;
}

export function expectedIdentityLabel(identity = {}) {
  const parts = [identity.agent, identity.model].filter(Boolean);
  return parts.length ? parts.join(" / ") : "none assigned";
}

export function routeSummary(routing) {
  const source = `${routing.effort} effort (${routeSourceLabel(routing.source)})`;
  const current = identityLabel(routing.current);
  if (routing.status === "unassigned") return `${source}; no assignment; current ${current}`;
  return [
    source,
    `expected ${expectedIdentityLabel(routing.expected)}`,
    `current ${current}`,
    routeStatusLabel(routing.status),
  ].join("; ");
}

export function routeSourceLabel(source) {
  if (!source) return "configured default";
  if (source.startsWith("models.phases.")) return "phase default";
  if (source.startsWith("models.default_effort")) return "project default";
  if (source.startsWith("models.prompts.")) return "prompt override";
  if (source.endsWith(".effort")) return "prompt setting";
  return "project routing";
}

export function promptTitle(root, config, state, id) {
  if (!state || !state.activeIteration) return null;
  const file = path.join(
    paths(root, config).iterations,
    state.activeIteration,
    "plan",
    "prompts",
    `${id}.md`,
  );
  if (exists(file)) {
    try {
      const { data } = parseFrontMatter(fs.readFileSync(file, "utf8"));
      if (data.title) return String(data.title);
    } catch {
      /* fall through to matrix */
    }
  }
  const matrix = path.join(
    paths(root, config).iterations,
    state.activeIteration,
    "plan",
    "matrix.json",
  );
  if (exists(matrix)) {
    try {
      const content = JSON.parse(fs.readFileSync(matrix, "utf8"));
      const prompts = Array.isArray(content) ? content : content.prompts || [];
      const prompt = prompts.find((item) => item && item.id === id);
      if (prompt && prompt.title) return String(prompt.title);
    } catch {
      /* no title */
    }
  }
  return null;
}

export function promptLabel(root, config, state, id) {
  const title = promptTitle(root, config, state, id);
  return title ? `development prompt ${id} (${title})` : `development prompt ${id}`;
}

export function routeStatusLabel(status) {
  return {
    match: "matches plan",
    mismatch: "mismatch",
    unknown: "unknown runtime",
    unassigned: "no assignment",
  }[status] || status;
}
