import {Suspense} from 'react';
import CourseAdminWorkspace from '@/components/CourseAdminWorkspace';
export default function Page(){return <Suspense fallback={<p>正在載入協作後台…</p>}><CourseAdminWorkspace/></Suspense>;}
export const metadata={title:'協作與課程管理｜秋奈 × 深夜'};
