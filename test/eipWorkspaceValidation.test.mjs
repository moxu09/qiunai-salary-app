import test from "node:test";
import assert from "node:assert/strict";
import { validateFields, validateAnswers } from "../lib/eipWorkspaceValidation.mjs";

const definition = [
  { key: "reason", label: "事由", type: "textarea", required: true },
  { key: "day", label: "日期", type: "date", required: true },
  { key: "kind", label: "類別", type: "choice", required: false, options: ["補休", "公假"] },
];

test("form definition normalizes fields and keeps choice options", () => {
  const fields = validateFields(definition);
  assert.equal(fields.length, 3);
  assert.deepEqual(fields[2].options, ["補休", "公假"]);
  assert.equal(fields[2].required, false);
});

test("form submission rejects missing required fields, unknown keys and forged choices", () => {
  const fields = validateFields(definition);
  assert.throws(() => validateAnswers(fields, { reason: "原因" }), /日期/);
  assert.throws(() => validateAnswers(fields, { reason: "原因", day: "2026-09-30", elevated: "yes" }), /未定義/);
  assert.throws(() => validateAnswers(fields, { reason: "原因", day: "2026-09-30", kind: "特權" }), /選項/);
  assert.throws(() => validateAnswers(fields, { reason: "原因", day: "2026-02-31" }), /日期/);
});

test("form submission trims and accepts valid values", () => {
  const fields = validateFields(definition);
  assert.deepEqual(validateAnswers(fields, { reason: " 公務 ", day: "2026-09-30", kind: "公假" }), {
    reason: "公務", day: "2026-09-30", kind: "公假",
  });
});

test("definition rejects duplicate keys and malformed choices", () => {
  assert.throws(() => validateFields([{ ...definition[0] }, { ...definition[0] }]), /不重複/);
  assert.throws(() => validateFields([{ key: "choice", label: "選擇", type: "choice", options: ["單一"] }]), /2～20/);
});
