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

import { getAdminAirdropRes, getAppConfig, getWalletSummary, recordTransaction, summaryToRes } from "@/lib/api";
import type { WalletSummary, AppConfig, AirdropAllocations } from "@/lib/api";
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

const ALLOCATION_ACCENTS: Record<RoleKey, string> = {
  community: "bg-emerald-400",
  portal: "bg-cyan-400",
  power: "bg-indigo-400",
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

const WalletSummaryGrid = React.memo(
  ({
    summary,
    totalAirdrop,
    allocations,
  }: {
    summary: WalletSummary;
    totalAirdrop?: number | null;
    allocations?: AirdropAllocations | null;
  }) => {
    const displayRoles = getDisplayRoles(summary.roles ?? summary.role);
    const allocationEntries = (["community", "portal", "power"] as RoleKey[])
      .map((role) => {
        const amount = Number(allocations?.[role] ?? 0);
        if (!amount) return null;
        const percent = totalAirdrop ? (amount / totalAirdrop) * 100 : null;
        return {
          role,
          label: ROLE_META[role].label,
          amount,
          percent,
        };
      })
      .filter(Boolean) as { role: RoleKey; label: string; amount: number; percent: number | null }[];

    const balanceCards = [
      {
        label: "QEARN",
        value: summary?.balances?.qearn_bal,
        bg: "from-emerald-500/15 via-emerald-500/5 to-transparent",
        text: "text-emerald-100",
      },
      {
        label: "QUBIC",
        value: summary?.balances?.qubic_bal,
        bg: "from-violet-500/15 via-violet-500/5 to-transparent",
        text: "text-violet-100",
      },
      {
        label: "PORTAL",
        value: summary?.balances?.portal_bal,
        bg: "from-sky-500/15 via-sky-500/5 to-transparent",
        text: "text-sky-100",
      },
      {
        label: "QXMR",
        value: summary?.balances?.qxmr_bal,
        bg: "from-fuchsia-500/15 via-fuchsia-500/5 to-transparent",
        text: "text-fuchsia-100",
      },
    ];

    return (
      <div className="rounded-2xl border border-white/5 bg-linear-to-br from-slate-950 via-slate-900 to-slate-950/40 p-6 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur">
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-white/5 p-4 shadow-inner shadow-black/20 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registration</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={`border px-3 py-1 text-sm font-semibold ${
                    summary.registered
                      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/40"
                      : "bg-amber-500/15 text-amber-200 border-amber-500/40"
                  }`}
                >
                  {summary.registered ? "Registered" : "Not registered"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {summary.registered ? "Eligible for reward claims" : "Complete registration to unlock rewards"}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/5 p-4 shadow-inner shadow-black/20 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</p>
              <div className="mt-3">
                <RoleBadges roles={displayRoles} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {displayRoles.length > 1
                  ? "Multi-tier access boosts your allocation."
                  : `You are currently in the ${ROLE_META[displayRoles[0]].label} tier.`}
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/5 p-4 shadow-inner shadow-black/20 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total airdrop allocation</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                {typeof totalAirdrop === "number" && totalAirdrop > 0 ? formatNumber(totalAirdrop) : "Unavailable"}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalAirdrop ? "Aggregate cap across all cohorts" : "Connect your wallet to view allocation details."}
              </p>
              {allocationEntries.length > 0 && (
                <div className="mt-4 space-y-3">
                  {allocationEntries.map((entry) => (
                    <div key={entry.role}>
                      <div className="flex items-center justify-between text-xs text-white/80">
                        <span className="font-medium">{entry.label}</span>
                        <span className="tabular-nums">
                          {formatNumber(entry.amount)}
                          {entry.percent !== null && (
                            <span className="ml-1 text-muted-foreground">({entry.percent.toFixed(1)}%)</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${ALLOCATION_ACCENTS[entry.role]}`}
                          style={{ width: `${Math.min(entry.percent ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {balanceCards.map((card) => (
              <div
                key={card.label}
                className={`rounded-xl border border-white/5 bg-linear-to-br p-4 shadow-lg shadow-black/20 ${card.bg}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{card.label}</p>
                <p className={`mt-2 text-2xl font-semibold tabular-nums ${card.text}`}>{formatNumber(card.value)}</p>
                <p className="text-xs text-white/60">Live snapshot</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
);
WalletSummaryGrid.displayName = "WalletSummaryGrid";

export default function AirdropPage() {
  const { user, error: userError } = useUser();
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const [settings] = useAtom(settingsAtom);

  const [loading, setLoading] = useState(true);
  const [resTable, setResTable] = useState<Res[]>([]);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

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
  const airdropAllocations = useMemo(() => appConfig?.allocations ?? null, [appConfig]);
  const totalAirdrop = useMemo(() => {
    if (!airdropAllocations) return null;
    const community = Number(airdropAllocations.community ?? 0);
    const portal = Number(airdropAllocations.portal ?? 0);
    const power = Number(airdropAllocations.power ?? 0);
    const total = community + portal + power;
    return total > 0 ? total : null;
  }, [airdropAllocations]);

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

  useEffect(() => {
    let cancelled = false;
    getAppConfig()
      .then((cfg) => {
        if (!cancelled) setAppConfig(cfg);
      })
      .catch((err) => {
        console.error("Failed to load config", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
              <WalletSummaryGrid summary={walletSummary} totalAirdrop={totalAirdrop} allocations={airdropAllocations} />
            )}

            {isAdmin && <div className="overflow-auto">{renderTable(sortedRowsByRole.All, false, "All")}</div>}
          </div>
        )}
      </Card>

      <RegisterModal open={showRegister} onClose={() => setShowRegister(false)} />
    </div>
  );
}
