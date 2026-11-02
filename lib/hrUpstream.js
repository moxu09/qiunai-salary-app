import "server-only";
import { HR_CONFIG } from "@/lib/hrServer";
export async function hrSource(request, key, path, options = {}) {
  const url = new URL(`/api/${key}/${path}`, HR_CONFIG[key].origin);
  const headers = new Headers({ Authorization: request.headers.get("authorization") || "" });
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response;
  if (key === "deepnight" && path.split("?")[0] === "workspace") {
    const handlers = await import("@/app/api/deepnight/workspace/route");
    const method = options.method || "GET";
    response = await handlers[method](
      new Request(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      }),
    );
  } else
    response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body:
        options.body instanceof FormData
          ? options.body
          : options.body
            ? JSON.stringify(options.body)
            : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(Error(result.message || "讀取部門資料失敗"), { status: response.status });
  return result;
}
export function annotate(rows, key, field) {
  return (rows || []).map((row) => ({
    ...row,
    organization: key,
    ...(field ? { [field]: `${key === "qiunai" ? "秋奈" : "深夜"}｜${row[field] || ""}` } : {}),
  }));
}
