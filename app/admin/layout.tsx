import AdminShell from "@/components/AdminShell";
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell company="秋奈電競陪玩" rankingPath="/admin/ranking">{children}</AdminShell>;
}
