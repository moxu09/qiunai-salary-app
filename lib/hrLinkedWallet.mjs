export const spendable = (value) => Math.max(0, Math.floor(Number(value) || 0));

// Split a department's amount across account balances without rounding past
// any account's balance, including when three accounts contribute.
export function linkedWithdrawalPlan(wallets, amounts) {
  return wallets.flatMap(({ key, sources }) => {
    const total = amounts[key] || 0;
    if (!total) return [];
    const balance = sources.reduce((sum, source) => sum + spendable(source.available), 0);
    if (!Number.isSafeInteger(total) || total < 0 || total > balance)
      throw Error("申請金額無效或超過餘額");
    const plan = sources.map((source, index) => {
      const capacity = spendable(source.available);
      const numerator = BigInt(total) * BigInt(capacity);
      return {
        ...source,
        index,
        capacity,
        amount: Number(numerator / BigInt(balance)),
        remainder: Number(numerator % BigInt(balance)),
      };
    });
    let remaining = total - plan.reduce((sum, source) => sum + source.amount, 0);
    for (const source of [...plan].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
      if (remaining > 0 && source.amount < source.capacity) {
        source.amount++;
        remaining--;
      }
    }
    return plan.filter((s) => s.amount > 0).map((s) => ({
      department: key,
      owner: s.owner,
      amount: s.amount,
      serviceFee: s.serviceFee,
      pendingBank: s.pendingBank,
      bankReady: s.bankReady,
    }));
  });
}

export function withdrawalSourceAmounts(plan, destination) {
  return plan.map(({ department, owner, amount, serviceFee }) => ({ department, owner, amount, fee: destination === "bank" ? serviceFee : 0 }));
}
