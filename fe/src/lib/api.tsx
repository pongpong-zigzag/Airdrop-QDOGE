import { Res, User, TransactionRequest } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function getWalletSummary(walletId: string) {
  const res = await fetch(`${BASE_URL}/v1/wallet/${encodeURIComponent(walletId)}/summary`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Failed to fetch wallet summary");
  return data;
}

export async function getUser(walletId: string): Promise<User> {
  const summary = await getWalletSummary(walletId);
  return {
    wallet_id: summary.wallet_id,
    access_info: summary.registered ? 1 : 0,
    role: summary.role ?? "community",
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

export function summaryToRes(summary: any): Res {
  const balances = summary?.balances ?? {};
  return {
    no: 1,
    wallet_id: summary?.wallet_id,
    role: summary?.role ?? "community",
    qubic_bal: Number(balances?.qubic_bal ?? 0),
    qearn_bal: Number(balances?.qearn_bal ?? 0),
    portal_bal: Number(balances?.portal_bal ?? 0),
    qxmr_bal: Number(balances?.qxmr_bal ?? 0),
    airdrop_amt: Number(summary?.airdrop?.estimated ?? 0),
  } as Res;
}
