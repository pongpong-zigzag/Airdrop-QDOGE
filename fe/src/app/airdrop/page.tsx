"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useUser } from "@/contexts/UserContext";
import { useQubicConnect } from "@/components/connect/QubicConnectContext";
import { fetchOwnedAssets, broadcastTx } from "@/services/rpc.service";
import { createAssetTx } from "@/lib/transfer";
import { OwnedAssetSnapshot } from "@/types/user.types";

import { getAdminAirdropRes, getWalletSummary, recordTransaction, summaryToRes } from "@/lib/api";
import { Res } from "@/lib/types";
import { useAtom } from "jotai";
import { settingsAtom } from "@/store/settings";

import TxPay from "./txpay";
import { RegisterModal } from "./RegisterModal";

type TabKey = "community" | "portal" | "power";

const normalizeRole = (role?: string): "community" | "portal" | "power" => {
  const r = (role ?? "").toLowerCase();
  if (r === "power") return "power";
  if (r === "portal") return "portal";
  return "community";
};

export default function AirdropPage() {
  const { user, error: userError } = useUser();
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const [settings] = useAtom(settingsAtom);

  const [loading, setLoading] = useState(true);
  const [resTable, setResTable] = useState<Res[]>([]);
  const [walletSummary, setWalletSummary] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  const connectedWalletId = useMemo(
    () => wallet?.publicKey?.trim().toUpperCase() ?? null,
    [wallet?.publicKey],
  );

  const isAdmin = useMemo(
    () => (walletSummary?.role ?? "").toLowerCase() === "admin",
    [walletSummary?.role],
  );
  const canSeeAll = useMemo(
    () => isAdmin && !!settings.adminApiKey?.trim(),
    [isAdmin, settings.adminApiKey],
  );

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      let summary: any | null = null;
      if (connectedWalletId) {
        summary = await getWalletSummary(connectedWalletId);
        setWalletSummary(summary);
      } else {
        setWalletSummary(null);
      }

      const isAdminRole = (summary?.role ?? "").toLowerCase() === "admin";
      const adminKey = settings.adminApiKey?.trim();

      if (isAdminRole && adminKey) {
        const data = await getAdminAirdropRes(adminKey);
        setResTable(data.res ?? []);
      } else if (summary) {
        setResTable([summaryToRes(summary)]);
      } else {
        setResTable([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load airdrop data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [connectedWalletId, settings.adminApiKey]);

  const rowsByRole = useMemo(() => {
    const buckets: Record<TabKey, Res[]> = { community: [], portal: [], power: [] };
    for (const r of resTable) {
      const role = normalizeRole(r.role);
      buckets[role].push(r);
    }
    return buckets;
  }, [resTable]);

  const sendQDOGE = async (destWallet: string, amount: number) => {
    if (!connected || !wallet) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!canSeeAll) {
      toast.error("Admin API key required");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    try {
      toast.loading("Checking QDOGE balance...", { id: "check" });
      const assets = await fetchOwnedAssets(wallet.publicKey);
      const qdogeAsset = assets.find((a: OwnedAssetSnapshot) => a.asset === "QDOGE");
      toast.dismiss("check");
      if (!qdogeAsset) {
        toast.error("QDOGE not found in your assets");
        return;
      }
      if (qdogeAsset.amount < amount) {
        toast.error("Insufficient QDOGE balance");
        return;
      }

      toast.loading("Signing & broadcasting...", { id: "send" });
      const tx = await createAssetTx({ from: wallet.publicKey, to: destWallet, amount });
      const signed = await getSignedTx(tx);
      const broadcastResult = await broadcastTx(signed.tx);
      const txId = broadcastResult.transactionId;

      await recordTransaction(settings.adminApiKey, {
        wallet_id: wallet.publicKey,
        from_id: wallet.publicKey,
        to_id: destWallet,
        txId,
        type: "qdoge",
        amount,
      });

      toast.dismiss("send");
      toast.success("QDOGE sent");
    } catch (e: any) {
      toast.dismiss("send");
      toast.error(e?.message ?? "Failed to send QDOGE");
    }
  };

  const renderTable = (rows: Res[], showActions: boolean) => {
    const colSpan = showActions ? 9 : 8;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>No</TableHead>
            <TableHead>Wallet ID</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>QUBIC (capped)</TableHead>
            <TableHead>QEARN</TableHead>
            <TableHead>PORTAL</TableHead>
            <TableHead>QXMR</TableHead>
            <TableHead>Airdrop</TableHead>
            {showActions && <TableHead className="text-center">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.wallet_id}-${r.no}`}>
              <TableCell>{r.no}</TableCell>
              <TableCell>{canSeeAll ? r.wallet_id : "YOU"}</TableCell>
              <TableCell>{r.role}</TableCell>
              <TableCell>{r.qubic_bal}</TableCell>
              <TableCell>{r.qearn_bal}</TableCell>
              <TableCell>{r.portal_bal}</TableCell>
              <TableCell>{r.qxmr_bal}</TableCell>
              <TableCell>{r.airdrop_amt}</TableCell>
              {showActions && (
                <TableCell className="text-center">
                  <Button size="sm" onClick={() => sendQDOGE(r.wallet_id, r.airdrop_amt)}>
                    Send QDOGE
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}

          {loading && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center">
                Loading...
              </TableCell>
            </TableRow>
          )}

          {!loading && rows.length === 0 && !error && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                No rows.
              </TableCell>
            </TableRow>
          )}

          {(error || userError) && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-destructive">
                Error: {error || userError}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="container mx-auto min-h-screen px-4 py-2">
      <TxPay onPurchaseComplete={refresh} />

      <div className="flex justify-end gap-2">
        {user && user.access_info === 0 && (
          <Button size="lg" className="mt-2" onClick={() => setShowRegister(true)}>
            Register (100,000,000 QU)
          </Button>
        )}
      </div>

      <Card className="mx-auto w-full border-0 shadow-lg mt-2">
        {canSeeAll ? (
          <Tabs defaultValue="community" className="h-full w-full">
            <TabsList className="mb-2 flex w-full">
              <TabsTrigger value="community" className="flex-1">Community</TabsTrigger>
              <TabsTrigger value="portal" className="flex-1">Portal</TabsTrigger>
              <TabsTrigger value="power" className="flex-1">Power</TabsTrigger>
            </TabsList>
            <TabsContent value="community" className="overflow-auto">
              {renderTable(rowsByRole.community, true)}
            </TabsContent>
            <TabsContent value="portal" className="overflow-auto">
              {renderTable(rowsByRole.portal, true)}
            </TabsContent>
            <TabsContent value="power" className="overflow-auto">
              {renderTable(rowsByRole.power, true)}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-4 space-y-4">
            {!connectedWalletId && (
              <div className="text-sm text-muted-foreground">Connect your wallet to view your status.</div>
            )}

            {connectedWalletId && walletSummary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Registration</div>
                  <div className="font-semibold">{walletSummary.registered ? "Registered" : "Not registered"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Role</div>
                  <div className="font-semibold">{walletSummary.role}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">QUBIC (capped)</div>
                  <div className="font-semibold">{walletSummary?.balances?.qubic_bal ?? 0}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Estimated airdrop</div>
                  <div className="font-semibold">{walletSummary?.airdrop?.estimated ?? 0}</div>
                </div>
              </div>
            )}

            {renderTable(resTable, false)}
          </div>
        )}
      </Card>

      <RegisterModal open={showRegister} onClose={() => setShowRegister(false)} />
    </div>
  );
}
