import { User, Res } from "./types";

// Backend API base URL
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function getUser(walletId: string): Promise<User> {
  const res = await fetch(`${BASE_URL}/v1/users/get-or-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId }),
  });
  if (!res.ok) throw new Error(`Failed to fetch user (${res.status})`);
  const data = await res.json();
  return {
    wallet_id: data.user.wallet_id,
    access_info: data.user.access_info,
    role: data.user.role ?? "user",
  } as User;
}

// Registration requires on-chain verification
export async function confirmRegistration(walletId: string, txId: string) {
  const res = await fetch(`${BASE_URL}/v1/registration/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId, txId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Registration confirmation failed");
  return data;
}

// Funding requires on-chain verification
export async function confirmFunding(walletId: string, txId: string) {
  const res = await fetch(`${BASE_URL}/v1/funding/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId, txId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Funding confirmation failed");
  return data;
}

export async function confirmTradein(walletId: string, txId: string) {
  const res = await fetch(`${BASE_URL}/v1/tradein/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId, txId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Trade-in confirmation failed");
  return data;
}

export async function getAdminAirdropRes(adminApiKey: string): Promise<{ res: Res[] }> {
  const res = await fetch(`${BASE_URL}/admin/airdrop/res`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": adminApiKey,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Failed to fetch admin airdrop results");
  return data as { res: Res[] };
}

export async function getWalletSummary(walletId: string) {
  const res = await fetch(`${BASE_URL}/v1/wallet/${encodeURIComponent(walletId)}/summary`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Failed to fetch wallet summary");
  return data;
}

export async function getAirdropRows(walletId: string): Promise<{ res: Res[] }> {
  const res = await fetch(`${BASE_URL}/v1/airdrop/rows/${encodeURIComponent(walletId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Failed to fetch airdrop rows");
  return data as { res: Res[] };
}

export async function getInvestBalance(walletId: string) {
  // used by txpay.tsx; return legacy shape it expects
  const summary = await getWalletSummary(walletId);
  const funded = summary?.funded_qu ?? 0;
  const qearn = summary?.snapshots?.qearn ?? 0;
  const total = summary?.airdrop?.total ?? 0;
  return { wallet_id: summary?.wallet_id ?? walletId, qearn_bal: qearn, invest_bal: funded, airdrop_amt: total };
}

export async function recordTransaction({
  sender,
  recipient,
  tx_hash,
}: {
  sender: string;
  recipient: string;
  tx_hash: string;
}) {
  const res = await fetch(`${BASE_URL}/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender, recipient, tx_hash }),
  });
  if (!res.ok) throw new Error("Failed to record transaction");
  return res.json();
}

// Legacy no-ops kept so older components compile
export async function updateAccessInfo(walletId: string) {
  return getUser(walletId);
}

export async function updateRes(walletId: string, qearn_bal: number, invest_bal: number) {
  return { wallet_id: walletId, qearn_bal, invest_bal };
}

export async function updateRole(walletId: string, role: string) {
  return { wallet_id: walletId, role };
}
