"use client";
import {useSearchParams,useRouter,usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import AdminWorkspaceManager from './AdminWorkspaceManager';
import {supabase} from '@/lib/supabase';
export default function CourseAdminWorkspace(){
 const params=useSearchParams(),router=useRouter(),pathname=usePathname();
 const organization=params.get('department')==='qiunai'||pathname.includes('/qiunai/')?'qiunai':'deepnight';
 const [session,setSession]=useState<boolean|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void supabase.auth.getSession().then(({data})=>{if(active)setSession(Boolean(data.session));});const {data}=supabase.auth.onAuthStateChange((_event,session)=>setSession(Boolean(session)));return()=>{active=false;data.subscription.unsubscribe();};},[]);
 async function login(){const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo:`${window.location.origin}/service/manage?department=${organization}`}});if(error)setError('無法開啟 Discord 登入，請稍後再試');}
 return <div className="service-console course-admin-workspace"><header className="service-header"><div><span>QIUNAI × DEEPNIGHT</span><h1>後台協作區</h1></div><a href="/admin">返回 EIP 後台</a></header><div className="service-toolbar"><label>管理店家<select value={organization} onChange={event=>router.replace(`/service/manage?department=${event.target.value}`)}><option value="deepnight">深夜不關燈</option><option value="qiunai">秋奈電競</option></select></label><Link href="/service/courses">前往客服課程 ↗</Link></div>{session===null?<p>正在確認登入…</p>:session?<AdminWorkspaceManager key={organization} organization={organization}/>:<section className="service-card"><p>請使用主管帳號登入後台協作區。</p><button onClick={()=>void login()} type="button">使用 Discord 登入</button>{error?<p role="alert">{error}</p>:null}</section>}</div>;
}
