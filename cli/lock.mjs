import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OrchidError, ensureDir, exists, nowIso, readJson, uuid7 } from "./util.mjs";

const DEFAULT_LOCK_TIMEOUT_MS = Number(process.env.ORCHID_LOCK_TIMEOUT_MS || 30000);
const DEFAULT_LEASE_MS = 30000;

// A CLI process is synchronous, so nested acquisitions in the same process are
// reentrant. This keeps every mutation path guarded without deadlocking helper
// functions that compose (setup -> migrate, resume -> handoff, event writes).
const held = new Map();

function pause(ms) {
  // Synchronous CLI processes need a short, dependency-free wait.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function lockFile(root) {
  return path.join(root, ".orchid", "locks", "state.lock");
}

function readLease(file) {
  if (!exists(file)) return null;
  try {
    const lease = readJson(file);
    return lease && typeof lease === "object" ? lease : null;
  } catch {
    return null;
  }
}

function removeLease(file, token) {
  const current = readLease(file);
  if (current && current.token === token) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* a stale/removed lease is already released */
    }
  }
}

function leaseExpired(lease) {
  if (!lease || !lease.expiresAt) return true;
  const expires = Date.parse(lease.expiresAt);
  return !Number.isFinite(expires) || expires <= Date.now();
}

function leaseOwnerDead(lease) {
  return Boolean(
    lease &&
      lease.host === os.hostname() &&
      lease.pid !== process.pid &&
      !processAlive(Number(lease.pid)),
  );
}

function reentrantHandle(key, existing) {
  existing.depth += 1;
  let released = false;
  return {
    file: existing.file,
    lease: existing.lease,
    reentrant: true,
    release() {
      if (released) return;
      released = true;
      existing.depth -= 1;
      if (existing.depth === 0) {
        held.delete(key);
        removeLease(existing.file, existing.lease.token);
      }
    },
  };
}

/**
 * Acquire the single state lease for a project root.
 *
 * The lock is an atomically-created JSON file with an owner, PID, host and
 * expiry. A crashed process is recovered when its PID is gone, when a stale
 * same-PID file is found, or when the lease expires on another host. Waiting is
 * bounded and reported with a useful owner/purpose. Reentrant calls in the same
 * process share the same lease and release it only when the outer call returns.
 */
export function acquireStateLock(root, options = {}) {
  const key = path.resolve(root);
  const existing = held.get(key);
  if (existing) return reentrantHandle(key, existing);

  const file = lockFile(root);
  ensureDir(path.dirname(file));
  const purpose = String(options.purpose || "state mutation");
  const ttlMs = Number.isFinite(Number(options.ttlMs))
    ? Math.max(1000, Number(options.ttlMs))
    : DEFAULT_LEASE_MS;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(0, Number(options.timeoutMs))
    : DEFAULT_LOCK_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const lease = {
      token: uuid7(),
      pid: process.pid,
      host: os.hostname(),
      acquiredAt: nowIso(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      purpose,
    };
    try {
      const fd = fs.openSync(file, "wx", 0o600);
      try {
        fs.writeFileSync(fd, `${JSON.stringify(lease, null, 2)}\n`, "utf8");
      } finally {
        fs.closeSync(fd);
      }
      held.set(key, { file, lease, depth: 1 });
      let released = false;
      return {
        file,
        lease,
        release() {
          if (released) return;
          released = true;
          held.delete(key);
          removeLease(file, lease.token);
        },
      };
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw new OrchidError(`cannot acquire state lock: ${error?.message || error}`);
      }
      const current = readLease(file);
      // A live same-host process keeps ownership even if its lease TTL elapsed:
      // a long merge/test must not be stolen mid-operation. Dead PIDs are
      // reclaimed immediately. A file stamped with our own PID cannot be ours
      // because the in-process registry has no entry, so it is stale residue.
      const staleOwnPid =
        current &&
        current.host === os.hostname() &&
        Number(current.pid) === process.pid;
      if (
        !current ||
        staleOwnPid ||
        leaseOwnerDead(current) ||
        (leaseExpired(current) && current.host !== os.hostname())
      ) {
        try {
          fs.unlinkSync(file);
        } catch {
          /* another process may have reclaimed it */
        }
        continue;
      }
      if (Date.now() >= deadline) {
        throw new OrchidError(
          `state is locked by ${current.host || "unknown host"} pid=${current.pid || "?"} ` +
            `for "${current.purpose || "state mutation"}" until ${current.expiresAt || "unknown"}; ` +
            `waited ${timeoutMs}ms`,
        );
      }
      pause(25);
    }
  }
}

export function releaseStateLock(lock) {
  if (lock && typeof lock.release === "function") lock.release();
}

export function withStateLock(root, fn, options = {}) {
  const lock = acquireStateLock(root, options);
  try {
    return fn(lock);
  } finally {
    releaseStateLock(lock);
  }
}

export function readStateLock(root) {
  return readLease(lockFile(root));
}

export function stateLockPath(root) {
  return lockFile(root);
}
