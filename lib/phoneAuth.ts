const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeErpPhone(value: string) {
  const compact = value.trim().replace(/[\s\-().]/g, "");
  const normalized = compact.startsWith("09") && compact.length === 10
    ? `+886${compact.slice(1)}`
    : compact.startsWith("886")
      ? `+${compact}`
      : compact;

  if (!E164_PHONE_PATTERN.test(normalized)) {
    throw new Error("請輸入有效的電話號碼，例如 0912345678 或 +886912345678");
  }

  return normalized;
}

export function maskErpPhone(value: string) {
  if (!value) return "";
  if (value.length <= 7) return value;
  return `${value.slice(0, 4)}•••${value.slice(-3)}`;
}
