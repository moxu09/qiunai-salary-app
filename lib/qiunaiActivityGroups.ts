export type ActivityResponseForGrouping = {
  response_status: "attending" | "not_attending" | "distance";
  selected_option_id?: string | null;
  selected_option_ids?: string[] | null;
};

export type ActivityForGrouping<T extends ActivityResponseForGrouping> = {
  options: Array<{ id: string; label: string }>;
  responses: T[];
  allow_not_attending?: boolean | null;
  allow_distance?: boolean | null;
};

export function groupActivityResponses<T extends ActivityResponseForGrouping>(activity: ActivityForGrouping<T>) {
  const selectedIds = (response: T) => response.selected_option_ids?.length
    ? response.selected_option_ids : response.selected_option_id ? [response.selected_option_id] : [];
  const options = activity.options || [];
  const responses = activity.responses || [];
  const optionIds = new Set(options.map((option) => option.id));
  const groups = options.map((option) => ({
    key: option.id,
    label: option.label,
    responses: responses.filter((response) =>
      response.response_status === "attending" && selectedIds(response).includes(option.id),
    ),
  }));
  const unassigned = responses.filter((response) =>
    response.response_status === "attending" && !selectedIds(response).some((id) => optionIds.has(id)),
  );
  if (unassigned.length || !options.length) {
    groups.push({ key: "unassigned", label: options.length ? "參與（原選項已移除）" : "參與", responses: unassigned });
  }
  const notAttending = responses.filter((response) => response.response_status === "not_attending");
  if (activity.allow_not_attending !== false || notAttending.length) {
    groups.push({ key: "not_attending", label: "不參與", responses: notAttending });
  }
  const distance = responses.filter((response) => response.response_status === "distance");
  if (activity.allow_distance !== false || distance.length) {
    groups.push({ key: "distance", label: "因地區無法參與", responses: distance });
  }
  return groups;
}
