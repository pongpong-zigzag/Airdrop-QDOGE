"use client";

import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Badge } from "@/components/ui/badge";
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

type RoleKey = "community" | "portal" | "power";
type TabKey = "All" | RoleKey;
type DisplayRole = RoleKey | "admin";

const DISPLAY_ROLE_ORDER: DisplayRole[] = ["admin", "power", "portal", "community"];

const ROLE_META: Record<DisplayRole, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-amber-50 text-amber-800 border-amber-200" },
  power: { label: "Power", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  portal: { label: "Portal", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  community: { label: "Community", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const formatNumber = (value?: number | string | null) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-US");
};

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

const normalizeRole = (role?: string): RoleKey => {
  const r = (role ?? "").toLowerCase();
  if (r === "power") return "power";
  if (r === "portal") return "portal";
  return "community";
};

const normalizeDisplayRole = (role?: string): DisplayRole | null => {
  const r = (role ?? "").trim().toLowerCase();
  if (!r) return null;
  if (r === "admin") return "admin";
  return normalizeRole(r) as DisplayRole;
};

const getDisplayRoles = (roles?: string[] | string): DisplayRole[] => {
  const normalized = resolveRawRoles(roles)
    .map((r) => normalizeDisplayRole(r))
    .filter(Boolean) as DisplayRole[];

  const deduped = Array.from(new Set(normalized)).sort(
    (a, b) => DISPLAY_ROLE_ORDER.indexOf(a) - DISPLAY_ROLE_ORDER.indexOf(b),
  );

  return deduped.length > 0 ? deduped : ["community"];
};

const extractRoles = (res: Res): TabKey[] => {
  return getDisplayRoles(res.roles ?? res.role).filter((r) => r !== "admin") as TabKey[];
};

const RoleBadges = React.memo(({ roles }: { roles: DisplayRole[] }) => (
  <div className="flex flex-wrap gap-1">
    {roles.map((role) => {
      const meta = ROLE_META[role] ?? ROLE_META.community;
      return (
        <Badge
          key={role}
          variant="secondary"
          className={`border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${meta.className}`}
        >
          {meta.label}
        </Badge>
      );
    })}
  </div>
));
RoleBadges.displayName = "RoleBadges";

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

  const adminApiKey = useMemo(() => settings.adminApiKey?.trim() ?? "", [settings.adminApiKey]);

  const isAdmin = useMemo(() => {
    const roles = resolveRawRoles(walletSummary?.roles ?? walletSummary?.role);
    return roles.some((r) => r.toLowerCase() === "admin");
  }, [walletSummary?.role, walletSummary?.roles]);
  const canSeeAll = useMemo(
    () => isAdmin && !!adminApiKey,
    [isAdmin, adminApiKey],
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let summary: WalletSummary | null = null;
      if (connectedWalletId) {
        summary = await getWalletSummary(connectedWalletId, { fresh: true });
        setWalletSummary(summary);
      } else {
        setWalletSummary(null);
      }

      const isAdminRole = resolveRawRoles(summary?.roles ?? summary?.role).some(
        (r) => r.toLowerCase() === "admin",
      );
      const adminKey = adminApiKey;

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
  }, [connectedWalletId, adminApiKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rowsByRole = useMemo(() => {
    const buckets: Record<TabKey, Res[]> = { All: [], community: [], portal: [], power: [] };
    for (const r of resTable) {
      buckets.All.push(r);
      const rawRoles = resolveRawRoles(r.roles ?? r.role).map((x) => x.toLowerCase());
      if (rawRoles.includes("admin")) continue; // admin only shows in All
      const roles = extractRoles(r);
      for (const role of roles) buckets[role].push(r);
    }
    return buckets;
  }, [resTable]);

  const sortedRowsByRole = useMemo(() => {
    const sorter = (rows: Res[]) => [...rows].sort((a, b) => (b.airdrop_amt ?? 0) - (a.airdrop_amt ?? 0));
    return {
      All: sorter(rowsByRole.All),
      community: sorter(rowsByRole.community),
      portal: sorter(rowsByRole.portal),
      power: sorter(rowsByRole.power),
    };
  }, [rowsByRole]);

  const sendQDOGE = React.useCallback(
    async (destWallet: string, amount: number) => {
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

        await recordTransaction(adminApiKey, {
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
    },
    [adminApiKey, canSeeAll, connected, getSignedTx, wallet],
  );

  const renderTable = (rows: Res[], showActions: boolean, view: TabKey) => {
    const colSpanBase = 8; // No per-role columns
    const colSpan = showActions ? colSpanBase + 1 : colSpanBase;
    const roleAirdrop = (row: Res) => {
      if (view === "community") return row.community_amt ?? 0;
      if (view === "portal") return row.portal_amt ?? 0;
      if (view === "power") return row.power_amt ?? 0;
      return row.airdrop_amt;
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
          {rows.map((r) => (
            <TableRow key={`${r.wallet_id}-${r.no}`}>
              <TableCell>{r.no}</TableCell>
              <TableCell>{canSeeAll ? r.wallet_id : "YOU"}</TableCell>
              <TableCell>
                <RoleBadges roles={getDisplayRoles(r.roles ?? r.role)} />
              </TableCell>
              <TableCell>{formatNumber(r.qubic_bal)}</TableCell>
              <TableCell>{formatNumber(r.qearn_bal)}</TableCell>
              <TableCell>{formatNumber(r.portal_bal)}</TableCell>
              <TableCell>{formatNumber(r.qxmr_bal)}</TableCell>
              <TableCell>{formatNumber(roleAirdrop(r))}</TableCell>
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
            Register (1,000,000 QU)
          </Button>
        )}
      </div>

      <Card className="mx-auto w-full border-0 shadow-lg mt-2">
        {canSeeAll ? (
          <Tabs defaultValue="All" className="h-full w-full">
            <TabsList className="mb-2 flex w-full">
              <TabsTrigger value="All" className="flex-1">All</TabsTrigger>
              <TabsTrigger value="community" className="flex-1">Community</TabsTrigger>
              <TabsTrigger value="portal" className="flex-1">Portal</TabsTrigger>
              <TabsTrigger value="power" className="flex-1">Power</TabsTrigger>
            </TabsList>
            <TabsContent value="community" className="overflow-auto">
              {renderTable(sortedRowsByRole.community, true, "community")}
            </TabsContent>
            <TabsContent value="portal" className="overflow-auto">
              {renderTable(sortedRowsByRole.portal, true, "portal")}
            </TabsContent>
            <TabsContent value="power" className="overflow-auto">
              {renderTable(sortedRowsByRole.power, true, "power")}
            </TabsContent>
            <TabsContent value="All" className="overflow-auto">
              {renderTable(sortedRowsByRole.All, true, "All")}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-4 space-y-4">
            {!connectedWalletId && (
              <div className="text-sm text-muted-foreground">Connect your wallet to view your status.</div>
            )}

            {connectedWalletId && walletSummary && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Registration</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge
                      variant="secondary"
                      className={`border px-3 py-0.5 text-sm font-medium ${
                        walletSummary.registered ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      {walletSummary.registered ? "Registered" : "Not registered"}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Role</div>
                  <div className="mt-1">
                    <RoleBadges roles={getDisplayRoles(walletSummary.roles ?? walletSummary.role)} />
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">QUBIC</div>
                  <div className="mt-1 font-semibold">{formatNumber(walletSummary?.balances?.qubic_bal)}</div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Estimated airdrop</div>
                  <div className="mt-1 font-semibold">
                    {Number(walletSummary?.airdrop?.estimated ?? 0) > 0
                      ? formatNumber(walletSummary?.airdrop?.estimated)
                      : "Not assigned"}
                  </div>
                  {walletSummary?.airdrop?.breakdown && (
                    <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                      {(["community", "portal", "power"] as RoleKey[]).map((k) => {
                        const amt = walletSummary?.airdrop?.breakdown?.[k] ?? 0;
                        if (!amt) return null;
                        return (
                          <Badge key={k} variant="outline" className="border px-2 py-0.5 font-normal">
                            {ROLE_META[k].label}: {formatNumber(amt)}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {renderTable(sortedRowsByRole.All, false, "All")}
          </div>
        )}
      </Card>

      <RegisterModal open={showRegister} onClose={() => setShowRegister(false)} />
    </div>
  );
}
