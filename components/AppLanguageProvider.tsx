"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Locale = "zh-Hant" | "en" | "ja" | "ko";
type TargetLocale = Exclude<Locale, "zh-Hant">;
type Translation = Record<TargetLocale, string>;

const STORAGE_KEY = "wash-language";
const options: Array<{ value: Locale; label: string; short: string }> = [
  { value: "zh-Hant", label: "繁體中文", short: "繁中" },
  { value: "en", label: "English", short: "EN" },
  { value: "ja", label: "日本語", short: "日本語" },
  { value: "ko", label: "한국어", short: "한국어" },
];

const groups: Array<[string[], Translation]> = [
  [["秋奈電競陪玩 ERP", "秋奈電競 ERP"], { en: "Qiunai Esports ERP", ja: "秋奈eスポーツ ERP", ko: "치우나이 e스포츠 ERP" }],
  [["深夜不關燈 ERP"], { en: "We Are Still Here ERP", ja: "深夜不關燈 ERP", ko: "심야불관등 ERP" }],
  [["歡迎使用"], { en: "Welcome to", ja: "ようこそ", ko: "환영합니다" }],
  [["員工入口"], { en: "Employee Portal", ja: "従業員ポータル", ko: "직원 포털" }],
  [["登入後會依你的 ERP 權限顯示薪資、訂單、簽核與管理功能。"], { en: "After signing in, payroll, orders, approvals and management tools are shown according to your ERP access.", ja: "ログイン後、ERP権限に応じて給与、注文、承認、管理機能が表示されます。", ko: "로그인 후 ERP 권한에 따라 급여, 주문, 결재 및 관리 기능이 표시됩니다." }],
  [["第一次登入一定要使用 Discord。完成第一次登入並主動連結後，才可使用 Google（Gmail）或電子郵件密碼登入。"], { en: "Your first sign-in must use Discord. After linking an account, you may use Google (Gmail) or email and password.", ja: "初回ログインはDiscordをご利用ください。連携後はGoogle（Gmail）またはメールアドレスとパスワードでログインできます。", ko: "첫 로그인은 Discord를 사용해야 합니다. 계정 연결 후 Google(Gmail) 또는 이메일과 비밀번호로 로그인할 수 있습니다." }],
  [["使用 Discord"], { en: "Continue with Discord", ja: "Discordで続ける", ko: "Discord로 계속" }],
  [["使用 Google / Gmail"], { en: "Continue with Google / Gmail", ja: "Google / Gmailで続ける", ko: "Google / Gmail로 계속" }],
  [["或使用已連結的電子郵件"], { en: "Or use a linked email account", ja: "または連携済みメールアドレスを使用", ko: "또는 연결된 이메일 사용" }],
  [["已連結電子郵件時設定的密碼"], { en: "Password set when linking your email", ja: "メール連携時に設定したパスワード", ko: "이메일 연결 시 설정한 비밀번호" }],
  [["使用電子郵件登入"], { en: "Sign in with Email", ja: "メールでログイン", ko: "이메일로 로그인" }],
  [["請從左側選單開始工作"], { en: "Choose an item from the left menu to begin", ja: "左側メニューから開始してください", ko: "왼쪽 메뉴에서 업무를 시작하세요" }],
  [["人事"], { en: "Human Resources", ja: "人事", ko: "인사" }],
  [["訂單"], { en: "Orders", ja: "注文", ko: "주문" }],
  [["簽核"], { en: "Approvals", ja: "承認", ko: "결재" }],
  [["個人資料"], { en: "Profile", ja: "個人情報", ko: "개인 정보" }],
  [["行政服務申請"], { en: "Administrative Request", ja: "管理サービス申請", ko: "행정 서비스 신청" }],
  [["福利申請"], { en: "Benefits Request", ja: "福利厚生申請", ko: "복지 신청" }],
  [["訂單明細"], { en: "Order Details", ja: "注文詳細", ko: "주문 내역" }],
  [["打賞明細"], { en: "Gift Details", ja: "ギフト詳細", ko: "후원 내역" }],
  [["獎金明細"], { en: "Bonus Details", ja: "賞与詳細", ko: "보너스 내역" }],
  [["薪資扣項"], { en: "Payroll Deductions", ja: "給与控除", ko: "급여 공제" }],
  [["行政服務簽核"], { en: "Administrative Approvals", ja: "管理サービス承認", ko: "행정 서비스 결재" }],
  [["報銷簽核"], { en: "Expense Approvals", ja: "経費精算承認", ko: "경비 결재" }],
  [["福利簽核"], { en: "Benefits Approvals", ja: "福利厚生承認", ko: "복지 결재" }],
  [["請假單簽核"], { en: "Leave Approvals", ja: "休暇申請承認", ko: "휴가 결재" }],
  [["留職停薪簽核"], { en: "Unpaid Leave Approvals", ja: "休職承認", ko: "무급휴직 결재" }],
  [["員工管理"], { en: "Employee Management", ja: "従業員管理", ko: "직원 관리" }],
  [["員工列表"], { en: "Employee List", ja: "従業員一覧", ko: "직원 목록" }],
  [["訂單總覽"], { en: "Order Overview", ja: "注文一覧", ko: "주문 현황" }],
  [["發薪模式"], { en: "Payroll", ja: "給与支給", ko: "급여 지급" }],
  [["薪資排序"], { en: "Salary Ranking", ja: "給与ランキング", ko: "급여 순위" }],
  [["簽核申請"], { en: "Approval Requests", ja: "承認申請", ko: "결재 신청" }],
  [["資料下載"], { en: "Downloads", ja: "資料ダウンロード", ko: "자료 다운로드" }],
  [["會計報表"], { en: "Accounting Reports", ja: "会計レポート", ko: "회계 보고서" }],
  [["系統設定"], { en: "System Settings", ja: "システム設定", ko: "시스템 설정" }],
  [["公告管理", "公告事項"], { en: "Announcements", ja: "お知らせ", ko: "공지 사항" }],
  [["營運相關"], { en: "Operations", ja: "運営関連", ko: "운영 관련" }],
  [["員工相關"], { en: "Employee Resources", ja: "従業員関連", ko: "직원 관련" }],
  [["上傳檔案"], { en: "Upload File", ja: "ファイルをアップロード", ko: "파일 업로드" }],
  [["拖曳調整排序"], { en: "Drag to reorder", ja: "ドラッグして並べ替え", ko: "드래그하여 순서 변경" }],
  [["下載"], { en: "Download", ja: "ダウンロード", ko: "다운로드" }],
  [["刪除"], { en: "Delete", ja: "削除", ko: "삭제" }],
  [["編輯"], { en: "Edit", ja: "編集", ko: "수정" }],
  [["新增"], { en: "Add", ja: "追加", ko: "추가" }],
  [["儲存"], { en: "Save", ja: "保存", ko: "저장" }],
  [["取消"], { en: "Cancel", ja: "キャンセル", ko: "취소" }],
  [["確認"], { en: "Confirm", ja: "確認", ko: "확인" }],
  [["送出申請"], { en: "Submit Request", ja: "申請を送信", ko: "신청 제출" }],
  [["送出"], { en: "Submit", ja: "送信", ko: "제출" }],
  [["返回"], { en: "Back", ja: "戻る", ko: "뒤로" }],
  [["關閉"], { en: "Close", ja: "閉じる", ko: "닫기" }],
  [["重新整理"], { en: "Refresh", ja: "更新", ko: "새로고침" }],
  [["讀取中", "載入中"], { en: "Loading", ja: "読み込み中", ko: "불러오는 중" }],
  [["查詢", "搜尋"], { en: "Search", ja: "検索", ko: "검색" }],
  [["全部"], { en: "All", ja: "すべて", ko: "전체" }],
  [["開始日期"], { en: "Start Date", ja: "開始日", ko: "시작일" }],
  [["結束日期"], { en: "End Date", ja: "終了日", ko: "종료일" }],
  [["申請日期"], { en: "Request Date", ja: "申請日", ko: "신청일" }],
  [["需求日期"], { en: "Required Date", ja: "希望日", ko: "요청일" }],
  [["建立時間"], { en: "Created At", ja: "作成日時", ko: "생성 시간" }],
  [["完成時間"], { en: "Completion Time", ja: "完了日時", ko: "완료 시간" }],
  [["日期"], { en: "Date", ja: "日付", ko: "날짜" }],
  [["時間"], { en: "Time", ja: "日時", ko: "시간" }],
  [["月份"], { en: "Month", ja: "月", ko: "월" }],
  [["部門"], { en: "Department", ja: "部署", ko: "부서" }],
  [["員工暱稱"], { en: "Employee Nickname", ja: "従業員ニックネーム", ko: "직원 닉네임" }],
  [["員工編號"], { en: "Employee ID", ja: "従業員番号", ko: "직원 번호" }],
  [["員工"], { en: "Employee", ja: "従業員", ko: "직원" }],
  [["聯絡方式"], { en: "Contact", ja: "連絡先", ko: "연락처" }],
  [["緊急程度"], { en: "Priority", ja: "緊急度", ko: "긴급도" }],
  [["一般"], { en: "Normal", ja: "通常", ko: "일반" }],
  [["急件"], { en: "Urgent", ja: "緊急", ko: "긴급" }],
  [["需求分類"], { en: "Request Category", ja: "申請分類", ko: "요청 분류" }],
  [["申請內容"], { en: "Request Details", ja: "申請内容", ko: "신청 내용" }],
  [["上傳圖片"], { en: "Upload Image", ja: "画像をアップロード", ko: "이미지 업로드" }],
  [["發票或付款證明"], { en: "Invoice or Proof of Payment", ja: "領収書または支払証明", ko: "영수증 또는 결제 증빙" }],
  [["付款證明"], { en: "Proof of Payment", ja: "支払証明", ko: "결제 증빙" }],
  [["必填"], { en: "Required", ja: "必須", ko: "필수" }],
  [["選填"], { en: "Optional", ja: "任意", ko: "선택" }],
  [["福利項目"], { en: "Benefit", ja: "福利厚生項目", ko: "복지 항목" }],
  [["生日禮金"], { en: "Birthday Gift", ja: "誕生日祝い金", ko: "생일 축하금" }],
  [["開工紅包"], { en: "New Year Bonus", ja: "仕事始め祝い金", ko: "개업 축하금" }],
  [["肉粽補助"], { en: "Dragon Boat Subsidy", ja: "端午節補助", ko: "단오 지원금" }],
  [["月餅補助"], { en: "Mid-Autumn Subsidy", ja: "中秋節補助", ko: "추석 지원금" }],
  [["聖誕補助"], { en: "Christmas Subsidy", ja: "クリスマス補助", ko: "크리스마스 지원금" }],
  [["錢包餘額"], { en: "Wallet Balance", ja: "ウォレット残高", ko: "지갑 잔액" }],
  [["申請提領"], { en: "Request Withdrawal", ja: "出金申請", ko: "출금 신청" }],
  [["提領薪資單"], { en: "Withdrawal Statement", ja: "出金明細", ko: "출금 명세서" }],
  [["匯出 PDF"], { en: "Export PDF", ja: "PDF出力", ko: "PDF 내보내기" }],
  [["提領狀態"], { en: "Withdrawal Status", ja: "出金状況", ko: "출금 상태" }],
  [["申請金額"], { en: "Requested Amount", ja: "申請金額", ko: "신청 금액" }],
  [["實際匯款"], { en: "Net Transfer", ja: "実振込額", ko: "실제 송금액" }],
  [["福利金"], { en: "Welfare Fee", ja: "福利厚生費", ko: "복지 기금" }],
  [["手續費"], { en: "Service Fee", ja: "手数料", ko: "수수료" }],
  [["訂單薪水"], { en: "Order Pay", ja: "注文給与", ko: "주문 급여" }],
  [["獎金／扣除"], { en: "Bonuses / Deductions", ja: "賞与・控除", ko: "보너스 / 공제" }],
  [["使用的薪水"], { en: "Paid Out", ja: "支給済み", ko: "지급 완료" }],
  [["總收入"], { en: "Total Income", ja: "総収入", ko: "총수입" }],
  [["薪資支出"], { en: "Payroll Expense", ja: "給与支出", ko: "급여 지출" }],
  [["未發薪"], { en: "Unpaid", ja: "未払い", ko: "미지급" }],
  [["已發薪"], { en: "Paid", ja: "支給済み", ko: "지급 완료" }],
  [["新增訂單"], { en: "Add Order", ja: "注文を追加", ko: "주문 추가" }],
  [["新增獎金"], { en: "Add Bonus", ja: "賞与を追加", ko: "보너스 추가" }],
  [["新增薪水扣除"], { en: "Add Deduction", ja: "給与控除を追加", ko: "급여 공제 추가" }],
  [["批次發薪"], { en: "Batch Payroll", ja: "一括給与支給", ko: "일괄 급여 지급" }],
  [["批次匯入錢包"], { en: "Batch Import to Wallet", ja: "ウォレットへ一括反映", ko: "지갑 일괄 반영" }],
  [["訂單金額"], { en: "Order Amount", ja: "注文金額", ko: "주문 금액" }],
  [["員工抽成"], { en: "Employee Share", ja: "従業員歩合", ko: "직원 배분율" }],
  [["獎金金額"], { en: "Bonus Amount", ja: "賞与金額", ko: "보너스 금액" }],
  [["扣除金額"], { en: "Deduction Amount", ja: "控除額", ko: "공제 금액" }],
  [["狀態"], { en: "Status", ja: "ステータス", ko: "상태" }],
  [["備註"], { en: "Notes", ja: "備考", ko: "비고" }],
  [["通過"], { en: "Approve", ja: "承認", ko: "승인" }],
  [["駁回"], { en: "Reject", ja: "却下", ko: "반려" }],
  [["待審核"], { en: "Pending", ja: "承認待ち", ko: "검토 대기" }],
  [["已通過"], { en: "Approved", ja: "承認済み", ko: "승인됨" }],
  [["已駁回"], { en: "Rejected", ja: "却下済み", ko: "반려됨" }],
  [["簽核結果"], { en: "Approval Result", ja: "承認結果", ko: "결재 결과" }],
  [["簽核人"], { en: "Approved By", ja: "承認者", ko: "결재자" }],
  [["帳號權限", "權限管理"], { en: "Access Control", ja: "権限管理", ko: "권한 관리" }],
  [["總管理員"], { en: "Super Admin", ja: "スーパー管理者", ko: "최고 관리자" }],
  [["店經理"], { en: "Store Manager", ja: "店舗マネージャー", ko: "매장 관리자" }],
  [["客服"], { en: "Customer Support", ja: "カスタマーサポート", ko: "고객 지원" }],
  [["啟用"], { en: "Active", ja: "有効", ko: "활성" }],
  [["停用"], { en: "Inactive", ja: "無効", ko: "비활성" }],
  [["上線"], { en: "Online", ja: "オンライン", ko: "온라인" }],
  [["下線"], { en: "Offline", ja: "オフライン", ko: "오프라인" }],
  [["電子郵件"], { en: "Email", ja: "メール", ko: "이메일" }],
  [["密碼"], { en: "Password", ja: "パスワード", ko: "비밀번호" }],
  [["使用 Discord 登入"], { en: "Continue with Discord", ja: "Discordでログイン", ko: "Discord로 로그인" }],
  [["使用 Google 登入"], { en: "Continue with Google", ja: "Googleでログイン", ko: "Google로 로그인" }],
  [["登入"], { en: "Sign In", ja: "ログイン", ko: "로그인" }],
  [["登出"], { en: "Sign Out", ja: "ログアウト", ko: "로그아웃" }],
  [["選擇語言"], { en: "Choose language", ja: "言語を選択", ko: "언어 선택" }],
];

const phrases = Object.fromEntries(groups.flatMap(([sources, translation]) => sources.map((source) => [source, translation]))) as Record<string, Translation>;
const attributes = ["placeholder", "title", "aria-label"] as const;
const textRecords = new WeakMap<Text, { source: string; applied: string }>();
const attributeRecords = new WeakMap<Element, Map<string, { source: string; applied: string }>>();

function translate(source: string, locale: Locale) {
  if (locale === "zh-Hant" || !/[\u3400-\u9fff]/u.test(source)) return source;
  const language = locale as TargetLocale;
  const exact = phrases[source.trim()]?.[language];
  if (exact) return source.replace(source.trim(), exact);
  return source;
}

function skipped(element: Element | null) {
  return Boolean(element?.closest("script, style, code, pre, [data-no-translate]"));
}

function translateNode(node: Text, locale: Locale) {
  if (skipped(node.parentElement)) return;
  const current = node.nodeValue ?? "";
  const saved = textRecords.get(node);
  const source = !saved || (current !== saved.applied && current !== saved.source) ? current : saved.source;
  const applied = translate(source, locale);
  textRecords.set(node, { source, applied });
  if (current !== applied) node.nodeValue = applied;
}

function translateAttributes(element: Element, locale: Locale) {
  if (skipped(element)) return;
  const records = attributeRecords.get(element) ?? new Map();
  attributes.forEach((attribute) => {
    const current = element.getAttribute(attribute);
    if (!current) return;
    const saved = records.get(attribute);
    const source = !saved || (current !== saved.applied && current !== saved.source) ? current : saved.source;
    const applied = translate(source, locale);
    records.set(attribute, { source, applied });
    if (current !== applied) element.setAttribute(attribute, applied);
  });
  attributeRecords.set(element, records);
}

function translateTree(root: ParentNode, locale: Locale) {
  if (root instanceof Element) translateAttributes(root, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateNode(node as Text, locale);
    else translateAttributes(node as Element, locale);
    node = walker.nextNode();
  }
}

export default function AppLanguageProvider() {
  const [locale, setLocale] = useState<Locale>("zh-Hant");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (!saved || !options.some((option) => option.value === saved)) return;
    const timer = window.setTimeout(() => setLocale(saved), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
    translateTree(document.body, locale);
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
      if (mutation.type === "characterData") translateNode(mutation.target as Text, locale);
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) translateNode(node as Text, locale);
        else if (node instanceof Element) translateTree(node, locale);
      });
      if (mutation.type === "attributes" && mutation.target instanceof Element) translateAttributes(mutation.target, locale);
    }));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...attributes] });
    return () => observer.disconnect();
  }, [locale]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const selected = options.find((option) => option.value === locale) ?? options[0];
  return (
    <div className="erp-language" data-no-translate ref={rootRef}>
      {open && (
        <div className="erp-language__menu" role="menu" aria-label="Choose language">
          <p>Language</p>
          {options.map((option) => (
            <button key={option.value} type="button" role="menuitemradio" aria-checked={locale === option.value} onClick={() => { setLocale(option.value); setOpen(false); }}>
              <span>{option.label}</span>
              {locale === option.value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
      <button className="erp-language__trigger" type="button" aria-label="Choose language" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Languages size={18} />
        <span>{selected.short}</span>
        <ChevronDown size={14} className={open ? "is-open" : ""} />
      </button>
    </div>
  );
}
