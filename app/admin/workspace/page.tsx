import { headers } from "next/headers";
import { isSupervisorHost } from "@/lib/hrHostRouting.mjs";
import AdminWorkspaceManager from "@/components/AdminWorkspaceManager";
export const metadata = { title: "協作工作台｜EIP" };
export default async function WorkspacePage() {
  const organization = isSupervisorHost((await headers()).get("host")) ? "deepnight" : "qiunai";
  return <AdminWorkspaceManager organization={organization} />;
}
