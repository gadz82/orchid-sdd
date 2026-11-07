import { test } from "node:test";
import assert from "node:assert/strict";
import { cli, setup, start, tmp } from "./helpers.mjs";

test("doctor passes when iteration-scoped aliases repeat across iterations", () => {
  const root = tmp();
  setup(root);
  start(root, "Add passkey login to the customer portal");
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "First iteration requirement.", "--topics", "a,b,c");
  assert.equal(cli(root, "abandon", "descoped for this quarter").code, 0);

  start(root, "Add email verification to the account flow");
  cli(root, "record", "--type", "Requirement", "--alias", "R-001",
    "--description", "Second iteration requirement.", "--topics", "d,e,f");

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 0, doctor.all);
});

test("doctor still fails on a project-scoped alias collision", () => {
  const root = tmp();
  setup(root);
  start(root, "Add passkey login to the customer portal");
  cli(root, "record", "--type", "Decision", "--alias", "DUP",
    "--description", "First decision.", "--topics", "a,b,c", "--scope", "project");
  cli(root, "record", "--type", "Decision", "--alias", "DUP",
    "--description", "Second decision.", "--topics", "d,e,f", "--scope", "project");

  const doctor = cli(root, "doctor");
  assert.equal(doctor.code, 1, doctor.all);
  assert.match(doctor.all, /duplicate project-scoped alias "dup"/);
});
