import { Res, User, TransactionRequest } from "./types";

export type WalletSummary = {
  wallet_id: string;
  registered: boolean;
  role?: string;
  roles?: string[];
  detail?: string;
  balances?: {
    qubic_bal?: number;
    qubic_bal_capped?: number;
    qearn_bal?: number;
    portal_bal?: number;
    qxmr_bal?: number;
    qubic_cap?: number;
  };
  airdrop?: {
    estimated?: number;
    breakdown?: {
      community?: number;
      portal?: number;
      power?: number;
    };
  };
};

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type SummaryOptions = { fresh?: boolean };

export async function getWalletSummary(walletId: string, options?: SummaryOptions): Promise<WalletSummary> {
  const fresh = options?.fresh ? "?fresh=1" : "";
  const res = await fetch(`${BASE_URL}/v1/wallet/${encodeURIComponent(walletId)}/summary${fresh}`, {
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as WalletSummary;
  if (!res.ok) throw new Error(data?.detail || "Failed to fetch wallet summary");
  return data;
}

export async function getUser(walletId: string, options?: SummaryOptions): Promise<User> {
  const summary = await getWalletSummary(walletId, options);
  const roles = Array.isArray(summary?.roles)
    ? summary.roles
    : typeof summary?.role === "string"
      ? summary.role.split(",").map((r: string) => r.trim()).filter(Boolean)
      : [];
  return {
    wallet_id: summary.wallet_id,
    access_info: summary.registered ? 1 : 0,
    role: roles[0] ?? summary.role ?? "community",
    roles,
  } as User;
}

export async function confirmRegistration(walletId: string, txId: string) {
  const res = await fetch(`${BASE_URL}/v1/registration/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId, txId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Registration confirmation failed");
  return data;
}

export async function confirmTradein(walletId: string, txId: string) {
  const res = await fetch(`${BASE_URL}/v1/tradein/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId, txId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Trade-in confirmation failed");
  return data;
}

export async function getAdminAirdropRes(adminApiKey: string): Promise<{ res: Res[] }> {
  const res = await fetch(`${BASE_URL}/v1/admin/res`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": adminApiKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Failed to fetch admin results");
  return data as { res: Res[] };
}

export async function recomputeAdmin(adminApiKey: string) {
  const res = await fetch(`${BASE_URL}/v1/admin/recompute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": adminApiKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Failed to recompute");
  return data;
}

export async function recordTransaction(adminApiKey: string, payload: TransactionRequest) {
  const res = await fetch(`${BASE_URL}/v1/transaction/log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": adminApiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Failed to record transaction");
  return data;
}

export function summaryToRes(summary: WalletSummary): Res {
  const balances = summary?.balances ?? {};
  const roles: string[] = Array.isArray(summary?.roles)
    ? summary.roles
    : typeof summary?.role === "string"
      ? summary.role.split(",").map((r: string) => r.trim()).filter(Boolean)
      : [];
  const breakdown = summary?.airdrop?.breakdown ?? {};
  const community_amt = Number(breakdown?.community ?? 0);
  const portal_amt = Number(breakdown?.portal ?? 0);
  const power_amt = Number(breakdown?.power ?? 0);
  const total = community_amt + portal_amt + power_amt;
  return {
    no: 1,
    wallet_id: summary?.wallet_id,
    role: roles.join(", "),
    roles,
    community_amt,
    portal_amt,
    power_amt,
    qubic_bal: Number(balances?.qubic_bal ?? 0),
    qearn_bal: Number(balances?.qearn_bal ?? 0),
    portal_bal: Number(balances?.portal_bal ?? 0),
    qxmr_bal: Number(balances?.qxmr_bal ?? 0),
    airdrop_amt: Number(summary?.airdrop?.estimated ?? total),
  } as Res;
}
