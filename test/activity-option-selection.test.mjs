import assert from "node:assert/strict";
import test from "node:test";
import { normalizeActivityOptionIds } from "../lib/activityOptionSelection.js";
import { groupActivityResponses } from "../lib/qiunaiActivityGroups.ts";
const options = [{ id: "a", label: "北部" }, { id: "b", label: "南部" }];
test("預設單選且相容舊版 optionId", () => {
  assert.deepEqual(normalizeActivityOptionIds({}, { status: "attending", optionId: "a" }, options), ["a"]);
  assert.throws(() => normalizeActivityOptionIds({}, { status: "attending", optionIds: ["a", "b"] }, options), /只能選擇一個/);
});
test("複選會去重並依活動選項順序儲存", () => {
  assert.deepEqual(normalizeActivityOptionIds({ allow_multiple_options: true },
    { status: "attending", optionIds: ["b", "a", "a"] }, options), ["a", "b"]);
});
test("拒絕偽造、空白及其他活動選項", () => {
  for (const ids of [[], ["x"], ["a", null], "a", Array(21).fill("a")])
    assert.throws(() => normalizeActivityOptionIds({ allow_multiple_options: true }, { status: "attending", optionIds: ids }, options));
});
test("沒有選項的活動可報名；非參與回覆清除選項", () => {
  assert.deepEqual(normalizeActivityOptionIds({}, { status: "attending", optionIds: [] }, []), []);
  for (const status of ["not_attending", "distance"])
    assert.deepEqual(normalizeActivityOptionIds({}, { status, optionIds: ["a", "b"] }, options), []);
});
test("後台、Excel、列印共用分類包含所有複選但不重複同組", () => {
  const responses = [{ id: "employee", response_status: "attending", selected_option_id: "a", selected_option_ids: ["a", "b", "b"] }];
  const groups = groupActivityResponses({ options, responses });
  assert.equal(responses.length, 1);
  assert.deepEqual(groups.slice(0, 2).map((group) => group.responses.map((row) => row.id)), [["employee"], ["employee"]]);
  assert.ok(!groups.some((group) => group.key === "unassigned"));
});

test("舊頁面不可把已儲存的複選縮成單一場次或清除", () => {
  const existing = { selected_option_ids: ["a", "b"] };
  for (const status of ["attending", "not_attending", "distance"]) {
    assert.throws(() => normalizeActivityOptionIds(
      { allow_multiple_options: true }, { status, optionId: "a" }, options, existing,
    ), /頁面版本過舊/);
  }
  assert.deepEqual(normalizeActivityOptionIds(
    { allow_multiple_options: true }, { status: "attending", optionIds: ["a", "b"] }, options, existing,
  ), ["a", "b"]);
});

test("複選資料優先於舊單選欄位，且不修改原始回覆", () => {
  const responses = [{ id: "x", response_status: "attending", selected_option_id: "a", selected_option_ids: ["b"] }];
  const before = structuredClone(responses);
  const groups = groupActivityResponses({ options, responses });
  assert.equal(groups[0].responses.length, 0);
  assert.equal(groups[1].responses.length, 1);
  assert.deepEqual(responses, before);
});

test("空陣列相容歷史單選；複選中部分選項已移除仍保留有效場次", () => {
  const responses = [
    { id: "legacy", response_status: "attending", selected_option_id: "a", selected_option_ids: [] },
    { id: "partial", response_status: "attending", selected_option_id: "removed", selected_option_ids: ["removed", "b"] },
    { id: "orphan", response_status: "attending", selected_option_ids: ["removed"] },
  ];
  const groups = groupActivityResponses({ options, responses });
  assert.deepEqual(groups.slice(0, 3).map(g => g.responses.map(r => r.id)), [["legacy"], ["partial"], ["orphan"]]);
});
