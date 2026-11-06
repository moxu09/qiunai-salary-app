import { personnelInbox, reviewHrPersonnelRequest } from "@/lib/hrPersonnelReview";
import { hrSource } from "@/lib/hrUpstream";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { getHrRole } from "@/lib/hrAccess";
import { hrFail } from "@/lib/hrServer";

export const dynamic = "force-dynamic";
export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("mode") === "admin" && url.searchParams.get("view") === "inbox") {
    return personnelInbox(request, "deepnight");
  }
  try {
    if (url.searchParams.get("mode") === "admin") {
      const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
      if ((await getHrRole("deepnight", discordId)) === "Staff") {
        throw Object.assign(Error("你沒有簽核申請的權限"), { status: 403 });
      }
    }
    return Response.json(await hrSource(request, "deepnight", `hr${url.search}`));
  } catch (error) { return hrFail(error); }
}
export async function POST(request) {
  try {
    const body = request.headers.get("content-type")?.includes("multipart/form-data")
      ? await request.formData() : await request.json();
    return Response.json(await hrSource(request, "deepnight", "hr", { method: "POST", body }));
  } catch (error) { return hrFail(error); }
}
export async function PATCH(request) {
  return reviewHrPersonnelRequest(request, "deepnight");
}
