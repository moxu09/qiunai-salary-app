import assert from "node:assert/strict";
import test from "node:test";
import { groupActivityResponses } from "../lib/qiunaiActivityGroups.ts";

test("活動名單依自訂選項分類且每人只出現一次", () => {
  const responses = [
    { id: "north", response_status: "attending", selected_option_id: "n" },
    { id: "central", response_status: "attending", selected_option_id: "c" },
    { id: "south", response_status: "attending", selected_option_id: "s" },
    { id: "declined", response_status: "not_attending", selected_option_id: null },
    { id: "distance", response_status: "distance", selected_option_id: null },
  ];
  const groups = groupActivityResponses({
    options: [{ id: "n", label: "北部" }, { id: "c", label: "中部" }, { id: "s", label: "南部" }],
    responses,
  });
  assert.deepEqual(groups.map((group) => [group.label, group.responses.map((item) => item.id)]), [
    ["北部", ["north"]], ["中部", ["central"]], ["南部", ["south"]],
    ["不參與", ["declined"]], ["因地區無法參與", ["distance"]],
  ]);
});

test("關閉預設選項仍保留已提交的歷史回覆", () => {
  const groups = groupActivityResponses({
    options: [{ id: "n", label: "北部" }],
    allow_not_attending: false,
    allow_distance: false,
    responses: [
      { id: "legacy", response_status: "not_attending", selected_option_id: null },
      { id: "missing", response_status: "attending", selected_option_id: "removed" },
    ],
  });
  assert.deepEqual(groups.map((group) => [group.label, group.responses.length]), [
    ["北部", 0], ["參與（原選項已移除）", 1], ["不參與", 1],
  ]);
});
