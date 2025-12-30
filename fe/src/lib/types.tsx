export type User = {
  wallet_id: string;
  access_info: 0 | 1; // 1 = registered
  role: "community" | "portal" | "power" | "admin" | string;
  roles?: string[];
  no?: number;
  created_at?: string;
  updated_at?: string;
};

export type Res = {
  no: number;
  wallet_id: string;
  role?: string;
  roles?: string[];
  community_amt?: number;
  portal_amt?: number;
  power_amt?: number;
  qubic_bal: number;
  qearn_bal: number;
  portal_bal: number;
  qxmr_bal: number;
  airdrop_amt: number;
  created_at?: string;
  updated_at?: string;
};

export type Tx = {
  no?: number;
  wallet_id?: string;
  from?: string;
  to?: string;
  txId: string;
  type?: string;
  amount?: number;
  created_at?: string;
  updated_at?: string;
};

export type TransactionRequest = {
  wallet_id: string;
  from_id: string;
  to_id: string;
  txId: string;
  type: string;
  amount: number;
};
