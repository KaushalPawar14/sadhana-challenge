import assert from "node:assert/strict";
import test from "node:test";
import { buildAllLitCombinations, guidanceForLit } from "../lib/litFramework.ts";

test("LIT framework covers all 125 unique coordinates", () => {
  const combinations = buildAllLitCombinations();
  assert.equal(combinations.length, 125);
  assert.equal(new Set(combinations.map((item) => item.patternCode)).size, 125);
});

test("high interest and low time avoids overload", () => {
  const result = guidanceForLit({ listening: 4, interest: 5, time: 1 });
  assert.match(result.mentorApproach, /time constraint/i);
  assert.match(result.caution, /low availability/i);
});

test("LIT guidance never emits an overall personality score", () => {
  const result = guidanceForLit({ listening: 3, interest: 3, time: 3 });
  assert.equal("overallScore" in result, false);
  assert.match(result.evidenceNeeded, /three meaningful interactions/i);
});
