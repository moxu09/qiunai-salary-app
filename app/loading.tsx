import { Skeleton } from "@/components/MotionUI";

export default function Loading() {
  return <main className="ui-motion-loading"><Skeleton rows={6} cards label="正在載入頁面" /></main>;
}
