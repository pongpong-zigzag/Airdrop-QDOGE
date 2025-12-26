"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "react-hot-toast";

import { useQubicConnect } from "@/components/connect/QubicConnectContext";
import { broadcastTx, fetchOwnedAssets } from "@/services/rpc.service";
import { createAssetTransferTransaction } from "@/services/qx.service";
import { confirmTradein, recordTransaction } from "@/lib/api";
import { ownedAssetsAtom } from "@/store/assets";
import { useAtom } from "jotai";

const BURN_ADDRESS =
  process.env.NEXT_PUBLIC_BURN_ADDRESS ||
  "BURNQCDXPUVMBGCTKXZMLRCQYUWBPZREUCDIPECZOAYKCQNGTIUSDXLDULQL";

const QXMR_ISSUER_ID =
  process.env.NEXT_PUBLIC_QXMR_ISSUER_ID ||
  "QXMRTKAIIGLUREPIQPCMHCKWSIPDTUYFCFNYXQLTECSUJVYEMMDELBMDOEYB";

const RATIO = 100; // 100 QDOGE per 1 QXMR

export default function TradeinPage() {
  const { connected, wallet, getSignedTx } = useQubicConnect();
  const [ownedAssets, setOwnedAssets] = useAtom(ownedAssetsAtom);
  const [amount, setAmount] = useState<string>("");

  const qxmrBalance = useMemo(() => {
    const a = ownedAssets.find((x) => x.asset?.toUpperCase() === "QXMR");
    return a?.amount || 0;
  }, [ownedAssets]);

  useEffect(() => {
    if (!connected || !wallet?.publicKey) return;
    fetchOwnedAssets(wallet.publicKey).then((assets) => setOwnedAssets((assets as any) || []));
  }, [connected, wallet?.publicKey, setOwnedAssets]);

  const parsed = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  }, [amount]);

  const expectedQdoge = useMemo(() => parsed * RATIO, [parsed]);

  const handleTradein = async () => {
    if (!connected || !wallet) {
      toast.error("Please connect your wallet");
      return;
    }
    if (parsed <= 0) {
      toast.error("Enter a valid QXMR amount");
      return;
    }
    if (qxmrBalance < parsed) {
      toast.error(`Insufficient QXMR balance. You have ${qxmrBalance}.`);
      return;
    }

    try {
      toast.loading("Building trade-in transaction...", { id: "tradein" });

      const tx = await createAssetTransferTransaction(wallet, {
        assetName: "QXMR",
        issuerId: QXMR_ISSUER_ID,
        newOwnerId: BURN_ADDRESS,
        amount: parsed,
      });

      toast.loading("Sign in your wallet...", { id: "tradein" });

      const signed = await getSignedTx(tx);
      let signedTx: Uint8Array = signed.tx;

      const broadcastResult = await broadcastTx(signedTx);
      const txId = broadcastResult.transactionId;

      await recordTransaction({ sender: wallet.publicKey, recipient: BURN_ADDRESS, tx_hash: txId });

      toast.loading("Confirming trade-in on-chain...", { id: "tradein" });
      const result = await confirmTradein(wallet.publicKey, txId);

      toast.dismiss("tradein");
      toast.success(`Trade-in confirmed: +${result.qdoge_amount} QDOGE`);
      setAmount("");
    } catch (err: unknown) {
      toast.dismiss("tradein");
      const msg = err instanceof Error ? err.message : "Trade-in failed";
      toast.error(msg);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-10">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">QXMR → QDOGE Trade-In</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Send QXMR to the burn address. You receive QDOGE at a fixed ratio of {RATIO}:1.
          </div>

          <div className="rounded-md bg-muted p-3 text-xs font-mono break-all">
            Burn address: {BURN_ADDRESS}
          </div>

          <div className="text-sm">
            Your QXMR balance: <span className="font-semibold">{qxmrBalance.toLocaleString()}</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (QXMR)</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10"
              inputMode="numeric"
            />
            <div className="text-sm text-muted-foreground">
              Expected: <span className="font-semibold">{expectedQdoge.toLocaleString()}</span> QDOGE
            </div>
          </div>

          <Button className="w-full" onClick={handleTradein}>
            Trade In
          </Button>

          <div className="text-xs text-muted-foreground">
            Note: Your wallet must hold the QXMR asset on QX. After broadcasting, confirmation may take a few ticks.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
