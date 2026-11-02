import { notFound } from "next/navigation";
import ServiceConsole from "@/components/ServiceConsole";
export default async function Page({ params }: { params: Promise<{section?: string[]}> }) {
 const { section = [] } = await params;
 const path = section.join('/');
 if (path && !['duty','courses','templates','resources','rules'].includes(path) && !/^courses\/(qiunai|deepnight)\/[a-f0-9-]{36}(\/lessons\/[1-9][0-9]{0,5})?$/i.test(path)) notFound();
 return <ServiceConsole />;
}
export const metadata = { title: "客服工作台｜秋奈 × 深夜", description: "雙店客服教程、值班指引與話術模板" };
