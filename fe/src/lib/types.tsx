export type User = {
    no: number;
    wallet_id: string;
    access_info: 0 | 1;
    role: string;
    created_at: string;
    updated_at: string;
  };
  
  export type Res = {
    no: number;
    wallet_id: string;
    qearn_bal: number;
    invest_bal: number;
    airdrop_amt: number;
    created_at: string;
    updated_at: string;
  };
  
  export type Tx = {
    no: number;
    from: string;
    to: string;
    tx_hash: string;
    created_at: string;
    updated_at: string;
  };

export type TransactionRequest = {
  sender: string;
  recipient: string;
  tx_hash: string;
};
  