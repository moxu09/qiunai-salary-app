import ErpLoginCard from "@/components/ErpLoginCard";
import {hrTabForPath} from "@/lib/hrRoutes.mjs";
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){const query=await searchParams;const next=hrTabForPath(query.next||"")?query.next:"/collaboration/workspace";return <ErpLoginCard organization="qiunai" nextPath={next}/>;}
