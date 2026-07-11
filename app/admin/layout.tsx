export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="qiunai-admin-shell">{children}</div>;
}
