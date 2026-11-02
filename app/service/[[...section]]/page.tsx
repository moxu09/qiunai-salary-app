import { Suspense } from "react";
import { notFound } from "next/navigation";
import ServiceConsole from "@/components/ServiceConsole";
export default async function Page({ params }: { params: Promise<{section?: string[]}> }) {
 const { section = [] } = await params;
 const path = section.join('/');
 if (path && !['duty','courses','templates','resources','rules','flows','phrases','prices','notes','tracking','broadcasts'].includes(path) && !/^flows\/[a-z0-9-]{1,80}$/.test(path) && !/^courses\/(qiunai|deepnight)\/[a-f0-9-]{36}(\/lessons\/[1-9][0-9]{0,5})?$/i.test(path)) notFound();
 return <Suspense fallback={<p>正在載入客服工作台…</p>}><ServiceConsole /></Suspense>;
}
export const metadata = { title: "客服工作台｜秋奈 × 深夜", description: "雙店客服教程、值班指引與話術模板" };
