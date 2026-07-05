import { redirect } from "next/navigation";

export default function AccountingTypoRedirectPage() {
  redirect("/admin/accounting");
}
