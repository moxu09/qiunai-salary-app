import { authorizeCourseReader } from '@/lib/courseAccess';
import { courseFileHandler } from "@/lib/service/courseFiles";
export const dynamic = "force-dynamic";
export const GET = courseFileHandler(authorizeCourseReader);
