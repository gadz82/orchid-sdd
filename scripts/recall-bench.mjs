#!/usr/bin/env node
// Synthetic recall benchmark. Generates a long closed-iteration history,
// rebuilds the recall index, and measures build time, index size, recall
// latency (p50/p95), hydrated snapshot count, and heap.
//
// Not part of `npm test`; run manually with:
//   node scripts/recall-bench.mjs [--iterations 100] [--nodes 500] [--runs 20]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "orchid-sdd.mjs");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

const ITERATIONS = arg("--iterations", 100);
const NODES = arg("--nodes", 500);
const RUNS = arg("--runs", 20);

function hexId(n) {
  return n.toString(16).padStart(32, "0");
}

function nodeId(iteration, j) {
  return `urn:uuid:${hexId(iteration * NODES + j)}`;
}

function iso(offsetSeconds) {
  return new Date(Date.UTC(2026, 0, 1) + offsetSeconds * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}

function cli(root, ...args) {
  const r = spawnSync(process.execPath, [BIN, "--root", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, ORCHID_DEBUG: "", ORCHID_RECALL_STATS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status, out: r.stdout || "", err: r.stderr || "" };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function report(name, values) {
  const p50 = percentile(values, 50).toFixed(1);
  const p95 = percentile(values, 95).toFixed(1);
  const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  return { name, runs: values.length, avg: `${avg}ms`, p50: `${p50}ms`, p95: `${p95}ms` };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orchid-bench-"));

  const setup = cli(root, "setup", "--yes", "--profile", "backend");
  if (setup.code !== 0) {
    process.stderr.write(`setup failed: ${setup.out}${setup.err}\n`);
    process.exit(1);
  }

  const knowledge = path.join(root, ".knowledge");
  const eventsDir = path.join(knowledge, "events");
  const iterationsDir = path.join(knowledge, "iterations");

  console.log(`Generating ${ITERATIONS} iterations x ${NODES} nodes ...`);
  let events = "";
  let offset = 0;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const iterId = `bench-${String(i).padStart(3, "0")}`;
    events += `${JSON.stringify({
      type: "iteration.started",
      iteration: iterId,
      ts: iso(offset++),
      actor: "bench",
      subject: `urn:orchid:iteration:${iterId}`,
      payload: { id: iterId, title: `Benchmark iteration ${i}` },
    })}\n`;

    const nodes = [];
    for (let j = 0; j < NODES; j += 1) {
      const node = {
        "@id": nodeId(i, j),
        "@type": "orchid:Requirement",
        description: `Benchmark requirement ${i}-${j} to sign in users with a passkey.`,
        status: "accepted",
        topics: ["shared", `group-${i}`, `t-${j % 10}`],
        aliases: [`R-${i}-${j}`],
        provenance: { phase: "build", persona: "bench", run: null },
        createdAt: iso(offset),
        updatedAt: iso(offset),
        iteration: iterId,
        scope: "iteration",
      };
      // Chain relations so --hops 2 traverses reverse links.
      if (j > 0) node.relations = [{ predicate: "partOf", target: nodeId(i, j - 1) }];
      offset += 1;
      nodes.push(node);
      events += `${JSON.stringify({
        type: "node.recorded",
        iteration: iterId,
        ts: iso(offset),
        actor: "bench",
        subject: node["@id"],
        payload: { node },
      })}\n`;
    }
    events += `${JSON.stringify({
      type: "iteration.closed",
      iteration: iterId,
      ts: iso(offset++),
      actor: "bench",
      subject: `urn:orchid:iteration:${iterId}`,
      payload: { id: iterId, status: "closed", closedAt: iso(offset) },
    })}\n`;

    const snapshot = {
      "@context": "context/orchid-v1.jsonld",
      "@id": `urn:orchid:iteration:${iterId}`,
      "@type": "orchid:IterationSnapshot",
      schemaVersion: "1.0.0",
      generatedAt: iso(offset),
      iteration: { "@id": `urn:orchid:iteration:${iterId}`, title: `Benchmark iteration ${i}`, status: "closed" },
      nodes,
    };
    fs.mkdirSync(path.join(iterationsDir, iterId), { recursive: true });
    fs.writeFileSync(
      path.join(iterationsDir, iterId, "iteration.jsonld"),
      `${JSON.stringify(snapshot)}\n`,
    );
  }
  fs.writeFileSync(path.join(eventsDir, "bench.jsonl"), events);

  const heapAfterGen = process.memoryUsage().heapUsed / (1024 * 1024);

  console.log("Building recall index ...");
  const t0 = Date.now();
  const indexRun = cli(root, "index");
  const buildMs = Date.now() - t0;
  if (indexRun.code !== 0) {
    process.stderr.write(`index failed: ${indexRun.out}${indexRun.err}\n`);
    process.exit(1);
  }

  const recallFile = path.join(knowledge, "index", "recall.json");
  const recallBytes = fs.statSync(recallFile).size;
  const recallIndex = JSON.parse(fs.readFileSync(recallFile, "utf8"));

  function timeRecall(query, mode, extra = []) {
    const args = ["recall", query, "--history", mode, "--limit", "20", "--json", ...extra];
    const t = Date.now();
    const r = cli(root, ...args);
    return { ms: Date.now() - t, stats: r.err.trim(), code: r.code, out: r.out };
  }

  const queries = [
    ["topic", "shared"],
    ["alias", "R-0-0"],
    ["description", "sign in"],
  ];

  console.log(`\nRecall latency (${RUNS} runs each):`);
  const results = [];
  for (const [kind, query] of queries) {
    for (const mode of ["recent", "all"]) {
      const times = [];
      let lastStats = "";
      for (let n = 0; n < RUNS; n += 1) {
        const r = timeRecall(query, mode);
        if (r.code !== 0) {
          process.stderr.write(`recall ${query} ${mode} failed: ${r.out}\n`);
          process.exit(1);
        }
        times.push(r.ms);
        lastStats = r.stats;
      }
      const summary = report(`${kind} "${query}" (${mode})`, times);
      results.push(summary);
      console.log(`  ${summary.name}: avg ${summary.avg}  p50 ${summary.p50}  p95 ${summary.p95}  ${lastStats}`);
    }
  }

  // Exact id/alias hydration for a historical node far outside the recent window.
  const farAlias = `R-${ITERATIONS - 1}-0`;
  const far = timeRecall(farAlias, "recent");
  console.log(`  exact alias "${farAlias}" (recent): ${far.ms}ms  ${far.stats}`);

  // --hops 2 traverses reverse relations over the incomingRelations map.
  const hopsTimes = [];
  for (let n = 0; n < RUNS; n += 1) hopsTimes.push(timeRecall("R-0-0", "all", ["--hops", "2"]).ms);
  const hops = report(`alias "R-0-0" (all, --hops 2)`, hopsTimes);
  results.push(hops);
  console.log(`  ${hops.name}: avg ${hops.avg}  p50 ${hops.p50}  p95 ${hops.p95}`);

  // record with long history: must not rebuild/rewrite recall.json.
  const recallMtimeBefore = fs.statSync(recallFile).mtimeMs;
  const recordStart = Date.now();
  const rec = cli(root, "record", "--type", "Requirement", "--alias", "R-bench",
    "--description", "A newly recorded benchmark requirement.", "--topics", "shared,new,bench",
    "--scope", "project");
  const recordMs = Date.now() - recordStart;
  const recallRewritten = fs.statSync(recallFile).mtimeMs !== recallMtimeBefore;
  const recordOk = rec.code === 0;

  console.log("\n--- summary ---");
  console.log(JSON.stringify({
    iterations: ITERATIONS,
    nodes: ITERATIONS * NODES,
    indexBytes: recallBytes,
    indexBytesReadable: `${(recallBytes / (1024 * 1024)).toFixed(2)} MB`,
    indexedNodes: recallIndex.nodes.length,
    historyEntries: recallIndex.history.length,
    termsKeys: Object.keys(recallIndex.terms).length,
    incomingRelationsKeys: Object.keys(recallIndex.incomingRelations || {}).length,
    buildMs,
    recordMs,
    recordOk,
    recallRewrittenByRecord: recallRewritten,
    heapAfterGenMB: heapAfterGen.toFixed(1),
    results,
  }, null, 2));

  fs.rmSync(root, { recursive: true, force: true });
}

main();
