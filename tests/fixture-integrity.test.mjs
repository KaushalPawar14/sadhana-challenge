import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = JSON.parse(
  await readFile(new URL("../fixtures/representative-scenarios.json", import.meta.url), "utf8"),
);

test("representative scenarios are explicitly synthetic and diverse", () => {
  assert.match(fixture.notice, /Synthetic records only/i);
  assert.ok(fixture.students.length >= 6);
  assert.ok(new Set(fixture.students.map((student) => student.condition)).size >= 6);
});

test("fixture LIT coordinates and confidence stay in the 1–5 range", () => {
  for (const student of fixture.students) {
    for (const key of ["listening", "interest", "time", "confidence"]) {
      assert.ok(student.lit[key] >= 1 && student.lit[key] <= 5, `${student.id}:${key}`);
    }
  }
});

test("fixture chanting values map to exactly one exclusive bracket", () => {
  const bracketFor = (rounds) => {
    if (rounds <= 3) return "0-3";
    if (rounds <= 7) return "4-7";
    if (rounds <= 11) return "8-11";
    if (rounds <= 15) return "12-15";
    return "16";
  };
  assert.deepEqual(
    fixture.students.map((student) => bracketFor(student.abcde.chanting_rounds)),
    ["4-7", "4-7", "0-3", "16", "0-3", "0-3"],
  );
});
