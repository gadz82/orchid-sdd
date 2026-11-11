import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cli,
  git,
  initRepo,
  iterationDir,
  makeWorkspace,
  readJson,
  ROOT,
  setup,
  start,
  TITLE,
  tmp,
} from "./helpers.mjs";
import { acquireStateLock } from "../cli/lock.mjs";

function commit(root, message) {
  git(root, "add", "-A");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", message);
}

function prepare(root, { prompts = 2, maxParallel = 4, sharedScope = false } = {}) {
  setup(root);
  initRepo(root, {}, "initial");
  start(root, TITLE);
  commit(root, "iteration");

  const stateFile = path.join(root, ".orchid", "state.json");
  const state = readJson(stateFile);
  state.phase = "build";
  for (const gate of ["G1", "G2", "G3", "G4"]) state.gates[gate] = "passed";
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  const configFile = path.join(root, "orchid-sdd.yml");
  const configText = fs.readFileSync(configFile, "utf8").replace(
    /max_parallel: [0-9]+/,
    `max_parallel: ${maxParallel}`,
  );
  fs.writeFileSync(configFile, configText);

  const iteration = iterationDir(root);
  const plans = [];
  for (let i = 1; i <= prompts; i += 1) {
    const id = `P-00${i}`;
    plans.push({
      id,
      title: `Wave prompt ${i}`,
      type: "build",
      wave: 1,
      depends_on: [],
      personas: ["DEV"],
      scope: {
        write: [sharedScope ? (i % 2 ? "./src/shared.txt" : "src/shared.txt") : `src/p${i}.txt`],
      },
      acceptance: ["true"],
    });
  }
  const plan = { iteration: path.basename(iteration), prompts: plans };
  fs.mkdirSync(path.join(iteration, "plan", "prompts"), { recursive: true });
  fs.writeFileSync(path.join(iteration, "plan", "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(
    path.join(iteration, "plan", "matrix.json"),
    `${JSON.stringify({ prompts: plans.map(({ id }) => ({ id, status: "planned" })) }, null, 2)}\n`,
  );
  for (const item of plans) {
    fs.writeFileSync(
      path.join(iteration, "plan", "prompts", `${item.id}.md`),
      `---\nid: ${item.id}\ntype: build\ntitle: ${item.title}\nwave: 1\ndepends_on: []\npersonas: [DEV]\nscope:\n  write:\n    - ${item.scope.write[0]}\nacceptance: []\n---\n`,
    );
  }
  commit(root, "plan");
  return { root, iteration, stateFile, plans };
}

function commitChange(root, worktree, file, value) {
  const target = path.join(root, worktree, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${value}\n`);
  git(path.join(root, worktree), "add", "-A");
  git(
    path.join(root, worktree),
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "commit", "-q", "-m", value,
  );
}

function addPrompt(iteration, item) {
  const planFile = path.join(iteration, "plan", "plan.json");
  const matrixFile = path.join(iteration, "plan", "matrix.json");
  const plan = readJson(planFile);
  plan.prompts.push(item);
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  const matrix = readJson(matrixFile);
  matrix.prompts.push({ id: item.id, status: "planned" });
  fs.writeFileSync(matrixFile, `${JSON.stringify(matrix, null, 2)}\n`);
  fs.writeFileSync(
    path.join(iteration, "plan", "prompts", `${item.id}.md`),
    `---\nid: ${item.id}\ntype: ${item.type || "build"}\ntitle: ${item.title}\nwave: ${item.wave}\ndepends_on: ${JSON.stringify(item.depends_on || [])}\npersonas: [DEV]\nscope:\n  write:\n    - ${item.scope.write[0]}\nacceptance: []\n---\n`,
  );
}

test("wave start creates isolated worktrees and allows multiple active prompts", () => {
  const { root } = prepare(tmp(), { prompts: 3 });
  const wave = cli(root, "wave", "start", "1", "--json");
  assert.equal(wave.code, 0, wave.all);
  const data = JSON.parse(wave.out);
  assert.equal(data.status, "running");
  assert.equal(data.prompts.length, 3);
  for (const prompt of data.prompts) {
    assert.ok(fs.existsSync(path.join(root, prompt.worktree)), prompt.worktree);
    if (prompt.id !== data.prompts[0].id) {
      assert.notEqual(prompt.worktree, data.prompts[0].worktree);
    }
  }

  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-002").code, 0);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(Object.keys(state.activePrompts).length, 2);
  assert.equal(state.prompts["P-001"].worktree !== undefined, true);

  const resumed = cli(root, "resume");
  assert.equal(resumed.code, 0, resumed.all);
  const rebuilt = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(Object.keys(rebuilt.activePrompts).length, 2);
  assert.equal(Object.keys(rebuilt.currentWaves).length, 1);
});

test("wave enforces max_parallel", () => {
  const { root } = prepare(tmp(), { prompts: 2, maxParallel: 1 });
  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  const second = cli(root, "prompt", "start", "P-002");
  assert.equal(second.code, 1, second.all);
  assert.match(second.all, /max_parallel is 1/);
});

test("wave start refuses uncommitted code unless --allow-dirty", () => {
  const { root } = prepare(tmp(), { prompts: 2 });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "dirty.txt"), "dirty\n");
  const blocked = cli(root, "wave", "start", "1");
  assert.equal(blocked.code, 1, blocked.all);
  assert.match(blocked.all, /clean code tree required before wave start/);
  const allowed = cli(root, "wave", "start", "1", "--allow-dirty");
  assert.equal(allowed.code, 0, allowed.all);
});

test("wave rejects overlapping write scopes", () => {
  const { root } = prepare(tmp(), { prompts: 2, sharedScope: true });
  const result = cli(root, "wave", "start", "1");
  assert.equal(result.code, 1, result.all);
  assert.match(result.all, /overlapping write scopes/);
});

test("wave reconcile merges committed branches and cleans worktrees", () => {
  const { root } = prepare(tmp(), { prompts: 2 });
  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-002").code, 0);

  const state = readJson(path.join(root, ".orchid", "state.json"));
  for (const prompt of state.currentWave.prompts) {
    commitChange(root, prompt.worktree, `src/${prompt.id}.txt`, prompt.id);
  }
  assert.equal(cli(root, "prompt", "complete", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "complete", "P-002").code, 0);

  const blockedG5 = cli(root, "gate", "pass", "G5", "--note", "premature");
  assert.equal(blockedG5.code, 1, blockedG5.all);
  assert.match(blockedG5.all, /wave W1 is still active/);

  const reconciled = cli(root, "wave", "reconcile", "1", "--json");
  assert.equal(reconciled.code, 0, reconciled.all);
  assert.equal(JSON.parse(reconciled.out).status, "done");
  assert.ok(fs.existsSync(path.join(root, "src", "P-001.txt")));
  assert.ok(fs.existsSync(path.join(root, "src", "P-002.txt")));
  for (const prompt of state.currentWave.prompts) {
    assert.equal(fs.existsSync(path.join(root, prompt.worktree)), false);
    const branchCheck = spawnSync(
      "git",
      ["-C", root, "show-ref", "--verify", "--quiet", `refs/heads/${prompt.branch}`],
      { encoding: "utf8" },
    );
    assert.equal(branchCheck.status, 1);
  }
  const after = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(after.currentWave, null);
  assert.equal(after.lastWave.status, "done");
  assert.deepEqual(after.activePrompts, {});

  // The integration branch is long-lived and must not count as a leftover
  // prompt branch at G5.
  git(root, "branch", `orchid/${after.activeIteration}/integration`);
  const g5 = cli(root, "gate", "pass", "G5", "--note", "reviewed");
  assert.equal(g5.code, 0, g5.all);
});

test("independent waves can be active on the same root and reconcile separately", () => {
  const { root, iteration } = prepare(tmp(), { prompts: 2 });
  addPrompt(iteration, {
    id: "P-003",
    title: "Second wave prompt",
    type: "build",
    wave: 2,
    depends_on: [],
    scope: { write: ["src/p3.txt"] },
    acceptance: [],
  });
  commit(root, "second wave plan");

  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "wave", "start", "2").code, 0);
  let state = readJson(path.join(root, ".orchid", "state.json"));
  assert.deepEqual(Object.keys(state.currentWaves).sort(), ["W1", "W2"]);

  for (const id of ["P-001", "P-002"]) assert.equal(cli(root, "prompt", "start", id).code, 0);
  const firstWave = readJson(path.join(root, ".orchid", "state.json")).currentWaves.W1;
  for (const prompt of firstWave.prompts) {
    commitChange(root, prompt.worktree, `src/${prompt.id}.txt`, prompt.id);
  }
  assert.equal(cli(root, "prompt", "complete", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "complete", "P-002").code, 0);

  assert.equal(cli(root, "prompt", "start", "P-003").code, 0);
  const firstReconcile = cli(root, "wave", "reconcile", "1", "--json");
  assert.equal(firstReconcile.code, 0, firstReconcile.all);
  state = readJson(path.join(root, ".orchid", "state.json"));
  assert.deepEqual(Object.keys(state.currentWaves), ["W2"]);
  assert.ok(state.activePrompts["P-003"]);

  const secondWave = state.currentWaves.W2;
  commitChange(root, secondWave.prompts[0].worktree, "src/p3.txt", "third");
  assert.equal(cli(root, "prompt", "complete", "P-003").code, 0);
  const secondReconcile = cli(root, "wave", "reconcile", "2", "--json");
  assert.equal(secondReconcile.code, 0, secondReconcile.all);
  assert.equal(readJson(path.join(root, ".orchid", "state.json")).currentWave, null);
});

test("a dependent wave waits for its prerequisite wave to reconcile", () => {
  const { root, iteration } = prepare(tmp(), { prompts: 2 });
  addPrompt(iteration, {
    id: "P-003",
    title: "Dependent wave prompt",
    type: "build",
    wave: 2,
    depends_on: ["P-001"],
    scope: { write: ["src/p3.txt"] },
    acceptance: [],
  });
  commit(root, "second wave plan");

  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  const first = readJson(path.join(root, ".orchid", "state.json")).currentWave.prompts.find(
    (entry) => entry.id === "P-001",
  );
  commitChange(root, first.worktree, "src/p1.txt", "first");
  assert.equal(cli(root, "prompt", "complete", "P-001").code, 0);

  const blocked = cli(root, "wave", "start", "2");
  assert.equal(blocked.code, 1, blocked.all);
  assert.match(blocked.all, /depends on P-001 in active wave W1/);

  assert.equal(cli(root, "prompt", "start", "P-002").code, 0);
  assert.equal(cli(root, "prompt", "waive", "P-002", "--note", "not needed").code, 0);
  assert.equal(cli(root, "wave", "reconcile", "1").code, 0);
  const started = cli(root, "wave", "start", "2");
  assert.equal(started.code, 0, started.all);
});

test("a failed reconcile can be retried without re-merging completed prompts", () => {
  const { root } = prepare(tmp(), { prompts: 2 });
  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-002").code, 0);
  let state = readJson(path.join(root, ".orchid", "state.json"));
  for (const entry of state.currentWave.prompts) {
    // Deliberately edit a path outside the declared scope to force a conflict.
    commitChange(root, entry.worktree, "src/shared.txt", entry.id);
  }
  assert.equal(cli(root, "prompt", "complete", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "complete", "P-002").code, 0);

  const first = cli(root, "wave", "reconcile", "1", "--json");
  assert.equal(first.code, 1, first.all);
  assert.match(first.all, /merge conflict/);
  state = readJson(path.join(root, ".orchid", "state.json"));
  const failed = state.currentWaves.W1;
  assert.equal(failed.status, "failed");
  assert.equal(failed.prompts.find((entry) => entry.id === "P-001").merged, true);
  const second = failed.prompts.find((entry) => entry.id === "P-002");
  assert.equal(second.merged, undefined);
  assert.ok(second.branchTip);

  git(
    root,
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "merge", "--no-ff", "--no-edit", "-X", "ours", second.branch,
  );
  git(root, "branch", "-D", second.branch);
  const retried = cli(root, "wave", "reconcile", "1", "--json");
  assert.equal(retried.code, 0, retried.all);
  assert.equal(JSON.parse(retried.out).status, "done");
  state = readJson(path.join(root, ".orchid", "state.json"));
  assert.equal(state.currentWave, null);
  assert.equal(state.lastWave.status, "done");
});

test("wave reconciliation reruns tests after a failed test attempt", () => {
  const { root } = prepare(tmp(), { prompts: 2 });
  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-002").code, 0);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  for (const entry of state.currentWave.prompts) {
    commitChange(root, entry.worktree, `src/${entry.id}.txt`, entry.id);
  }
  assert.equal(cli(root, "prompt", "complete", "P-001").code, 0);
  assert.equal(cli(root, "prompt", "complete", "P-002").code, 0);

  const configFile = path.join(root, "orchid-sdd.yml");
  const failing = fs.readFileSync(configFile, "utf8").replace(/unit: .*/g, "unit: \"false\"");
  fs.writeFileSync(configFile, failing);
  const first = cli(root, "wave", "reconcile", "1", "--test", "--json");
  assert.equal(first.code, 1, first.all);
  assert.match(first.all, /wave tests failed/);
  const failed = readJson(path.join(root, ".orchid", "state.json")).currentWaves.W1;
  assert.equal(failed.status, "failed");
  assert.ok(failed.prompts.every((entry) => entry.merged));

  fs.writeFileSync(configFile, failing.replace(/unit: .*/g, "unit: \"true\""));
  const retried = cli(root, "wave", "reconcile", "1", "--test", "--json");
  assert.equal(retried.code, 0, retried.all);
  assert.equal(JSON.parse(retried.out).status, "done");
});

test("wave abort cleans worktrees, fails prompts, and survives resume", () => {
  const { root } = prepare(tmp(), { prompts: 2 });
  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  const before = readJson(path.join(root, ".orchid", "state.json")).currentWave;
  const aborted = cli(root, "wave", "abort", "1", "--json");
  assert.equal(aborted.code, 0, aborted.all);

  let state = readJson(path.join(root, ".orchid", "state.json"));
  assert.deepEqual(state.currentWaves, {});
  assert.equal(state.currentWave, null);
  assert.equal(state.lastWave.status, "aborted");
  assert.deepEqual(state.activePrompts, {});
  assert.equal(state.prompts["P-001"].status, "failed");
  assert.equal(state.runs[state.prompts["P-001"].runId].status, "failed");
  const matrix = readJson(path.join(iterationDir(root), "plan", "matrix.json"));
  assert.equal(matrix.prompts.find((entry) => entry.id === "P-001").status, "failed");
  for (const entry of before.prompts) {
    assert.equal(fs.existsSync(path.join(root, entry.worktree)), false);
    const branchCheck = spawnSync(
      "git",
      ["-C", root, "show-ref", "--verify", "--quiet", `refs/heads/${entry.branch}`],
      { encoding: "utf8" },
    );
    assert.equal(branchCheck.status, 1);
  }

  assert.equal(cli(root, "resume").code, 0);
  state = readJson(path.join(root, ".orchid", "state.json"));
  assert.deepEqual(state.currentWaves, {});
  assert.equal(state.lastWave.status, "aborted");
  assert.deepEqual(state.activePrompts, {});
  assert.equal(state.prompts["P-001"].status, "failed");
  assert.equal(state.runs[state.prompts["P-001"].runId].status, "failed");
});

test("wave isolation works for a prompt inside a workspace repository", () => {
  const root = makeWorkspace();
  assert.equal(cli(root, "setup", "--workspace", "--yes", "--profile", "monorepo").code, 0);
  commit(path.join(root, "pkg-a"), "workspace fragment");
  const started = cli(root, "start", TITLE, "--allow-dirty");
  assert.equal(started.code, 0, started.all);
  commit(root, "iteration");

  const stateFile = path.join(root, ".orchid", "state.json");
  const state = readJson(stateFile);
  state.phase = "build";
  for (const gate of ["G1", "G2", "G3", "G4"]) state.gates[gate] = "passed";
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);

  const iteration = iterationDir(root);
  const plan = {
    iteration: path.basename(iteration),
    prompts: [
      {
        id: "P-001",
        title: "Add a workspace health endpoint",
        type: "build",
        repo: "pkg-a",
        wave: 1,
        depends_on: [],
        personas: ["DEV"],
        scope: { write: ["pkg-a/src/health.py"] },
        acceptance: ["true"],
      },
    ],
  };
  fs.mkdirSync(path.join(iteration, "plan", "prompts"), { recursive: true });
  fs.writeFileSync(path.join(iteration, "plan", "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(
    path.join(iteration, "plan", "matrix.json"),
    `${JSON.stringify({ prompts: [{ id: "P-001", status: "planned" }] }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(iteration, "plan", "prompts", "P-001.md"),
    "---\nid: P-001\ntype: build\ntitle: Add a workspace health endpoint\nrepo: pkg-a\nwave: 1\ndepends_on: []\npersonas: [DEV]\nscope:\n  write:\n    - pkg-a/src/health.py\nacceptance: []\n---\n",
  );
  commit(root, "workspace plan");

  const waveResult = cli(root, "wave", "start", "1", "--json");
  assert.equal(waveResult.code, 0, waveResult.all);
  const wave = JSON.parse(waveResult.out);
  assert.equal(wave.prompts[0].repoId, "pkg-a");
  assert.ok(fs.existsSync(path.join(root, wave.prompts[0].worktree)));

  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  commitChange(root, wave.prompts[0].worktree, "src/health.py", "ok");
  assert.equal(cli(root, "prompt", "complete", "P-001").code, 0);
  const reconciled = cli(root, "wave", "reconcile", "1", "--json");
  assert.equal(reconciled.code, 0, reconciled.all);
  assert.ok(fs.existsSync(path.join(root, "pkg-a", "src", "health.py")));
  const branchCheck = spawnSync(
    "git",
    ["-C", path.join(root, "pkg-a"), "show-ref", "--verify", "--quiet", `refs/heads/${wave.prompts[0].branch}`],
    { encoding: "utf8" },
  );
  assert.equal(branchCheck.status, 1);
});

test("spike prompts copy findings and never merge their code", () => {
  const { root, iteration } = prepare(tmp(), { prompts: 0 });
  addPrompt(iteration, {
    id: "P-001",
    title: "Spike the storage options",
    type: "spike",
    wave: 1,
    depends_on: [],
    scope: { write: ["src/spike-code.txt"] },
    acceptance: [],
  });
  commit(root, "spike plan");

  assert.equal(cli(root, "wave", "start", "1").code, 0);
  assert.equal(cli(root, "prompt", "start", "P-001").code, 0);
  const state = readJson(path.join(root, ".orchid", "state.json"));
  const entry = state.currentWave.prompts[0];
  assert.equal(entry.type, "spike");
  assert.match(entry.branch, /^spike\/P-001$/);

  const worktree = path.join(root, entry.worktree);
  fs.mkdirSync(path.join(worktree, "src"), { recursive: true });
  fs.writeFileSync(path.join(worktree, "src", "spike-code.txt"), "throwaway\n");
  const reportDir = path.join(
    worktree,
    ".knowledge",
    "iterations",
    state.activeIteration,
    "assessment",
    "spikes",
  );
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "P-001.md"), "# Findings\n\nUse SQLite.\n");
  assert.equal(cli(root, "prompt", "complete", "P-001").code, 0);

  const reconciled = cli(root, "wave", "reconcile", "1", "--json");
  assert.equal(reconciled.code, 0, reconciled.all);
  assert.ok(
    fs.existsSync(path.join(
      iteration,
      "assessment",
      "spikes",
      "P-001.md",
    )),
  );
  assert.equal(fs.existsSync(path.join(root, "src", "spike-code.txt")), false);
  const branchCheck = spawnSync(
    "git",
    ["-C", root, "show-ref", "--verify", "--quiet", "refs/heads/spike/P-001"],
    { encoding: "utf8" },
  );
  assert.equal(branchCheck.status, 1);
});

test("state lease is reentrant, blocks another process, and reclaims stale leases", () => {
  const root = tmp();
  const lockFile = path.join(root, ".orchid", "locks", "state.lock");
  const first = acquireStateLock(root, { purpose: "test-first", ttlMs: 5000, timeoutMs: 100 });
  const nested = acquireStateLock(root, { purpose: "test-nested", timeoutMs: 100 });
  assert.equal(nested.lease.token, first.lease.token);
  nested.release();
  assert.equal(fs.existsSync(lockFile), true, "inner release must not drop the outer lease");

  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { acquireStateLock } from ${JSON.stringify(path.join(ROOT, "cli", "lock.mjs"))};` +
        `try { acquireStateLock(${JSON.stringify(root)}, { purpose: "child", timeoutMs: 80 }); process.exit(0); }` +
        `catch (error) { process.stderr.write(error.message); process.exit(1); }`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 1, child.stderr);
  assert.match(child.stderr, /state is locked/);
  first.release();
  assert.equal(fs.existsSync(lockFile), false);

  fs.writeFileSync(
    lockFile,
    `${JSON.stringify({
      token: "expired",
      pid: 999999,
      host: "other-host",
      purpose: "expired-test",
      expiresAt: "2000-01-01T00:00:00Z",
    }, null, 2)}\n`,
  );
  const reclaimed = acquireStateLock(root, { purpose: "test-reclaimed", timeoutMs: 100 });
  assert.equal(reclaimed.lease.purpose, "test-reclaimed");
  reclaimed.release();

  fs.writeFileSync(
    lockFile,
    `${JSON.stringify({
      token: "own-pid",
      pid: process.pid,
      host: os.hostname(),
      purpose: "stale-own-pid",
      expiresAt: "2000-01-01T00:00:00Z",
    }, null, 2)}\n`,
  );
  const ownPid = acquireStateLock(root, { purpose: "reclaimed-own-pid", timeoutMs: 100 });
  assert.equal(ownPid.lease.purpose, "reclaimed-own-pid");
  ownPid.release();
});
