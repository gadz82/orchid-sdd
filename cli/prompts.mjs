import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import {
  detectCurrentIdentity,
  evaluateRoute,
  resolveRoute,
} from "./models.mjs";
import {
  appendEvent,
  paths,
  readState,
  writeProjection,
  writeState,
} from "./store.mjs";
import { OrchidError, exists, formatJson, nowIso, uuid7 } from "./util.mjs";
import { promptLabel, routeSummary } from "./human.mjs";

const PROMPT_RE = /^P-[0-9]{3}$/;

function requireActive(state) {
  if (!state.activeIteration) {
    throw new OrchidError("no active iteration; run `orchid-sdd start` first");
  }
}

function updateMatrix(root, config, state, prompt, status, step) {
  const file = path.join(
    paths(root, config).iterations,
    state.activeIteration,
    "plan",
    "matrix.json",
  );
  if (!exists(file)) return;
  let matrix;
  try {
    matrix = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return;
  }
  const list = Array.isArray(matrix) ? matrix : matrix.prompts;
  if (!Array.isArray(list)) return;
  const item = list.find((entry) => entry && entry.id === prompt);
  if (!item) return;
  item.status = status;
  if (step) item.step = step;
  item.updatedAt = nowIso();
  fs.writeFileSync(file, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
}

function promptRoute(root, config, state, prompt) {
  const route = resolveRoute(root, config, {
    phase: state.phase,
    prompt,
    iteration: state.activeIteration,
  });
  return evaluateRoute(route, detectCurrentIdentity());
}

function printRoute(routing) {
  process.stdout.write(`  model: ${routeSummary(routing)}\n`);
  if (routing.status === "unknown" || routing.status === "mismatch") {
    process.stdout.write(
      "  alert: runtime differs from the plan. Tell the user; do not switch automatically.\n",
    );
  }
}

function promptState(state, id) {
  const prompt = state.prompts && state.prompts[id];
  if (!prompt) throw new OrchidError(`prompt ${id} has no recorded state`);
  return prompt;
}

function listPrompts(state) {
  return Object.values(state.prompts || {}).sort((a, b) => a.id.localeCompare(b.id));
}

export function promptCommand(root, args = {}) {
  const { config } = loadConfig(root);
  const state = readState(root);
  requireActive(state);
  const action = String(args.action || "list");
  const id = args.id ? String(args.id) : null;
  if (id && !PROMPT_RE.test(id)) {
    throw new OrchidError(`prompt id must look like P-001: ${id}`);
  }

  if (action === "list") {
    const rows = listPrompts(state);
    if (args.json) {
      process.stdout.write(`${formatJson(rows)}\n`);
      return 0;
    }
    if (!rows.length) {
      process.stdout.write("No prompt state recorded.\n");
      return 0;
    }
    for (const prompt of rows) {
      process.stdout.write(
        `${promptLabel(root, config, state, prompt.id)} — ${prompt.status}, step ${prompt.step || "not started"}, attempt ${prompt.attempt || 1}\n`,
      );
    }
    return 0;
  }

  if (action === "show") {
    if (!id) throw new OrchidError("prompt show requires a prompt id");
    const prompt = promptState(state, id);
    if (args.json) {
      process.stdout.write(`${formatJson({ ...prompt, routing: state.runs[prompt.runId]?.routing || null })}\n`);
      return 0;
    }
    process.stdout.write(`${promptLabel(root, config, state, prompt.id)}\n`);
    process.stdout.write(`  status:   ${prompt.status}\n`);
    process.stdout.write(`  step:     ${prompt.step || "not started"}\n`);
    process.stdout.write(`  attempt:  ${prompt.attempt || 1}\n`);
    if (prompt.evidence) process.stdout.write(`  evidence: ${prompt.evidence}\n`);
    const run = state.runs[prompt.runId];
    if (run?.routing) printRoute(run.routing);
    return 0;
  }

  if (!["start", "step", "complete", "fail", "waive"].includes(action)) {
    throw new OrchidError(`unknown prompt action "${action}"`);
  }
  if (!id) throw new OrchidError(`prompt ${action} requires a prompt id`);

  if (action === "start") {
    if (state.currentPrompt && state.currentPrompt !== id) {
      throw new OrchidError(
        `prompt ${state.currentPrompt} is still active; complete, fail, or waive it before starting ${id}`,
      );
    }
    const routing = promptRoute(root, config, state, id);
    if (config.models.mismatch === "block" && routing.status === "mismatch") {
      throw new OrchidError(routing.message);
    }
    const attempt = (state.prompts?.[id]?.attempt || 0) + 1;
    const runId = uuid7();
    const step = String(args.step || "implement");
    const prompt = {
      id,
      status: "running",
      step,
      attempt,
      runId,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.prompts[id] = prompt;
    state.runs[runId] = {
      id: runId,
      prompt: id,
      phase: state.phase,
      attempt,
      step,
      status: "running",
      startedAt: prompt.startedAt,
      routing,
    };
    state.currentPrompt = id;
    state.currentRun = runId;
    appendEvent(root, config, state, {
      type: "prompt.started",
      subject: `prompt:${id}`,
      payload: { prompt, run: state.runs[runId], routing },
    });
    writeProjection(root, config, state);
    updateMatrix(root, config, state, id, "running", step);
    if (args.json) {
      process.stdout.write(`${formatJson({ prompt, routing })}\n`);
      return 0;
    }
    process.stdout.write(
      `${promptLabel(root, config, state, id)} started · step ${step} · attempt ${attempt}\n`,
    );
    printRoute(routing);
    return 0;
  }

  const prompt = promptState(state, id);
  if (prompt.status !== "running") {
    throw new OrchidError(
      `prompt ${id} is ${prompt.status}; start a new attempt before ${action}`,
    );
  }
  if (action === "step") {
    const step = String(args.step || "").trim();
    if (!step) throw new OrchidError("prompt step requires --step NAME");
    prompt.step = step;
    prompt.updatedAt = nowIso();
    const run = state.runs[prompt.runId];
    if (run) {
      run.step = step;
      run.updatedAt = prompt.updatedAt;
    }
    appendEvent(root, config, state, {
      type: "prompt.step",
      subject: `prompt:${id}`,
      payload: { prompt: id, step, run: prompt.runId },
    });
    writeProjection(root, config, state);
    updateMatrix(root, config, state, id, prompt.status, step);
    if (args.json) {
      process.stdout.write(`${formatJson(prompt)}\n`);
      return 0;
    }
    process.stdout.write(`${promptLabel(root, config, state, id)}: step ${step}\n`);
    return 0;
  }

  const status = action === "complete" ? "done" : action === "fail" ? "failed" : "waived";
  prompt.status = status;
  prompt.updatedAt = nowIso();
  if (args.note) prompt.note = String(args.note);
  if (args.evidence) prompt.evidence = String(args.evidence);
  const run = state.runs[prompt.runId];
  if (run) {
    run.status = status === "done" ? "completed" : status;
    run.completedAt = prompt.updatedAt;
    run.note = args.note || null;
  }
  if (state.currentPrompt === id) {
    state.currentPrompt = null;
    state.currentRun = null;
  }
  appendEvent(root, config, state, {
    type: action === "complete" ? "prompt.completed" : action === "fail" ? "prompt.failed" : "prompt.waived",
    subject: `prompt:${id}`,
    payload: {
      prompt: id,
      status,
      note: args.note || null,
      evidence: args.evidence || null,
      run: prompt.runId,
    },
  });
  writeProjection(root, config, state);
  updateMatrix(root, config, state, id, status, prompt.step);
  if (args.json) {
    process.stdout.write(`${formatJson(prompt)}\n`);
    return 0;
  }
  process.stdout.write(`${promptLabel(root, config, state, id)}: ${status}\n`);
  return 0;
}
