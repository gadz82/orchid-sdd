import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "./config.mjs";
import {
  appendEvent,
  paths,
  readState,
  writeProjection,
} from "./store.mjs";
import { gitInfo } from "./workspace.mjs";
import { withStateLock } from "./lock.mjs";
import { OrchidError, exists, formatJson, nowIso, readJson, writeJson } from "./util.mjs";

const WAVE_RE = /^(?:W)?([1-9][0-9]*)$/i;

// Merges created by the orchestrator need a deterministic author identity:
// CI runners have no git user.name/user.email, and `git merge --no-ff` otherwise
// fails with "unable to auto-detect email address" (masked as a merge conflict).
const MERGE_IDENTITY = [
  "-c", "user.name=orchid-sdd",
  "-c", "user.email=orchid-sdd@users.noreply.github.com",
];

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.status !== 0 && !allowFailure) {
    throw new OrchidError(
      `git ${args.join(" ")} failed in ${cwd}: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return {
    code: result.status,
    out: (result.stdout || "").trim(),
    err: (result.stderr || "").trim(),
  };
}

function activeIterationDir(root, config, state) {
  if (!state.activeIteration) throw new OrchidError("no active iteration; run `orchid-sdd start` first");
  return path.join(paths(root, config).iterations, state.activeIteration);
}

function readPlan(root, config, state) {
  const file = path.join(activeIterationDir(root, config, state), "plan", "plan.json");
  if (!exists(file)) throw new OrchidError("plan/plan.json is missing; run planning or restore the plan");
  try {
    return readJson(file);
  } catch (error) {
    throw new OrchidError(`cannot read plan/plan.json: ${error.message}`);
  }
}

function readMatrix(root, config, state) {
  const file = path.join(activeIterationDir(root, config, state), "plan", "matrix.json");
  if (!exists(file)) throw new OrchidError("plan/matrix.json is missing; run planning or restore the plan");
  try {
    return readJson(file);
  } catch (error) {
    throw new OrchidError(`cannot read plan/matrix.json: ${error.message}`);
  }
}

function matrixList(matrix) {
  if (Array.isArray(matrix)) return matrix;
  if (!matrix || typeof matrix !== "object") return [];
  return Array.isArray(matrix.prompts) ? matrix.prompts : [];
}

function matrixPath(root, config, state) {
  return path.join(activeIterationDir(root, config, state), "plan", "matrix.json");
}

function saveMatrix(root, config, state, matrix) {
  writeJson(matrixPath(root, config, state), matrix);
}

function waveNumber(value) {
  const match = WAVE_RE.exec(String(value || ""));
  if (!match) throw new OrchidError(`invalid wave "${value}" (expected W4 or 4)`);
  return Number(match[1]);
}

function waveId(number) {
  return `W${number}`;
}

function planPrompts(plan) {
  if (!plan || typeof plan !== "object") return [];
  if (Array.isArray(plan.prompts)) return plan.prompts;
  if (plan.prompts && typeof plan.prompts === "object") {
    return Object.entries(plan.prompts).map(([id, value]) => ({ id, ...value }));
  }
  return [];
}

function promptScope(prompt) {
  const value =
    prompt && (prompt.scope?.write || prompt.writeScopes || prompt.scope_write);
  return Array.isArray(value) ? value : [];
}

function promptDependencies(prompt) {
  const value = prompt && (prompt.depends_on || prompt.dependsOn);
  return Array.isArray(value) ? value : [];
}

function workspaceRepos(root, config) {
  if (!config.workspace || !config.workspace.enabled) {
    return [{ id: null, path: "", repoDir: root }];
  }
  return (config.workspace.repos || [])
    .filter((repo) => repo.enabled !== false)
    .map((repo) => ({ ...repo, repoDir: path.join(root, repo.path) }));
}

function repoForPrompt(root, config, prompt) {
  const repos = workspaceRepos(root, config);
  if (!config.workspace || !config.workspace.enabled) return repos[0];
  if (prompt.repo) {
    const direct = repos.find((repo) => repo.id === prompt.repo);
    if (!direct) throw new OrchidError(`prompt ${prompt.id} names unknown repo "${prompt.repo}"`);
    for (const write of promptScope(prompt)) {
      const value = normalizeScope(write);
      const rootPath = normalizeScope(direct.path);
      if (rootPath && value !== rootPath && !value.startsWith(`${rootPath}/`)) {
        throw new OrchidError(
          `prompt ${prompt.id} scope.write "${write}" is outside workspace repo "${direct.id}" (${direct.path}/)`,
        );
      }
    }
    return direct;
  }
  const writes = promptScope(prompt);
  if (!writes.length) throw new OrchidError(`prompt ${prompt.id} has no scope.write; cannot select a repo`);
  const matches = repos.filter((repo) =>
    writes.every((entry) => {
      const value = normalizeScope(entry);
      const rootPath = normalizeScope(repo.path);
      return rootPath && (value === rootPath || value.startsWith(`${rootPath}/`));
    }),
  );
  if (matches.length !== 1) {
    throw new OrchidError(
      `prompt ${prompt.id} write scope must map to exactly one workspace repo (matches: ${matches
        .map((repo) => repo.id)
        .join(", ") || "none"})`,
    );
  }
  return matches[0];
}

function repoForEntry(root, config, entry) {
  if (entry.repoId) {
    const found = workspaceRepos(root, config).find((repo) => repo.id === entry.repoId);
    if (found) return found;
  }
  if (entry.repoPath) {
    const repoDir = path.join(root, entry.repoPath);
    if (exists(path.join(repoDir, ".git"))) {
      return { id: entry.repoId || null, path: entry.repoPath, repoDir };
    }
  }
  if (entry.repoId) {
    throw new OrchidError(
      `wave prompt ${entry.id} references unknown workspace repo "${entry.repoId}"`,
    );
  }
  return { id: null, path: "", repoDir: root };
}

function normalizeScope(value) {
  const normalized = path.posix
    .normalize(String(value || "").replace(/\\/g, "/"))
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
  return normalized === "." ? "" : normalized;
}

function scopesOverlap(a, b) {
  const left = normalizeScope(a);
  const right = normalizeScope(b);
  if (!left || !right) return false;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function assertDisjoint(prompts, config, root) {
  for (let i = 0; i < prompts.length; i += 1) {
    const left = prompts[i];
    const leftRepo = repoForPrompt(root, config, left);
    for (let j = i + 1; j < prompts.length; j += 1) {
      const right = prompts[j];
      const rightRepo = repoForPrompt(root, config, right);
      if (leftRepo.id !== rightRepo.id) continue;
      for (const a of promptScope(left)) {
        for (const b of promptScope(right)) {
          if (scopesOverlap(a, b)) {
            throw new OrchidError(
              `wave prompts ${left.id} and ${right.id} have overlapping write scopes: ${a} / ${b}`,
            );
          }
        }
      }
    }
  }
}

function matrixPrompt(matrix, id) {
  return matrixList(matrix).find((entry) => entry && entry.id === id) || null;
}

function isTerminal(status) {
  return status === "done" || status === "waived";
}

function ensureWaveDependencies(matrix, prompts) {
  const status = new Map(matrixList(matrix).map((entry) => [entry.id, entry.status]));
  for (const prompt of prompts) {
    for (const dep of promptDependencies(prompt)) {
      const depStatus = status.get(dep);
      if (!isTerminal(depStatus)) {
        throw new OrchidError(
          `prompt ${prompt.id} depends on ${dep}, which is ${depStatus || "missing"}; finish it first`,
        );
      }
    }
  }
}

function baseCommit(repoDir) {
  if (!exists(path.join(repoDir, ".git"))) {
    throw new OrchidError(`not a git repository: ${repoDir}; wave isolation requires Git`);
  }
  return git(repoDir, ["rev-parse", "HEAD"]).out;
}

function branchExists(repoDir, branch) {
  return git(repoDir, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    allowFailure: true,
  }).code === 0;
}

function worktreePath(root, state, id) {
  return path.join(root, ".orchid", "worktrees", state.activeIteration, id);
}

function relativeWorktree(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function ensureWorktree(root, repo, state, prompt, base) {
  const target = worktreePath(root, state, prompt.id);
  // Spikes are evidence gathering: their code is disposable and never merged.
  const branch = prompt.type === "spike"
    ? `spike/${prompt.id}`
    : `orchid/${state.activeIteration}/${prompt.id}`;
  if (exists(target)) {
    throw new OrchidError(`worktree path already exists for ${prompt.id}: ${relativeWorktree(root, target)}`);
  }
  if (branchExists(repo.repoDir, branch)) {
    throw new OrchidError(`prompt branch already exists for ${prompt.id}: ${branch}`);
  }
  const result = git(repo.repoDir, ["worktree", "add", "-b", branch, target, base], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    throw new OrchidError(`cannot create worktree for ${prompt.id}: ${result.err || result.out}`);
  }
  return { target, branch, worktree: relativeWorktree(root, target) };
}

function removeWorktree(repoDir, worktree) {
  if (worktree && exists(worktree)) {
    git(repoDir, ["worktree", "remove", "--force", worktree], { allowFailure: true });
  }
  git(repoDir, ["worktree", "prune"], { allowFailure: true });
}

function deleteBranch(repoDir, branch) {
  if (!branch) return;
  git(repoDir, ["branch", "-D", branch], { allowFailure: true });
}

function setMatrixStatus(root, config, state, ids, status) {
  const matrix = readMatrix(root, config, state);
  for (const id of ids) {
    const item = matrixPrompt(matrix, id);
    if (item) {
      item.status = status;
      item.updatedAt = nowIso();
    }
  }
  saveMatrix(root, config, state, matrix);
}

function setCurrentWave(state, wave) {
  state.currentWaves = state.currentWaves || {};
  state.currentWaves[wave.id] = wave;
  state.currentWave = wave;
  state.activePrompts = state.activePrompts || {};
}

function detachWave(state, wave) {
  const ids = new Set((wave.prompts || []).map((entry) => entry.id));
  state.lastWave = wave;
  if (state.currentWaves) delete state.currentWaves[wave.id];
  const remainingWaves = Object.values(state.currentWaves || {});
  state.currentWave = remainingWaves.length ? remainingWaves[remainingWaves.length - 1] : null;
  for (const promptId of ids) delete state.activePrompts?.[promptId];
  if (state.currentPrompt && ids.has(state.currentPrompt)) {
    const remainingPrompts = Object.keys(state.activePrompts || {});
    state.currentPrompt = remainingPrompts.length ? remainingPrompts[remainingPrompts.length - 1] : null;
    state.currentRun = state.currentPrompt ? state.activePrompts[state.currentPrompt] : null;
  }
  return ids;
}

function waveEvent(root, config, state, type, wave, extra = {}, { full = true } = {}) {
  appendEvent(
    root,
    config,
    state,
    {
      type,
      subject: `wave:${wave.id}`,
      payload: full ? { wave, ...extra } : { ...extra },
    },
    { locked: true },
  );
}

function wavePromptEvent(root, config, state, type, wave, payload) {
  waveEvent(root, config, state, type, wave, payload, { full: false });
}

function markMerged(state, wave, entry, { waived = false } = {}) {
  entry.merged = true;
  entry.merging = false;
  entry.mergedAt = nowIso();
  if (waived) entry.waived = true;
  const promptState = state.prompts?.[entry.id];
  if (promptState) {
    promptState.worktree = null;
    promptState.branch = null;
    promptState.mergedAt = entry.mergedAt;
  }
}

function repoTestCommand(config, repo) {
  if (repo && repo.test_commands && repo.test_commands.unit) return repo.test_commands.unit;
  // In workspace mode each repository owns its command; falling back to the
  // root project's command would test the wrong language/toolchain.
  if (config.workspace?.enabled && repo?.id) return null;
  return config.execution?.test_commands?.unit || null;
}

function assertWaveTestCommands(root, config, wave, matrix) {
  const touched = new Map();
  for (const entry of wave.prompts || []) {
    const item = matrixPrompt(matrix, entry.id);
    if (!item || item.status === "waived" || entry.type === "spike") continue;
    const repo = repoForEntry(root, config, entry);
    touched.set(repo.repoDir, repo);
  }
  for (const repo of touched.values()) {
    if (!repoTestCommand(config, repo)) {
      throw new OrchidError(
        `wave ${wave.id} --test requires execution.test_commands.unit for ${repo.id || "the project root"}`,
      );
    }
  }
  return touched;
}

function isAncestor(repoDir, commit) {
  if (!commit) return false;
  return git(repoDir, ["merge-base", "--is-ancestor", commit, "HEAD"], {
    allowFailure: true,
  }).code === 0;
}

function copySpikeReport(root, state, entry) {
  const target = path.join(
    root,
    ".knowledge",
    "iterations",
    state.activeIteration,
    "assessment",
    "spikes",
  );
  const source = entry.worktree
    ? path.join(
        root,
        entry.worktree,
        ".knowledge",
        "iterations",
        state.activeIteration,
        "assessment",
        "spikes",
      )
    : null;
  const files = source && exists(source)
    ? fs.readdirSync(source, { withFileTypes: true })
    : [];
  if (files.length) {
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(source, target, { recursive: true, force: true });
    return files.map((item) => item.name);
  }

  // Workspace worktrees are checkouts of a repository and do not contain the
  // root-owned .knowledge tree. Accept a report written directly to the root,
  // but only if it names the prompt or was created after the spike started.
  const startedAt = Date.parse(state.prompts?.[entry.id]?.startedAt || "") || 0;
  const rootFiles = exists(target) ? fs.readdirSync(target, { withFileTypes: true }) : [];
  const matching = rootFiles.filter((item) => {
    if (item.name.includes(entry.id)) return true;
    try {
      return fs.statSync(path.join(target, item.name)).mtimeMs >= startedAt - 1000;
    } catch {
      return false;
    }
  });
  if (!matching.length) {
    throw new OrchidError(
      `spike ${entry.id} has no findings report under assessment/spikes; ` +
        "write it before reconciliation",
    );
  }
  return matching.map((item) => item.name);
}

function dirtyPath(line) {
  // gitInfo trims the status output, so the first line may lose its leading
  // space. Remove one or two porcelain status characters followed by spaces.
  let value = line.replace(/^[ MADRCTU?!]{1,2}\s+/, "").trim();
  if (value.startsWith("\"") && value.endsWith("\"")) value = value.slice(1, -1);
  const arrow = value.indexOf(" -> ");
  if (arrow >= 0) value = value.slice(arrow + 4).trim();
  return value.replace(/\\/g, "/");
}

function assertCodeTreeClean(root, config, { allowDirty = false } = {}) {
  if (allowDirty) return;
  const workspacePaths = (config.workspace?.repos || [])
    .map((repo) => normalizeScope(repo.path))
    .filter(Boolean);
  const dirty = [];
  for (const repo of workspaceRepos(root, config)) {
    const info = gitInfo(repo.repoDir);
    if (!info.git) continue;
    const changes = (info.dirtyFiles || []).filter((line) => {
      const value = dirtyPath(line);
      if (
        value.startsWith(".orchid/") ||
        value.startsWith(".knowledge/") ||
        value.startsWith(".orchid-migration-bck/")
      ) return false;
      // The root repo may track nested workspace repos as gitlinks; their own
      // check below is authoritative.
      if (repo.repoDir === root && workspacePaths.some(
        (workspacePath) => value === workspacePath || value.startsWith(`${workspacePath}/`),
      )) return false;
      return true;
    });
    if (changes.length) dirty.push(`${repo.id || "root"} (${changes.length} change(s))`);
  }
  if (dirty.length) {
    throw new OrchidError(
      `clean code tree required before wave start; dirty: ${dirty.join(", ")}. ` +
        "Commit/stash or pass --allow-dirty.",
    );
  }
}

/**
 * Find prompt branches and worktrees left behind by the active iteration.
 * Used by review/closure so a finished iteration cannot retain disposable
 * isolation artifacts.
 */
export function promptArtifacts(root, config, state) {
  if (!state.activeIteration) return [];
  const prefix = `orchid/${state.activeIteration}/`;
  const worktreeMarker = `.orchid/worktrees/${state.activeIteration}/`;
  const isPromptSuffix = (value) => /^P-[0-9]{3}$/.test(String(value || ""));
  const rows = new Map();
  const add = (repoId, branch, worktree) => {
    const key = `${repoId || "root"}|${branch || worktree}`;
    const current = rows.get(key);
    if (current) {
      if (worktree) current.worktree = worktree;
      return current;
    }
    const row = { repoId: repoId || null, branch: branch || null, worktree: worktree || null };
    rows.set(key, row);
    return row;
  };

  for (const repo of workspaceRepos(root, config)) {
    if (!exists(path.join(repo.repoDir, ".git"))) continue;
    const branches = git(
      repo.repoDir,
      ["branch", "--format=%(refname:short)", "--list", `${prefix}*`],
      { allowFailure: true },
    ).out;
    for (const branch of branches.split("\n").filter(Boolean)) {
      if (branch.startsWith(prefix) && isPromptSuffix(branch.slice(prefix.length))) {
        add(repo.id, branch, null);
      }
    }
    const spikeBranches = git(
      repo.repoDir,
      ["branch", "--format=%(refname:short)", "--list", "spike/P-*"],
      { allowFailure: true },
    ).out;
    for (const branch of spikeBranches.split("\n").filter(Boolean)) {
      if (/^spike\/P-[0-9]{3}$/.test(branch)) add(repo.id, branch, null);
    }

    const listing = git(repo.repoDir, ["worktree", "list", "--porcelain"], {
      allowFailure: true,
    }).out;
    let current = {};
    const flush = () => {
      if (!current.path) return;
      const normalized = String(current.path).split(path.sep).join("/");
      const shortBranch = current.branch?.startsWith("refs/heads/")
        ? current.branch.slice("refs/heads/".length)
        : null;
      const branchSuffix = shortBranch?.startsWith(prefix)
        ? shortBranch.slice(prefix.length)
        : null;
      if (branchSuffix && isPromptSuffix(branchSuffix)) {
        add(repo.id, `${prefix}${branchSuffix}`, normalized);
      } else if (/^spike\/P-[0-9]{3}$/.test(shortBranch || "")) {
        add(repo.id, shortBranch, normalized);
      } else if (
        normalized.includes(worktreeMarker) &&
        isPromptSuffix(path.posix.basename(normalized))
      ) {
        add(repo.id, null, normalized);
      }
      current = {};
    };
    for (const line of listing.split("\n")) {
      if (line.startsWith("worktree ")) {
        flush();
        current = { path: line.slice("worktree ".length) };
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length);
      } else if (!line.trim()) {
        flush();
      }
    }
    flush();
  }
  return [...rows.values()];
}

export function assertNoPromptArtifacts(root, config, state, { force = false } = {}) {
  if (force) return [];
  const artifacts = promptArtifacts(root, config, state);
  if (artifacts.length) {
    const labels = artifacts.map((row) => {
      const where = row.repoId ? `${row.repoId}:` : "";
      return `${where}${row.branch || row.worktree || "unknown"}`;
    });
    throw new OrchidError(
      `prompt branches/worktrees remain: ${labels.join(", ")}; clean them or pass --force`,
    );
  }
  return artifacts;
}

function startWave(root, config, state, number, args) {
  if (!state.activeIteration) throw new OrchidError("no active iteration; run `orchid-sdd start` first");
  if (state.phase !== "build") {
    throw new OrchidError(`wave start requires phase build (current: ${state.phase})`);
  }
  if (config.execution.isolation !== "worktree") {
    throw new OrchidError(
      `wave execution requires execution.isolation=worktree (current: ${config.execution.isolation})`,
    );
  }
  const id = waveId(number);
  if (state.currentWaves?.[id]) {
    throw new OrchidError(`wave ${id} is already ${state.currentWaves[id].status}; reconcile or abort it first`);
  }

  const activeWaves = Object.values(state.currentWaves || {});
  const activeWavePromptIds = new Map(
    activeWaves.flatMap((wave) =>
      (wave.prompts || []).map((entry) => [entry.id, wave.id]),
    ),
  );
  const active = Object.keys(state.activePrompts || {});
  const standalone = active.filter((promptId) => !activeWavePromptIds.has(promptId));
  if (standalone.length) {
    throw new OrchidError(
      `prompt(s) ${standalone.join(", ")} are active outside a wave; complete or fail them before starting ${id}`,
    );
  }
  // Ignore orchid-managed state/events/matrix changes, but refuse to freeze
  // worktrees while code changes are uncommitted and therefore absent from HEAD.
  assertCodeTreeClean(root, config, { allowDirty: Boolean(args.allowDirty) });
  const plan = readPlan(root, config, state);
  const matrix = readMatrix(root, config, state);
  const planById = new Map(planPrompts(plan).map((prompt) => [prompt.id, prompt]));
  const candidates = planPrompts(plan)
    .filter((prompt) => Number(prompt.wave) === number)
    .filter((prompt) => !isTerminal(matrixPrompt(matrix, prompt.id)?.status));
  if (!candidates.length) throw new OrchidError(`wave ${number} has no open prompts in plan/plan.json`);
  ensureWaveDependencies(matrix, candidates);
  for (const prompt of candidates) {
    for (const dep of promptDependencies(prompt)) {
      if (activeWavePromptIds.has(dep)) {
        throw new OrchidError(
          `prompt ${prompt.id} depends on ${dep} in active wave ${activeWavePromptIds.get(dep)}; reconcile that wave first`,
        );
      }
    }
  }
  assertDisjoint(candidates, config, root);

  for (const prompt of candidates) {
    const repo = repoForPrompt(root, config, prompt);
    for (const activeWave of activeWaves) {
      for (const activePrompt of activeWave.prompts || []) {
        if (activePrompt.repoId !== repo.id) continue;
        const activeScope = Array.isArray(activePrompt.scope) && activePrompt.scope.length
          ? activePrompt.scope
          : promptScope(planById.get(activePrompt.id) || {});
        for (const a of promptScope(prompt)) {
          for (const b of activeScope) {
            if (scopesOverlap(a, b)) {
              throw new OrchidError(
                `prompt ${prompt.id} overlaps active wave prompt ${activePrompt.id}: ${a} / ${b}`,
              );
            }
          }
        }
      }
    }
  }

  const wave = {
    id,
    number,
    iteration: state.activeIteration,
    status: "running",
    startedAt: nowIso(),
    prompts: [],
    baseByRepo: {},
  };
  const created = [];
  try {
    for (const prompt of candidates) {
      const repo = repoForPrompt(root, config, prompt);
      const repoKey = repo.id || "root";
      wave.baseByRepo[repoKey] = wave.baseByRepo[repoKey] || baseCommit(repo.repoDir);
      const base = wave.baseByRepo[repoKey];
      const worktree = ensureWorktree(root, repo, state, prompt, base);
      created.push({ repo, worktree });
      wave.prompts.push({
        id: prompt.id,
        title: prompt.title || prompt.id,
        type: prompt.type || "build",
        wave: number,
        status: "ready",
        repoId: repo.id,
        repoPath: repo.path,
        base,
        branch: worktree.branch,
        worktree: worktree.worktree,
        scope: promptScope(prompt),
      });
    }
  } catch (error) {
    for (const entry of created.reverse()) {
      removeWorktree(entry.repo.repoDir, entry.worktree.target);
      deleteBranch(entry.repo.repoDir, entry.worktree.branch);
    }
    throw error;
  }
  setMatrixStatus(root, config, state, candidates.map((prompt) => prompt.id), "ready");
  setCurrentWave(state, wave);
  waveEvent(root, config, state, "wave.started", wave);
  writeProjection(root, config, state);
  return wave;
}

function reconcileWave(root, config, state, number, args) {
  const id = number ? waveId(number) : state.currentWave?.id;
  const wave = id ? state.currentWaves?.[id] || (state.currentWave?.id === id ? state.currentWave : null) : null;
  if (!wave) throw new OrchidError(`no active wave${id ? ` ${id}` : ""}; run \`orchid-sdd wave start <N>\` first`);
  if (!["running", "ready", "failed"].includes(wave.status)) {
    throw new OrchidError(`wave ${wave.id} is ${wave.status}; nothing to reconcile`);
  }
  const wavePrompts = wave.prompts || [];
  const wavePromptIds = new Set(wavePrompts.map((entry) => entry.id));
  const activeInWave = Object.keys(state.activePrompts || {}).filter((promptId) => wavePromptIds.has(promptId));
  if (activeInWave.length) {
    throw new OrchidError(
      `wave ${wave.id} still has active prompt(s): ${activeInWave.join(", ")}; complete or fail them before reconciliation`,
    );
  }
  const matrix = readMatrix(root, config, state);
  const notDone = wavePrompts
    .map((entry) => matrixPrompt(matrix, entry.id))
    .filter((entry) => !entry || !isTerminal(entry.status));
  if (notDone.length) {
    throw new OrchidError(
      `wave ${wave.id} is not complete: ${notDone.map((entry) => `${entry?.id || "?"}:${entry?.status || "missing"}`).join(", ")}`,
    );
  }
  if (args.test) assertWaveTestCommands(root, config, wave, matrix);

  if (wave.status === "failed") {
    wave.lastError = wave.error || null;
    wave.retries = (wave.retries || 0) + 1;
    wave.status = "running";
    wave.error = null;
    wave.failedAt = null;
    waveEvent(root, config, state, "wave.retried", wave);
  }

  const touchedRepos = new Map();
  try {
    for (const entry of wavePrompts) {
      const item = matrixPrompt(matrix, entry.id);
      const repo = repoForEntry(root, config, entry);
      const repoDir = repo.repoDir;
      const worktree = entry.worktree ? path.join(root, entry.worktree) : null;

      if (item.status === "waived" || entry.waived) {
        removeWorktree(repoDir, worktree);
        deleteBranch(repoDir, entry.branch);
        markMerged(state, wave, entry, { waived: true });
        wavePromptEvent(root, config, state, "wave.merged", wave, {
          waveId: wave.id,
          promptId: entry.id,
          branch: entry.branch,
          waived: true,
          tip: entry.branchTip || null,
        });
        continue;
      }

      if (entry.merged) {
        removeWorktree(repoDir, worktree);
        deleteBranch(repoDir, entry.branch);
        if (entry.type !== "spike") touchedRepos.set(repoDir, repo);
        continue;
      }

      if (entry.type === "spike") {
        if (!entry.spikeCopied) {
          if (!branchExists(repoDir, entry.branch)) {
            throw new OrchidError(
              `spike ${entry.id} branch is missing: ${entry.branch}; restore it or abort the wave`,
            );
          }
          copySpikeReport(root, state, entry);
          entry.spikeCopied = true;
          wavePromptEvent(root, config, state, "wave.spike_copied", wave, {
            waveId: wave.id,
            promptId: entry.id,
            branch: entry.branch,
          });
        }
        removeWorktree(repoDir, worktree);
        deleteBranch(repoDir, entry.branch);
        markMerged(state, wave, entry);
        entry.spike = true;
        wavePromptEvent(root, config, state, "wave.merged", wave, {
          waveId: wave.id,
          promptId: entry.id,
          branch: entry.branch,
          spike: true,
        });
        continue;
      }

      const branch = entry.branch;
      if (!branchExists(repoDir, branch)) {
        if (isAncestor(repoDir, entry.branchTip)) {
          markMerged(state, wave, entry);
          wavePromptEvent(root, config, state, "wave.merged", wave, {
            waveId: wave.id,
            promptId: entry.id,
            branch,
            tip: entry.branchTip,
          });
          touchedRepos.set(repoDir, repo);
          continue;
        }
        throw new OrchidError(
          `prompt ${entry.id} branch is missing: ${branch}; restore it or abort the wave`,
        );
      }
      if (worktree && exists(worktree)) {
        const status = git(worktree, ["status", "--porcelain"]).out;
        if (status) throw new OrchidError(`worktree ${entry.worktree} has uncommitted changes`);
        removeWorktree(repoDir, worktree);
      }
      const target = git(repoDir, ["symbolic-ref", "--short", "HEAD"]).out;
      if (target === branch) throw new OrchidError(`cannot merge ${branch} into itself`);
      const tip = git(repoDir, ["rev-parse", branch]).out;
      if (isAncestor(repoDir, tip)) {
        deleteBranch(repoDir, branch);
        markMerged(state, wave, entry);
        wavePromptEvent(root, config, state, "wave.merged", wave, {
          waveId: wave.id,
          promptId: entry.id,
          branch,
          tip,
        });
        touchedRepos.set(repoDir, repo);
        continue;
      }
      entry.branchTip = tip;
      entry.merging = true;
      wavePromptEvent(root, config, state, "wave.merging", wave, {
        waveId: wave.id,
        promptId: entry.id,
        branch,
        tip,
      });
      const merge = git(repoDir, [...MERGE_IDENTITY, "merge", "--no-ff", "--no-edit", branch], {
        allowFailure: true,
      });
      if (merge.code !== 0) {
        git(repoDir, ["merge", "--abort"], { allowFailure: true });
        entry.merging = false;
        const detail = merge.err || merge.out || "unknown merge error";
        throw new OrchidError(
          `merge conflict for ${entry.id} (${branch}): ${detail}; ` +
            `merge ${branch} into ${repoDir} manually, ` +
            `then rerun \`orchid-sdd wave reconcile ${wave.number}\``,
        );
      }
      deleteBranch(repoDir, branch);
      markMerged(state, wave, entry);
      wavePromptEvent(root, config, state, "wave.merged", wave, {
        waveId: wave.id,
        promptId: entry.id,
        branch,
        tip,
      });
      touchedRepos.set(repoDir, repo);
    }
  } catch (error) {
    wave.status = "failed";
    wave.error = error.message;
    wave.failedAt = nowIso();
    waveEvent(root, config, state, "wave.failed", wave);
    throw error;
  }

  if (args.test) {
    for (const [repoDir, repo] of touchedRepos.entries()) {
      const command = repoTestCommand(config, repo);
      if (!command) continue;
      const result = spawnSync(command, { cwd: repoDir, shell: true, encoding: "utf8", timeout: 0 });
      if (result.status !== 0) {
        wave.status = "failed";
        wave.error = `tests failed in ${repoDir}`;
        wave.failedAt = nowIso();
        waveEvent(root, config, state, "wave.failed", wave);
        throw new OrchidError(`wave tests failed in ${repoDir}: ${(result.stderr || result.stdout || "").trim()}`);
      }
    }
  }

  wave.status = "done";
  wave.reconciledAt = nowIso();
  wave.error = null;
  detachWave(state, wave);
  waveEvent(root, config, state, "wave.reconciled", wave);
  writeProjection(root, config, state);
  return wave;
}

export function waveCommand(root, args = {}) {
  const action = String(args.action || "status");
  const number = args.wave ? waveNumber(args.wave) : null;
  if (!["start", "status", "reconcile", "abort"].includes(action)) {
    throw new OrchidError(`unknown wave action "${action}" (expected start, status, reconcile, abort)`);
  }
  if (action === "status") {
    const { config } = loadConfig(root);
    const state = readState(root);
    const activeWaves = Object.values(state.currentWaves || {});
    const lastWave = state.lastWave &&
      (!state.activeIteration || state.lastWave.iteration === state.activeIteration)
      ? state.lastWave
      : null;
    let waves;
    if (number) {
      const wanted = waveId(number);
      const activeMatch = activeWaves.find((wave) => wave.id === wanted);
      waves = activeMatch ? [activeMatch] : lastWave?.id === wanted ? [lastWave] : [];
    } else {
      waves = activeWaves.length ? activeWaves : lastWave ? [lastWave] : [];
    }
    if (!waves.length) {
      if (args.json) process.stdout.write(`${formatJson({ waves: [], activePrompts: {} })}\n`);
      else process.stdout.write("No wave recorded.\n");
      return 0;
    }
    const matrix = (() => {
      try { return readMatrix(root, config, state); } catch { return { prompts: [] }; }
    })();
    const rows = waves.map((wave) => ({
      ...wave,
      prompts: (wave.prompts || []).map((entry) => ({
        ...entry,
        status: matrixPrompt(matrix, entry.id)?.status || entry.status,
        active: Boolean(state.activePrompts?.[entry.id]),
        worktreeExists: entry.worktree ? exists(path.join(root, entry.worktree)) : false,
      })),
    }));
    if (args.json) {
      process.stdout.write(`${formatJson({ waves: rows, activePrompts: state.activePrompts })}\n`);
      return 0;
    }
    for (const wave of rows) {
      process.stdout.write(`Wave ${wave.id}  ${wave.status}\n`);
      for (const row of wave.prompts) {
        process.stdout.write(
          `  ${row.id}  ${String(row.status).padEnd(12)} ${row.active ? "active" : "      "} ${row.worktree || "—"}\n`,
        );
      }
    }
    return 0;
  }
  if (!number && action !== "abort") throw new OrchidError(`wave ${action} requires a wave number (e.g. W4)`);
  return withStateLock(
    root,
    () => {
      const { config } = loadConfig(root);
      const state = readState(root);
      if (action === "start") {
        const wave = startWave(root, config, state, number, args);
        if (args.json) {
          process.stdout.write(`${formatJson(wave)}\n`);
        } else {
          process.stdout.write(`Started wave ${wave.id}\n`);
          for (const entry of wave.prompts) {
            process.stdout.write(`  ${entry.id}  ${entry.worktree}\n`);
          }
          process.stdout.write("Start prompts with `orchid-sdd prompt start <id>`; max_parallel is enforced by the CLI.\n");
        }
        return 0;
      }
      if (action === "reconcile") {
        const wave = reconcileWave(root, config, state, number, args);
        if (args.json) process.stdout.write(`${formatJson(wave)}\n`);
        else process.stdout.write(`Reconciled wave ${wave.id}\n`);
        return 0;
      }

      const wave = number ? state.currentWaves?.[waveId(number)] : state.currentWave;
      if (!wave) {
        throw new OrchidError(
          number ? `wave ${waveId(number)} is not active` : "no active wave to abort",
        );
      }
      const wavePrompts = wave.prompts || [];
      const cleanups = wavePrompts.map((entry) => ({
        entry,
        repo: repoForEntry(root, config, entry),
      }));
      for (const { entry, repo } of cleanups) {
        removeWorktree(repo.repoDir, entry.worktree ? path.join(root, entry.worktree) : null);
        deleteBranch(repo.repoDir, entry.branch);
      }
      wave.status = "aborted";
      wave.abortedAt = nowIso();
      wave.error = null;

      const promptStatuses = {};
      const runStatuses = {};
      for (const entry of wavePrompts) {
        delete state.activePrompts?.[entry.id];
        const prompt = state.prompts?.[entry.id];
        if (prompt) {
          prompt.status = "failed";
          prompt.updatedAt = wave.abortedAt;
          promptStatuses[entry.id] = "failed";
          const run = state.runs?.[prompt.runId];
          if (run) {
            run.status = "failed";
            run.completedAt = wave.abortedAt;
            runStatuses[run.id] = "failed";
          }
        }
      }
      detachWave(state, wave);
      setMatrixStatus(root, config, state, wavePrompts.map((entry) => entry.id), "failed");
      waveEvent(root, config, state, "wave.aborted", wave, { promptStatuses, runStatuses });
      writeProjection(root, config, state);
      process.stdout.write(`Aborted wave ${wave.id}\n`);
      return 0;
    },
    { purpose: `wave ${action}${number ? ` ${number}` : ""}`, ttlMs: 30 * 60 * 1000 },
  );
}
