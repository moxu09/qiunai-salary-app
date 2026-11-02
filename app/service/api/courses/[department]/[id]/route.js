import { serviceAuth } from "@/lib/service/access";
import { loadKnowledgeCourse, loadCourseCompletion, completePrivateCourse } from "@/lib/service/courses";
import { createKnowledgeCourseHandler, createKnowledgeCompletionHandler } from "@/lib/knowledgeCourseHandler.mjs";
export const dynamic = "force-dynamic";
export const GET = createKnowledgeCourseHandler({ authorize: serviceAuth, loadPublished: loadKnowledgeCourse, loadCompletion: loadCourseCompletion });
export const POST = createKnowledgeCompletionHandler({ authorize: serviceAuth, complete: (department, id, actor, version) => completePrivateCourse(department, id, actor, version, "service-web") });
