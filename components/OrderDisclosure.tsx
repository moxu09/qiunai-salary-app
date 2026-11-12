import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function OrderDisclosure({
  title,
  children,
  id,
  initiallyOpen = false,
}: {
  title: string;
  children: ReactNode;
  id?: string;
  initiallyOpen?: boolean;
}) {
  return (
    <details id={id} open={initiallyOpen} className="group min-w-0 rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-900 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden="true" size={16} className="shrink-0 group-open:rotate-180" />
      </summary>
      <div className="min-w-0 border-t border-slate-100">{children}</div>
    </details>
  );
}
