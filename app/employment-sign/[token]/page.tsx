import EmploymentSigningFlow from "@/components/EmploymentSigningFlow";

export default async function EmploymentSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EmploymentSigningFlow key={token} token={token} organization="qiunai" />;
}
