import { ICHIBAN_ORIGIN } from "@/lib/ichibanEcpay";

// 前景返回僅導頁，不憑它的參數發獎；網站會再查詢街口的正式交易狀態。
export function GET() {
  return Response.redirect(`${ICHIBAN_ORIGIN}/ichiban?payment=pending`, 303);
}
