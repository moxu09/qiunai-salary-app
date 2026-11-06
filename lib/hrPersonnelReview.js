import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import { getErpAccessByDiscordId } from "@/lib/erpAccess";
import { getHrRole } from "@/lib/erpRoles";
import { removeRequestImages, signRequestAttachments } from "@/lib/requestAttachments";
import { personnelProgress } from "@/lib/hrPersonnelProgress.mjs";

const categories = ["administrative", "reimbursement", "welfare", "leave", "suspension"];
const response = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error) {
  const status = error.status || (error.code === "23514" ? 409 : 500);
  return response({ ok: false, message: status >= 500 ? "人事簽核暫時無法處理" : error.message }, status);
}
function reject(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
async function actor(request, organization) {
  let discordId;
  try { ({ discordId } = await getAuthUserFromRequest(supabaseAdmin, request)); }
  catch { reject("請重新登入 HR", 401); }
  const [access, staff] = await Promise.all([
    getErpAccessByDiscordId(supabaseAdmin, organization, discordId),
    supabaseAdmin.from(organization === "qiunai" ? "qiunai_staff" : "players")
      .select("is_active").eq("discord_id", discordId).maybeSingle(),
  ]);
  if (staff.error) throw staff.error;
  if (staff.data?.is_active === false) reject("停用中的員工帳號無法簽核", 403);
  const role = getHrRole(access.role);
  if (role === "Staff") reject("沒有管理人事簽核的權限", 403);
  const admin = access.assignment || access.legacyAdmin;
  return { discordId, role, name: admin?.display_name || admin?.real_name || admin?.name || null };
}

export async function personnelInbox(request, organization) {
  try {
    const reviewer = await actor(request, organization);
    const params = new URL(request.url).searchParams;
    const status = params.get("status") || "pending";
    const category = params.get("category") || "";
    if (!["pending", "approved", "rejected", "all"].includes(status)) reject("簽核狀態不正確");
    if (category && !categories.includes(category)) reject("簽核類別不正確");
    const page = Math.max(1, Math.min(10000, Number.parseInt(params.get("page") || "1", 10) || 1));
    const pageSize = 25;
    const table = () => supabaseAdmin.from("salary_requests");
    const scope = (query) => {
      query.eq("organization_code", organization);
      return category ? query.eq("approval_category", category) : query;
    };
    const items = scope(table().select("*", { count: "exact" }));
    if (status !== "all") items.eq("status", status);
    const states = ["pending", "approved", "rejected"];
    const [result, ...counts] = await Promise.all([
      items.order("created_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1),
      ...states.map((state) => scope(table().select("id", { count: "exact", head: true })).eq("status", state)),
    ]);
    for (const item of [result, ...counts]) if (item.error) throw item.error;
    const requests = result.data.map((item) => ({
      ...item, reviewer_discord_id: item.reviewed_by || item.form_data?.reviewer_discord_id || null,
      reviewer_name: item.form_data?.reviewer_name || null,
      ...personnelProgress(item, reviewer.role, reviewer.discordId),
    }));
    return response({
      ok: true, requests: await signRequestAttachments(requests),
      summary: Object.fromEntries(states.map((state, index) => [state, counts[index].count || 0])),
      pagination: { page, pageSize, total: result.count || 0 },
    });
  } catch (error) { return failure(error); }
}

export async function reviewHrPersonnelRequest(request, organization) {
  try {
    const reviewer = await actor(request, organization);
    const body = await request.json().catch(() => ({}));
    if (!body.id || !["approved", "rejected"].includes(body.status)) reject("簽核資料不正確");
    const note = String(body.reviewResult || "").trim();
    if (note.length > 2000) reject("簽核說明不得超過 2,000 字");
    if (body.status === "rejected" && !note) reject("駁回時請填寫原因");
    const scope = (query) => query.eq("id", body.id).eq("organization_code", organization);
    const { data: existing, error } = await scope(supabaseAdmin.from("salary_requests").select("*")).maybeSingle();
    if (error) throw error;
    if (!existing) reject("找不到申請資料", 404);
    if (existing.status !== "pending") reject("此申請已處理，請重新整理", 409);
    if (String(existing.discord_id) === String(reviewer.discordId)) reject("不能簽核自己的申請", 403);
    const { stage, canReview } = personnelProgress(existing, reviewer.role, reviewer.discordId);
    if (!canReview) reject(stage === "initial" ? "此關卡須由 Manager 初核" : "此關卡須由另一位 PIC 覆核", 403);
    const form = existing.form_data || {};
    const now = new Date().toISOString();
    const advanced = stage === "initial" && body.status === "approved";
    const patch = advanced
      ? { first_reviewed_by: reviewer.discordId, first_reviewed_at: now, first_review_note: note || null }
      : { status: body.status, review_result: note || "核准", reviewed_by: reviewer.discordId, reviewed_at: now,
        form_data: { ...form, reviewer_name: reviewer.name, reviewer_discord_id: reviewer.discordId } };
    let change = scope(supabaseAdmin.from("salary_requests").update({ ...patch, updated_at: now })).eq("status", "pending");
    change = stage === "final" ? change.eq("first_reviewed_by", existing.first_reviewed_by) : change.is("first_reviewed_at", null);
    const changed = await change.select("*").maybeSingle();
    if (changed.error) throw changed.error;
    if (!changed.data) reject("此申請已由其他管理員處理，請重新整理", 409);
    if (advanced) return response({ ok: true, request: changed.data, advanced: true });

    const paths = Array.isArray(form.attachments) ? form.attachments.map((item) => item?.path).filter(Boolean) : [];
    let item = changed.data;
    let warning;
    if (paths.length) {
      try {
        await removeRequestImages(paths, { strict: true });
        const cleared = await scope(supabaseAdmin.from("salary_requests").update({
          form_data: { ...item.form_data, attachments: [], attachments_expired_at: now },
        })).eq("reviewed_at", now).select("*").maybeSingle();
        if (cleared.error || !cleared.data) throw cleared.error || new Error("附件狀態更新失敗");
        item = cleared.data;
      } catch {
        warning = "簽核已完成，但附件清理失敗，請聯繫管理員檢查";
      }
    }
    return response({ ok: true, request: item, warning });
  } catch (error) { return failure(error); }
}
