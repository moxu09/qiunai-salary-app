import test from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_TARGET_HOURS, workflowOverdueBefore } from "../lib/eipWorkflowSla.mjs";

test("the same 48-hour threshold is used by the inbox and sidebar notification", () => {
  const now = Date.parse("2026-09-29T12:00:00.000Z");
  assert.equal(WORKFLOW_TARGET_HOURS, 48);
  assert.equal(workflowOverdueBefore(now), "2026-09-27T12:00:00.000Z");
});
