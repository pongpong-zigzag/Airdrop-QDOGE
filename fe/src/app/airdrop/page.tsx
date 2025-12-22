"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CopyPlus } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { PayModal } from "./PayModal";
import { Button } from "@/components/ui/button";
import { Res } from "@/lib/types";
import { ownedAssetsAtom } from "@/store/assets";
import { useAtom } from "jotai";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAirdropRes, recordTransaction } from "@/lib/api";
import TxPay from "./txpay";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQubicConnect } from "@/components/connect/QubicConnectContext";
import { broadcastTx } from "@/services/rpc.service";
import { createAssetTx } from "@/lib/transfer";
import toast from "react-hot-toast";
import { fetchOwnedAssets } from "@/services/rpc.service";
import { OwnedAssetSnapshot } from "@/types/user.types";

type TabKey = "community" | "portal" | "poweruser";
type RoleKey = "user" | "portal" | "power";

const TAB_CONFIG: Array<{ key: TabKey; label: string; role: RoleKey; emptyMessage: string }> = [
  { key: "community", label: "For Communities", role: "user", emptyMessage: "No community records found." },
  { key: "portal", label: "For Portal Holders", role: "portal", emptyMessage: "No portal holder records found." },
  { key: "poweruser", label: "For PowerUsers", role: "power", emptyMessage: "No poweruser records found." },
];

const normalizeRole = (role?: string): RoleKey => {
  const normalized = role?.toLowerCase();
  if (normalized === "portal" || normalized === "power") {
    return normalized;
  }
  return "user";
};



const isAdminRole = (role?: string): boolean => role?.trim().toLowerCase() === "admin";

const Airdrop: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const { user, error: userError } = useUser();
  const [resTable, setResTable] = useState<Res[]>([]);
  const [resError, setResError] = useState<string | null>(null);
  const [visilbleFundModel, setVisibleFundModal] = useState(false);
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const [ownedAssets] = useAtom(ownedAssetsAtom);
  const connectedWalletId = useMemo(
    () => wallet?.publicKey?.trim().toUpperCase() ?? null,
    [wallet?.publicKey]
  );

  const sendQDOGE = async (walletId: string, amount: number) => {
    
    if (!connected || !wallet) {
      toast.error('Please connect your wallet first');
      return;
    }
    if(wallet.connectType === 'mmSnap') {
      toast.error('MMSnap is not supported yet');
      return;
    }
    if (!isAdminRole(user?.role)) {
      toast.error('You are not authorized to send QDOGE');
      return;
    }
    if(!amount || amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }
    try {
      toast.loading("checking balance...", { id: "check-balance" });
      const assets = await fetchOwnedAssets(wallet?.publicKey);
      const qdogeAsset = await assets.find((asset:OwnedAssetSnapshot) => asset.asset === "QDOGE");
      toast.dismiss("check-balance");

      if (!qdogeAsset) {
        toast.error('QDOGE not found in your assets', { duration: 1000 });
        return;
      }
      if (qdogeAsset.amount < amount) {
        toast.error('Insufficient balance');
        return;
      }

      toast.success('Balance checked successfully');
      toast.loading("sending QDOGE...", { id: "sending" });
    
      const tx = await createAssetTx({
        to: walletId,
        amount: amount,
      });

      const signed = await getSignedTx(tx);
      const signedTx: Uint8Array = signed.tx;

      await broadcastTx(signedTx);

      await recordTransaction({
        sender: wallet.publicKey,
        recipient: walletId,
        tx_hash: tx.getId(),
      });

      toast.dismiss("sending");

      toast.success('QDOGE sent successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send QDOGE";
      toast.error(message);
    } finally {
      toast.dismiss("sending");
    }
  }
  
  const refreshResTable = async () => {
    setLoading(true);
    setResError(null);
    try {
      const result = await getAirdropRes();
      setResTable(result.res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load airdrop results.";
      setResError(message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    refreshResTable();
  }, []);

  const rowsByTab = useMemo<Record<TabKey, Res[]>>(() => {
    const buckets: Record<TabKey, Res[]> = {
      community: [],
      portal: [],
      poweruser: [],
    };

    resTable.forEach((entry) => {
      if (isAdminRole(entry.role)) {
        return;
      }
      const roleKey = normalizeRole(entry.role);
      if (roleKey === "portal") {
        buckets.portal.push(entry);
      } else if (roleKey === "power") {
        buckets.poweruser.push(entry);
      } else {
        buckets.community.push(entry);
      }
    });

    return buckets;
  }, [resTable]);

  const tableError = resError ?? userError ?? null;

  const isCurrentWallet = (walletId: string) => {
    if (!connected || !connectedWalletId) {
      return false;
    }
    return walletId.trim().toUpperCase() === connectedWalletId;
  };

  const formatWalletLabel = (walletId: string) => {
    if (isCurrentWallet(walletId)) {
      return "YOU";
    }
    return `${walletId.slice(0, 6)} ... ${walletId.slice(-6)}`;
  };

  const renderTable = (rows: Res[], emptyMessage: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>No</TableHead>
          <TableHead>Wallet ID</TableHead>
          <TableHead>Qearn Balance</TableHead>
          <TableHead>Invest Balance</TableHead>
          <TableHead>Airdrop</TableHead>
          {isAdminRole(user?.role) && <TableHead className="text-center">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((res) => (
          <TableRow
            key={res.no}
            className={isCurrentWallet(res.wallet_id) ? "font-semibold" : undefined}
          >
            <TableCell>{res.no}</TableCell>
            <TableCell>{formatWalletLabel(res.wallet_id)}</TableCell>
            <TableCell>{res.qearn_bal}</TableCell>
            <TableCell>{res.invest_bal}</TableCell>
            <TableCell>{res.airdrop_amt}</TableCell>
            {isAdminRole(user?.role) && (
              <TableCell className="text-center">
                <Button size="sm" onClick={() => sendQDOGE(res.wallet_id, res.airdrop_amt)}>
                  Send QDOGE
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}

        {loading && (
          <TableRow>
            <TableCell colSpan={5} className="text-center">
              Loading...
            </TableCell>
          </TableRow>
        )}

        {!loading && rows.length === 0 && !tableError && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}

        {tableError && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-destructive">
              Error: {tableError}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto min-h-screen px-4 py-2">
        <div className="justify-end flex gap-2">
          {
            user && <Button variant={"default"} size={"lg"} className="mt-2" onClick={() => setVisibleFundModal(true)}>
              <CopyPlus size={20} />{user.access_info === 0 ? "Register" : "Fund Qubic"}
            </Button>
          }
        </div>
        <Card className="mx-auto w-full border-0 shadow-lg mt-2">
          <Tabs defaultValue="community" className="h-full w-full">
            <TabsList className="mb-2 flex w-full">  
              {TAB_CONFIG.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key} className="flex-1">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {TAB_CONFIG.map((tab) => (
              <TabsContent
                key={tab.key}
                value={tab.key}
                className="h-[calc(100%-40px)] overflow-auto scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-700 dark:scrollbar-track-gray-800 dark:scrollbar-thumb-gray-600"
              >
                {renderTable(rowsByTab[tab.key], tab.emptyMessage)}
              </TabsContent>
            ))}
            
          </Tabs>
        </Card>

        <PayModal open={visilbleFundModel} onClose={() => setVisibleFundModal(false)}  />

        <TxPay onPurchaseComplete={() => refreshResTable()} />
    </div>
  );
};

export default Airdrop;
