import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireHrPic } from "@/lib/hrAccess";
import { HR_CONFIG, hrFail } from "@/lib/hrServer";

export const dynamic = "force-dynamic";
const respond = (data) => Response.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
function department(value) {
  if (!Object.hasOwn(HR_CONFIG, value)) throw Object.assign(Error("請選擇部門"), { status: 400 });
  return value;
}

export async function GET(request) {
  try {
    await requireHrPic(request);
    const organization = department(new URL(request.url).searchParams.get("department"));
    const { data: memberships, error } = await supabaseAdmin.from("hr_manager_memberships")
      .select("discord_id").eq("organization_code", organization).order("assigned_at");
    if (error) throw error;
    if (!memberships.length) return respond({ members: [] });
    const { data: staff, error: staffError } = await supabaseAdmin.from(HR_CONFIG[organization].staff)
      .select("discord_id,display_name,discord_name,is_active")
      .in("discord_id", memberships.map(({ discord_id }) => discord_id));
    if (staffError) throw staffError;
    const byId = new Map(staff.map((item) => [item.discord_id, item]));
    return respond({ members: memberships.map(({ discord_id: id }) => {
      const item = byId.get(id);
      return { id, name: item?.display_name || item?.discord_name || id, active: Boolean(item) && item.is_active !== false };
    }) });
  } catch (error) { return hrFail(error); }
}

async function setManager(request, granted) {
  try {
    const { discordId } = await requireHrPic(request);
    const input = await request.json().catch(() => null);
    const organization = department(input?.department);
    const member = typeof input?.discordId === "string" ? input.discordId.trim() : "";
    if (!/^\d{15,22}$/.test(member)) throw Object.assign(Error("請輸入有效的 Discord ID"), { status: 400 });
    const { error } = await supabaseAdmin.rpc("hr_set_manager", {
      p_org: organization, p_actor: discordId, p_member: member, p_granted: granted,
    });
    if (error) throw Object.assign(error, { status: { P0002: 404, "22023": 400, "42501": 403 }[error.code] || 500 });
    return respond({});
  } catch (error) { return hrFail(error); }
}

export async function POST(request) { return setManager(request, true); }
export async function DELETE(request) { return setManager(request, false); }
