import { redirect } from "next/navigation";
export default async function LegacyCourseManagement({searchParams}:{searchParams:Promise<{department?:string}>}) {
  const {department}=await searchParams;
  redirect(department==="qiunai"?"/admin/department/qiunai/workspace":"/admin/workspace");
}
