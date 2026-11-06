import test from "node:test";
import assert from "node:assert/strict";
import { recentRankingMonths } from "../lib/hrRankMonths.mjs";

test("ranking month choices follow Taipei month boundaries and cross years", () => {
  const beforeTaipeiMidnight = new Date("2026-10-31T15:59:59Z");
  const afterTaipeiMidnight = new Date("2026-10-31T16:00:00Z");
  assert.equal(recentRankingMonths(beforeTaipeiMidnight)[0], "2026-10");
  const months = recentRankingMonths(afterTaipeiMidnight);
  assert.equal(months.length, 12);
  assert.deepEqual(months.slice(0, 3), ["2026-11", "2026-10", "2026-09"]);
  assert.equal(months.at(-1), "2025-12");
});
