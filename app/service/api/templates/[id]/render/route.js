import { serviceAuth, serviceFail } from "@/lib/service/access";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import engine from "@/lib/serviceTemplateEngine.cjs";
export const dynamic = "force-dynamic";
export async function POST(request, context) {
 try {
  const actor = await serviceAuth(request);
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw Object.assign(Error("模板不存在"), { status: 404 });
  const raw = await request.text();
  if (raw.length > 40000) throw Object.assign(Error("輸入內容太長"), { status: 400 });
  let body;
  try { body = JSON.parse(raw); } catch { throw Object.assign(Error("模板資料不正確"), { status: 400 }); }
  if (!body || Object.keys(body).some((key) => !['department','version','values'].includes(key)) || !actor.departments.some((store) => store.key === body.department)) throw Object.assign(Error("沒有此店家的模板權限"), { status: 403 });
  const { data: template, error } = await supabaseAdmin.from("service_templates").select("*").eq("id", id).eq("organization_code", body.department).maybeSingle();
  if (error) throw error;
  if (!template) throw Object.assign(Error("模板不存在"), { status: 404 });
  const now = Date.now();
  if ((template.starts_at && Date.parse(template.starts_at) > now) || (template.ends_at && Date.parse(template.ends_at) <= now)) throw Object.assign(Error("這份活動模板已到期或尚未開放"), { status: 409 });
  let text;
  try { text = engine.compileTemplate(template, body.values, { organization: body.department, version: body.version }); }
  catch (error) { throw Object.assign(Error(error.message), { status: 400 }); }
  return Response.json({ ok: true, text }, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
 } catch (error) { return serviceFail(error); }
}
