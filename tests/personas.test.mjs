import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers.mjs";
import { parseFrontMatter } from "../cli/yaml.mjs";

const PERSONAS = [
  "PM",
  "DEV",
  "QE",
  "TECH_LEAD",
  "ARCHITECT",
  "DBA",
  "DEVOPS",
  "SECURITY",
  "UX",
];

const DOSSIER_SECTIONS = [
  "## Mission",
  "## Scope",
  "## Decision rights",
  "## Phase participation",
  "## Review rubric",
  "## Anti-patterns",
  "## Handoff",
  "## Triggers",
];

test("every shipped persona has a concise active contract and detailed dossier", () => {
  for (const id of PERSONAS) {
    const activeFile = path.join(ROOT, ".skill/personas", `${id}.md`);
    const dossierFile = path.join(ROOT, "docs/personas", `${id}.md`);
    assert.ok(fs.existsSync(activeFile), `missing active persona ${id}`);
    assert.ok(fs.existsSync(dossierFile), `missing dossier ${id}`);

    const { data, body } = parseFrontMatter(fs.readFileSync(activeFile, "utf8"));
    assert.equal(data.id, id);
    assert.ok(typeof data.name === "string" && data.name.length > 0);
    assert.ok(Array.isArray(data.phases) && data.phases.length > 0);
    assert.ok(["advisory", "blocking"].includes(data.authority));
    assert.match(body, /# Role contract/);
    assert.ok(
      body.includes(`docs/personas/${id}.md`),
      `${id} active contract does not link its dossier`,
    );
    assert.ok(body.split(/\s+/).length < 400, `${id} active contract is too long`);

    const dossier = fs.readFileSync(dossierFile, "utf8");
    for (const section of DOSSIER_SECTIONS) {
      assert.ok(dossier.includes(section), `${id} dossier missing ${section}`);
    }
  }
});

test("PM remains the only product persona with the PO alias", () => {
  const { data } = parseFrontMatter(
    fs.readFileSync(path.join(ROOT, ".skill/personas/PM.md"), "utf8"),
  );
  assert.deepEqual(data.aliases, ["PO"]);
  for (const id of PERSONAS.filter((value) => value !== "PM")) {
    const { data: other } = parseFrontMatter(
      fs.readFileSync(path.join(ROOT, ".skill/personas", `${id}.md`), "utf8"),
    );
    assert.deepEqual(other.aliases || [], [], `${id} must not alias PO`);
  }
});

test("the persona dossier index lists every shipped persona", () => {
  const index = fs.readFileSync(path.join(ROOT, "docs/personas/README.md"), "utf8");
  for (const id of PERSONAS) {
    assert.ok(index.includes(`(${id}.md)`), `persona index missing ${id}`);
  }
});
