import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ERP_OWNER_DISCORD_ID } from "@/lib/erpRoles";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";

export async function getHrRole(organization, discordId) {
  const { data, error } = await supabaseAdmin.rpc("hr_salary_reviewer_role", {
    p_org: organization, p_actor: discordId,
  });
  if (error) throw error;
  return data;
}

export async function requireHrActivityEditor(request, organization) {
  let actor;
  try { actor = await getAuthUserFromRequest(supabaseAdmin, request); }
  catch { throw Object.assign(Error("請重新登入 HR"), { status: 401 }); }
  const role = await getHrRole(organization, actor.discordId);
  if (role !== "PIC" && role !== "Manager") {
    throw Object.assign(Error("只有本店 Manager 或 PIC 可以編輯活動"), { status: 403 });
  }
  return { ...actor, canManageActivity: actor.discordId === ERP_OWNER_DISCORD_ID };
}

export async function requireHrPic(request) {
  let actor;
  try { actor = await getAuthUserFromRequest(supabaseAdmin, request); }
  catch { throw Object.assign(Error("請重新登入 HR"), { status: 401 }); }
  if (actor.discordId !== ERP_OWNER_DISCORD_ID) {
    throw Object.assign(Error("只有 PIC 可以執行此操作"), { status: 403 });
  }
  return actor;
}
