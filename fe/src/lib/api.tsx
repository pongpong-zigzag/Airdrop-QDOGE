import { User } from "./types";

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
  console.log(walletId, txId);
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

export async function getAirdropRes() {
  const res = await fetch(`${BASE_URL}/get_airdrop_res`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to fetch airdrop results");
  return res.json();
}

export async function getInvestBalance(walletId: string) {
  const res = await fetch(`${BASE_URL}/get_res`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId }),
  });
  if (!res.ok) throw new Error("Failed to fetch invest balance");
  return res.json();
}

export async function recordTransaction({ sender, recipient, tx_hash }: { sender: string; recipient: string; tx_hash: string }) {
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
  // Deprecated in refactor. Keep for backwards compatibility.
  return getUser(walletId);
}

export async function updateRes(walletId: string, qearn_bal: number, invest_bal: number) {
  // Deprecated in refactor
  return { wallet_id: walletId, qearn_bal, invest_bal };
}

export async function updateRole(walletId: string, role: string) {
  // Deprecated
  return { wallet_id: walletId, role };
}
