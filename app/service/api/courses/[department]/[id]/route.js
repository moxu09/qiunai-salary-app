import { serviceAuth } from "@/lib/service/access";
import { loadKnowledgeCourse, loadCourseCompletion, loadCourseProgress, completePrivateCourse, learnCourse } from "@/lib/service/courses";
import { createKnowledgeCourseHandler, createKnowledgeCompletionHandler, createKnowledgeProgressHandler } from "@/lib/knowledgeCourseHandler.mjs";
export const dynamic = "force-dynamic";
export const GET = createKnowledgeCourseHandler({ authorize: serviceAuth, loadPublished: loadKnowledgeCourse, loadCompletion: loadCourseCompletion, loadProgress: loadCourseProgress });
export const POST = createKnowledgeCompletionHandler({ authorize: serviceAuth, complete: (department, id, actor, version) => completePrivateCourse(department, id, actor, version, "service-web") });
export const PATCH=createKnowledgeProgressHandler({authorize:serviceAuth,learn:(department,id,actor,version,action,input)=>learnCourse(department,id,actor,version,action,input,'service-web')});
