const BASE = process.env.NEXT_PUBLIC_API_BASE_URL!;

import {User, Res, TransactionRequest} from "./types"


export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const getUser = async (walletId: string): Promise<{ user: User; created: boolean }> => {
  const res = await fetch(`${BASE}/get_user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ walletId }),
  });

  if(!res.ok) {
    const error = await res.json();
    throw new Error( error.error || 'Failed to get user');
  }

  return res.json();
}

export const getAirdropRes = async (): Promise<{ res: Res[] }> => {
  const res = await fetch(`${BASE}/get_airdrop_res`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if(!res.ok){
    const error = await res.json();
    throw new Error( error.error || 'Failed to get Result Table');
  }

  return res.json();
}

export const recordTransaction = async (data: TransactionRequest) => {
  const response = await fetch(`${BASE}/transaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || "Failed to save transaction");
  }

  return response.json() as Promise<{ success: boolean; transaction: { tx_hash: string } }>;
};

export const updateAccessInfo = async (walletId: string): Promise<{ user: User }> => {
  const response = await fetch(`${BASE}/update_access_info`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ walletId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || "Failed to update access info");
  }

  return response.json();
};

export const updateInvestBalance = async (walletId: string, amount: number): Promise<Res> => {
  const response = await fetch(`${BASE}/update_invest_balance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ walletId, amount }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.error || "Failed to update invest balance");
  }

  return response.json();
};