import "server-only";
import { HR_CONFIG } from "@/lib/hrServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Only financial endpoints use the verified alternate scope. Other HR features
// and department permissions still use the signed-in account.
export async function hrFinancialScope({ discordId, departments }) {
  const { data, error } = await supabaseAdmin.from("hr_account_links")
    .select("alternate_id,verified_departments")
    .eq("primary_id", discordId)
    .not("verified_at", "is", null)
    .order("alternate_id");
  if (error) throw error;
  return Promise.all(Object.entries(HR_CONFIG).map(async ([key, config]) => {
    const alternates = data.filter((row) => row.verified_departments.includes(key)).map((row) => row.alternate_id);
    const ids = departments.some((d) => d.key === key) ? [discordId] : [];
    if (alternates.length) {
      const { data: rows, error: staffError } = await supabaseAdmin.from(config.staff)
        .select("discord_id")
        .in("discord_id", alternates)
        .or("is_active.eq.true,is_active.is.null");
      if (staffError) throw staffError;
      ids.push(...alternates.filter((id) => rows.some((row) => row.discord_id === id)));
    }
    return { key, ids };
  })).then((scopes) => scopes.filter(({ ids }) => ids.length));
}

export async function hrLinkedWallets(auth, request) {
  const { hrSource } = await import("@/lib/hrUpstream");
  const { getSalaryWalletSummary } = await import("@/lib/salaryWallet");
  const [scopes, linkedBank] = await Promise.all([
    hrFinancialScope(auth),
    supabaseAdmin.rpc("hr_linked_bank_status", { p_actor: auth.discordId }),
  ]);
  if (linkedBank.error) throw linkedBank.error;
  const month = taipeiMonth(Date.now());
  return Promise.all(scopes.map(async ({ key, ids }) => {
    const parts = await Promise.all(ids.map(async (owner) => {
      const own = owner === auth.discordId;
      const upstream = own ? await hrSource(request, key, "salary-wallet") : null;
      const wallet = upstream?.wallet || await getSalaryWalletSummary(supabaseAdmin, key, owner);
      if (linkedBank.data?.owner) return { owner, wallet, bankReady: linkedBank.data.ready };
      const { data: staff, error } = await supabaseAdmin.from(HR_CONFIG[key].staff)
        .select("bank_name,bank_account")
        .eq("discord_id", owner)
        .maybeSingle();
      if (error) throw error;
      return { owner, wallet, bankReady: Boolean(staff?.bank_name?.trim() && staff?.bank_account?.trim()) };
    }));
    const sources = parts.map(({ owner, wallet, bankReady }) => {
      const chargedBefore = key === "deepnight"
        ? wallet.requests.some((row) => row.status === "approved" &&
          (row.destination || "bank") === "bank" && row.requested_at && taipeiMonth(row.requested_at) === month)
        : wallet.withdrawPolicy.monthlyWithdrawalCount > 0;
      return {
        owner,
        available: wallet.totals.available,
        bankReady,
        serviceFee: chargedBefore ? 15 : 0,
        pendingBank: wallet.requests.some((r) => r.status === "pending" && (r.destination || "bank") === "bank"),
      };
    });
    const total = (field) => parts.reduce((sum, part) => sum + Number(part.wallet.totals[field]), 0);
    return {
      key,
      sources,
      bankOwner: linkedBank.data?.owner || null,
      wallet: {
        totals: {
          available: sources.reduce((sum, s) => sum + Math.max(0, Math.floor(s.available)), 0),
          deposited: total("deposited"),
          pendingWithdrawn: total("pendingWithdrawn"),
        },
        withdrawWindow: parts[0].wallet.withdrawWindow,
        entries: parts.flatMap(({ wallet }) => wallet.entries),
        requests: parts.flatMap(({ wallet }) => wallet.requests),
      },
    };
  }));
}

function taipeiMonth(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit",
  }).format(new Date(value));
}
