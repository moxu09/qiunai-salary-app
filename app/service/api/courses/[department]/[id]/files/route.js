import { serviceAuth } from "@/lib/service/access";
import { courseFileHandler } from "@/lib/service/courseFiles";
export const dynamic = "force-dynamic";
export const GET = courseFileHandler(serviceAuth);
