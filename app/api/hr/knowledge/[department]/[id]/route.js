import { hrAuth } from "@/lib/hrServer";
import { loadKnowledgeCourse, loadCourseCompletion, completePrivateCourse } from "@/lib/service/courses";
import { createKnowledgeCourseHandler, createKnowledgeCompletionHandler } from "@/lib/knowledgeCourseHandler.mjs";

export const dynamic = "force-dynamic";
const authorize = async (request) => {
    if (!/^Bearer\s+\S+$/i.test(request.headers.get("authorization") || ""))
      throw Object.assign(Error("請重新登入 HR"), { status: 401 });
    try { return await hrAuth(request); }
    catch (error) {
      if (["缺少登入資訊", "登入已失效，請重新登入", "讀取 Discord ID 失敗"].includes(error?.message))
        throw Object.assign(Error("請重新登入 HR"), { status: 401 });
      throw error;
    }
};
export const GET = createKnowledgeCourseHandler({
  authorize,
  loadPublished: loadKnowledgeCourse,
  loadCompletion: loadCourseCompletion,
});
export const POST = createKnowledgeCompletionHandler({
  authorize,
  complete: completePrivateCourse,
});
