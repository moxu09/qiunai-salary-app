// PostgREST caps each response. Read until empty rather than treating a short
// response as the end: the server may enforce a smaller cap than our page size.
export async function fetchAllRows(query) {
  const rows = [];
  const ordered = query.order("id", { ascending: true });
  for (let from = 0; ; ) {
    const { data, error } = await ordered.range(from, from + 499);
    if (error) return { data: null, error };
    const page = data || [];
    if (!page.length) return { data: rows, error: null };
    rows.push(...page);
    from += page.length;
  }
}
