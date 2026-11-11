import { notFound } from "next/navigation";
import HrDocumentSigning from "@/components/HrDocumentSigning";

export default async function Page({ searchParams }: { searchParams: Promise<{ document?: string }> }) {
  const { document } = await searchParams;
  if (document !== "employment-v22" && document !== "manager-nda") notFound();
  return <HrDocumentSigning documentKey={document} />;
}
