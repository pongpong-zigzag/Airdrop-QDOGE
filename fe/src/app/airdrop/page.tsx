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

import {
  getAdminAirdropRes,
  getWalletSummary,
  recordTransaction,
  summaryToRes,
  type WalletSummary,
} from "@/lib/api";
import { Res } from "@/lib/types";
import { useAtom } from "jotai";
import { settingsAtom } from "@/store/settings";

import TxPay from "./txpay";
import { RegisterModal } from "./RegisterModal";

type TabKey = "overall" | "community" | "portal" | "power";

const resolveRawRoles = (roles?: string[] | string): string[] => {
  if (Array.isArray(roles)) {
    return roles;
  }
  if (typeof roles === "string") {
    return roles
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeRole = (role?: string): TabKey => {
  const r = (role ?? "").toLowerCase();
  if (r === "power") return "power";
  if (r === "portal") return "portal";
  return "community";
};

const extractRoles = (res: Res): TabKey[] => {
  const rawRoles = resolveRawRoles(res.roles ?? res.role).filter((r) => r.toLowerCase() !== "admin");
  const normalized = rawRoles.length > 0 ? rawRoles : ["community"];
  const mapped = normalized.map((r) => normalizeRole(r));
  return Array.from(new Set(mapped));
};

const stringifyRoles = (roles?: string[] | string): string => {
  if (Array.isArray(roles)) {
    return roles.join(", ");
  }
  if (typeof roles === "string") {
    return roles;
  }
  return "community";
};

export default function AirdropPage() {
  const { user, error: userError } = useUser();
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const [settings] = useAtom(settingsAtom);

  const [loading, setLoading] = useState(true);
  const [resTable, setResTable] = useState<Res[]>([]);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  const connectedWalletId = useMemo(
    () => wallet?.publicKey?.trim().toUpperCase() ?? null,
    [wallet?.publicKey],
  );

  const isAdmin = useMemo(() => {
    const roles = resolveRawRoles(walletSummary?.roles ?? walletSummary?.role);
    return roles.some((r) => r.toLowerCase() === "admin");
  }, [walletSummary?.role, walletSummary?.roles]);
  const canSeeAll = useMemo(
    () => isAdmin && !!settings.adminApiKey?.trim(),
    [isAdmin, settings.adminApiKey],
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let summary: WalletSummary | null = null;
      if (connectedWalletId) {
        summary = await getWalletSummary(connectedWalletId);
        setWalletSummary(summary);
      } else {
        setWalletSummary(null);
      }

      const isAdminRole = resolveRawRoles(summary?.roles ?? summary?.role).some(
        (r) => r.toLowerCase() === "admin",
      );
      const adminKey = settings.adminApiKey?.trim();

      if (isAdminRole && adminKey) {
        const data = await getAdminAirdropRes(adminKey);
        setResTable(data.res ?? []);
      } else if (summary) {
        setResTable([summaryToRes(summary)]);
      } else {
        setResTable([]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load airdrop data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [connectedWalletId, settings.adminApiKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rowsByRole = useMemo(() => {
    const buckets: Record<TabKey, Res[]> = { overall: [], community: [], portal: [], power: [] };
    for (const r of resTable) {
      buckets.overall.push(r);
      const rawRoles = resolveRawRoles(r.roles ?? r.role).map((x) => x.toLowerCase());
      if (rawRoles.includes("admin")) continue; // admin only shows in overall
      const roles = extractRoles(r);
      for (const role of roles) buckets[role].push(r);
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
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send QDOGE";
      toast.dismiss("send");
      toast.error(message);
    }
  };

  const renderTable = (rows: Res[], showActions: boolean, view: TabKey) => {
    const isOverall = view === "overall";
    const colSpanBase = 8; // No per-role columns
    const colSpan = showActions ? colSpanBase + 1 : colSpanBase;
    const roleAirdrop = (row: Res) => {
      if (view === "community") return row.community_amt ?? 0;
      if (view === "portal") return row.portal_amt ?? 0;
      if (view === "power") return row.power_amt ?? 0;
      return row.airdrop_amt;
    };
    const rowsSorted = [...rows].sort((a, b) => (b.airdrop_amt ?? 0) - (a.airdrop_amt ?? 0));
    const roleLabel = (row: Res) => {
      if (isOverall) return stringifyRoles(row.roles ?? row.role);
      return view.charAt(0).toUpperCase() + view.slice(1);
    };
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>No</TableHead>
            <TableHead>Wallet ID</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>QUBIC</TableHead>
            <TableHead>QEARN</TableHead>
            <TableHead>PORTAL</TableHead>
            <TableHead>QXMR</TableHead>
            <TableHead>Airdrop</TableHead>
            {showActions && <TableHead className="text-center">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowsSorted.map((r) => (
            <TableRow key={`${r.wallet_id}-${r.no}`}>
              <TableCell>{r.no}</TableCell>
              <TableCell>{canSeeAll ? r.wallet_id : "YOU"}</TableCell>
              <TableCell>{roleLabel(r)}</TableCell>
              <TableCell>{r.qubic_bal}</TableCell>
              <TableCell>{r.qearn_bal}</TableCell>
              <TableCell>{r.portal_bal}</TableCell>
              <TableCell>{r.qxmr_bal}</TableCell>
              <TableCell>{roleAirdrop(r)}</TableCell>
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
          <Tabs defaultValue="overall" className="h-full w-full">
            <TabsList className="mb-2 flex w-full">
              <TabsTrigger value="overall" className="flex-1">Overall</TabsTrigger>
              <TabsTrigger value="community" className="flex-1">Community</TabsTrigger>
              <TabsTrigger value="portal" className="flex-1">Portal</TabsTrigger>
              <TabsTrigger value="power" className="flex-1">Power</TabsTrigger>
            </TabsList>
            <TabsContent value="community" className="overflow-auto">
              {renderTable(rowsByRole.community, true, "community")}
            </TabsContent>
            <TabsContent value="portal" className="overflow-auto">
              {renderTable(rowsByRole.portal, true, "portal")}
            </TabsContent>
            <TabsContent value="power" className="overflow-auto">
              {renderTable(rowsByRole.power, true, "power")}
            </TabsContent>
            <TabsContent value="overall" className="overflow-auto">
              {renderTable(rowsByRole.overall, true, "overall")}
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
                  <div className="font-semibold">{stringifyRoles(walletSummary.roles ?? walletSummary.role)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">QUBIC</div>
                  <div className="font-semibold">{walletSummary?.balances?.qubic_bal ?? 0}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Estimated airdrop</div>
                  <div className="font-semibold">{walletSummary?.airdrop?.estimated ?? 0}</div>
                </div>
              </div>
            )}

            {renderTable(resTable, false, "overall")}
          </div>
        )}
      </Card>

      <RegisterModal open={showRegister} onClose={() => setShowRegister(false)} />
    </div>
  );
}
