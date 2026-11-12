const yearOf = (value) =>
  Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric" }).format(
      new Date(value),
    ),
  );
const monthOf = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(value));
export function careerSummary(
  organization,
  staff,
  orders,
  monthlyOrderAmount,
  previousMonthOrderAmount,
  at = new Date(),
) {
  const now = new Date(at);
  const year = yearOf(now);
  const date = (o) => o.order_finished_at || o.completed_at || o.created_at;
  const yearSalary = orders
    .filter((o) => date(o) && yearOf(date(o)) === year)
    .reduce((sum, o) => sum + Number(o.staff_salary || 0), 0);
  const previousYearSalary = orders
    .filter((o) => date(o) && yearOf(date(o)) === year - 1)
    .reduce((sum, o) => sum + Number(o.staff_salary || 0), 0);
  const lifetimeOrderAmount = orders.reduce(
    (sum, o) => sum + Number(o.order_amount ?? o.price ?? 0),
    0,
  );
  const manual = { rate_70: 70, rate_75: 75, rate_80: 80, rate_85: 85, rate_90: 90, manager_95: 95 }[staff.commission_tier];
  let rate = 80;
  let label = "一般檔位";
  if (manual) {
    rate = manual;
    label = manual === 95 ? "主管津貼" : "後台指定檔位";
  } else if (now < new Date("2026-09-01T00:00:00+08:00")) {
    rate = 90;
    label = "開幕期檔位";
  } else if (organization === "qiunai") {
    if (previousYearSalary >= 100000) {
      rate = 90;
      label = "去年薪資達標｜今年 90%";
    } else if (previousMonthOrderAmount >= 10000) {
      rate = 85;
      label = "上月訂單金額滿 10,000｜本月 85%";
    }
  } else {
    if (yearSalary >= 100000) {
      rate = 90;
      label = "年度薪資達標";
    } else {
      let total = 0;
      for (const order of [...orders]
        .filter((o) => date(o))
        .sort((a, b) => new Date(date(a)) - new Date(date(b)))) {
        total += Number(order.order_amount ?? order.price ?? 0);
        if (total < 10000) continue;
        const value = new Date(date(order));
        const parts = monthOf(value).split("-").map(Number);
        const next = new Date(Date.UTC(parts[0], parts[1], 1, 12));
        if (monthOf(now) >= monthOf(next)) {
          rate = 85;
          label = "累計訂單達標，次月起適用";
        }
        break;
      }
    }
  }
  return {
    currentRate: rate,
    currentLabel: label,
    monthlyCreditedSalary: organization === "qiunai" ? monthlyOrderAmount : lifetimeOrderAmount,
    thisYearSalary: yearSalary,
    previousMonthOrderAmount,
  };
}
