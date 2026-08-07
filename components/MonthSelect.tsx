"use client";

type MonthSelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

function taipeiCurrentYear() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      year: "numeric",
    }).format(new Date()),
  );
}

export default function MonthSelect({
  value,
  onChange,
  className = "",
}: MonthSelectProps) {
  const matched = value.match(/^(\d{4})-(\d{2})$/);
  const currentYear = taipeiCurrentYear();
  const selectedYear = matched ? Number(matched[1]) : currentYear;
  const selectedMonth = matched ? matched[2] : "01";
  const firstYear = Math.min(2024, selectedYear);
  const lastYear = Math.max(currentYear, selectedYear);
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => lastYear - index,
  );
  const months = Array.from({ length: 12 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
  );

  return (
    <div
      className={`grid grid-cols-2 gap-2 ${className}`}
      data-no-translate
    >
      <select
        aria-label="年份"
        value={String(selectedYear)}
        onChange={(event) => onChange(`${event.target.value}-${selectedMonth}`)}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year} 年
          </option>
        ))}
      </select>
      <select
        aria-label="月份"
        value={selectedMonth}
        onChange={(event) =>
          onChange(`${selectedYear}-${event.target.value}`)
        }
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {Number(month)} 月
          </option>
        ))}
      </select>
    </div>
  );
}
