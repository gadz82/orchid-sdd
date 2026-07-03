import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, cli, tmp } from "./helpers.mjs";
import { loadConfig } from "../cli/config.mjs";

const PROFILES = ["backend", "frontend", "infra", "monorepo", "custom"];

function readProfile(id) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, ".skill/templates/profiles", `${id}.json`), "utf8"),
  );
}

test("every shipped profile initializes its personas, tests, and constitution pack", () => {
  for (const id of PROFILES) {
    const root = tmp();
    const profile = readProfile(id);
    const setup = cli(root, "setup", "--yes", "--profile", id);
    assert.equal(setup.code, 0, `${id}: ${setup.all}`);

    const { config } = loadConfig(root);
    assert.equal(config.project.profile, id);
    assert.deepEqual(config.personas.enabled, profile.personas);
    assert.deepEqual(config.execution.test_commands, profile.tests);

    const constitution = fs.readFileSync(
      path.join(root, ".orchid/constitution/constitution.md"),
      "utf8",
    );
    for (const relative of profile.constitution) {
      const copied = path.join(root, ".orchid/constitution/_profile", relative);
      assert.ok(fs.existsSync(copied), `${id}: missing profile constitution ${relative}`);
      assert.ok(
        constitution.includes(`_profile/${relative}`),
        `${id}: constitution does not include ${relative}`,
      );
    }
    assert.ok(
      fs.existsSync(path.join(root, ".orchid/constitution/_profile/README.md")),
      `${id}: missing profile README`,
    );

    const doctor = cli(root, "doctor");
    assert.equal(doctor.code, 0, `${id}: ${doctor.all}`);
  }
});

test("profile files declare the canonical profile ids", () => {
  for (const id of PROFILES) {
    const profile = readProfile(id);
    assert.equal(profile.id, id);
    assert.ok(Array.isArray(profile.personas) && profile.personas.length >= 3);
    assert.ok(profile.tests && typeof profile.tests === "object");
  }
});
