"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function openOrderSection(id: string) {
  const section = document.getElementById(id);
  if (section instanceof HTMLDetailsElement) {
    section.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

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
  const [hasOpened, setHasOpened] = useState(initiallyOpen);

  return (
    <details id={id} open={initiallyOpen} onToggle={(event) => {
      if (event.currentTarget.open) setHasOpened(true);
    }} className="group min-w-0 rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-900 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden="true" size={16} className="shrink-0 group-open:rotate-180" />
      </summary>
      {hasOpened ? <div className="min-w-0 border-t border-slate-100">{children}</div> : null}
    </details>
  );
}
