import { notFound } from "next/navigation";
import { knowledgeCourseLocation } from "@/lib/knowledgeCourses.mjs";

export default async function CoursePage({ params }: { params: Promise<{ course: string[] }> }) {
  const { course } = await params;
  if (!knowledgeCourseLocation(`/collaboration/knowledge/${course.join("/")}`)) notFound();
  return null;
}
