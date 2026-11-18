import { authorizeCourseReader } from '@/lib/courseAccess';
import { courseFileHandler } from "@/lib/service/courseFiles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hrNasSelected, readHrNas } from "@/lib/hrNasRead.mjs";
export const dynamic = "force-dynamic";
export const GET = courseFileHandler(authorizeCourseReader, async (request, actor, department, id) => {
  if (!hrNasSelected(request)) return undefined;
  const [index] = await readHrNas(supabaseAdmin, actor, "attachment_index", {
    p_department: department, p_document_id: id,
  }, { document: { department, id } });
  if (!index) throw Object.assign(Error("找不到已授權的 HR 附件索引"), { status: 404 });
  return index.hidden_files;
});
