"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { confirmUI } from "./ConfirmationUI";
import { PullToRefresh } from "./InteractionUI";

export default function PageRefresh({ children }: { children: React.ReactNode }) {
  const edited = useRef(false);
  const pathname = usePathname();
  useEffect(() => { edited.current = false; }, [pathname]);
  useEffect(() => {
    const changed = (event: Event) => {
      if (event.target instanceof Element && event.target.matches("input, textarea, select, [contenteditable]")) edited.current = true;
    };
    const reordered = () => { edited.current = true; };
    document.addEventListener("input", changed, true);
    document.addEventListener("change", changed, true);
    document.addEventListener("ui:edited", reordered);
    return () => { document.removeEventListener("input", changed, true); document.removeEventListener("change", changed, true); document.removeEventListener("ui:edited", reordered); };
  }, []);

  async function refresh() {
    if (edited.current && !await confirmUI("重新整理會清除這一頁尚未送出的內容，確定繼續嗎？")) return;
    window.location.reload();
  }
  return <PullToRefresh onRefresh={refresh}>{children}</PullToRefresh>;
}
