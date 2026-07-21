import AnnouncementManager from "@/components/AnnouncementManager";

export default function SettingsPage() {
  return <main className="min-h-screen p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-5"><section className="rounded-3xl bg-white p-6 shadow-sm sm:p-7"><h1 className="text-2xl font-black text-slate-900">系統設定</h1><p className="mt-3 text-sm leading-6 text-slate-500">集中管理員工公告與薪資網相關設定。</p></section><AnnouncementManager apiPath="/api/qiunai/announcements" accent="pink" /></div></main>;
}
