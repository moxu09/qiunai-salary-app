export const spendable = (value) => Math.max(0, Math.floor(Number(value) || 0));

function eligibleSources(sources, destination) {
  return sources.filter((s) => spendable(s.available) >
    (destination === "bank" ? s.serviceFee : 0) &&
    (destination !== "bank" || (s.bankReady && !s.pendingBank)));
}

export function withdrawalBalances(wallets, destination) {
  return Object.fromEntries(wallets.map(({ key, sources }) => [
    key,
    eligibleSources(sources, destination).reduce((sum, s) => sum + spendable(s.available), 0),
  ]));
}

function proportional(sources, total, minimum = () => 0) {
  const remaining = total - sources.reduce((sum, source) => sum + minimum(source), 0);
  const capacity = sources.reduce((sum, source) => sum + spendable(source.available) - minimum(source), 0);
  const plan = sources.map((source, index) => {
    const room = spendable(source.available) - minimum(source);
    const numerator = BigInt(remaining) * BigInt(room);
    return {
      ...source,
      index,
      room: spendable(source.available),
      amount: minimum(source) + (capacity ? Number(numerator / BigInt(capacity)) : 0),
      remainder: capacity ? Number(numerator % BigInt(capacity)) : 0,
    };
  });
  let rounding = total - plan.reduce((sum, source) => sum + source.amount, 0);
  for (const source of [...plan].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (rounding > 0 && source.amount < source.room) {
      source.amount++;
      rounding--;
    }
  }
  return plan.filter((s) => s.amount > 0);
}

function bankPlan(sources, total, ideal) {
  const usable = ideal.filter((s) => s.amount > s.serviceFee);
  if (usable.length === ideal.length) return ideal;
  // Drop very small shares when other sources can cover the full amount. If
  // they're needed, find a subset with enough room for each source's fee.
  if (usable.reduce((sum, s) => sum + spendable(s.available), 0) >= total)
    return bankPlan(usable, total, proportional(usable, total));
  const subsets = Array.from({ length: (1 << sources.length) - 1 }, (_, index) =>
    sources.filter((_, i) => ((index + 1) & (1 << i)) !== 0));
  const minimum = (s) => s.serviceFee + 1;
  const picked = subsets
    .filter((set) => set.reduce((sum, s) => sum + minimum(s), 0) <= total &&
      set.reduce((sum, s) => sum + spendable(s.available), 0) >= total)
    .sort((a, b) => b.length - a.length)[0];
  if (!picked) throw Error("分配金額不足扣除手續費，請調整金額或分開輸入");
  return proportional(picked, total, minimum);
}

export function linkedWithdrawalPlan(wallets, amounts, destination = "asd") {
  return wallets.flatMap(({ key, sources }) => {
    const total = amounts[key] || 0;
    if (!total) return [];
    const eligible = eligibleSources(sources, destination);
    const balance = eligible.reduce((sum, s) => sum + spendable(s.available), 0);
    if (!Number.isSafeInteger(total) || total < 0 || total > balance)
      throw Error("申請金額無效或超過餘額");
    const ideal = proportional(eligible, total);
    const plan = destination === "bank" ? bankPlan(eligible, total, ideal) : ideal;
    return plan.map(({ owner, amount, serviceFee }) => ({ department: key, owner, amount, serviceFee }));
  });
}

export function withdrawalSourceAmounts(plan, destination) {
  return plan.map(({ department, owner, amount, serviceFee }) => ({ department, owner, amount, fee: destination === "bank" ? serviceFee : 0 }));
}
