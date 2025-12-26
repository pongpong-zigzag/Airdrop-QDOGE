"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock, Coins, Gift, Rocket, Sparkles, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import heroDog from "@/assets/qdoge_bark.webp";
import logo from "@/assets/logo.png";

const QDOGE_SUPPLY = 21_000_000_000;
const SNAPSHOT_TIME = "Jan 5, 2026 12:00 UTC";
const AIRDROP_SEND_TIME = "Jan 7, 2026 13:00 UTC";
const TRADEIN_TIME = "Jan 8, 2026 12:00 UTC";

const formatAmount = (value: number) => value.toLocaleString();

const AIRDROP_BREAKDOWN = [
  {
    title: "Community",
    percent: "7.5% QDOGE",
    amount: `${formatAmount(QDOGE_SUPPLY * 0.075)} QDOGE`,
    description: "Broad community distribution to kick-start engagement.",
    icon: Sparkles,
  },
  {
    title: "Portal Holders",
    percent: "1% QDOGE",
    amount: `${formatAmount(QDOGE_SUPPLY * 0.01)} QDOGE`,
    description: "Rewarding early portal supporters.",
    icon: Gift,
  },
  {
    title: "QXMR Token Power Purchasers",
    percent: "4% QDOGE",
    amount: `${formatAmount(QDOGE_SUPPLY * 0.04)} QDOGE`,
    description: "Dedicated QDOGE allocation for power purchasers of QXMR.",
    icon: Rocket,
  },
  {
    title: "Traders",
    percent: "2.5% QDOGE",
    amount: `${formatAmount(QDOGE_SUPPLY * 0.025)} QDOGE`,
    description: "For active traders contributing to liquidity.",
    icon: TrendingUp,
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-10">
      <section className="grid items-center gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="relative overflow-hidden border-0 bg-linear-to-br from-primary/15 via-transparent to-secondary/10 shadow-xl">
          <CardHeader className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              QDOGE Airdrop Hub
            </div>
            <CardTitle className="text-3xl font-bold leading-tight sm:text-4xl">
              21B QDOGE supply, ready for the community.
            </CardTitle>
            <p className="max-w-2xl text-base text-muted-foreground">
              Track the allocations, key dates, and trade-in mechanics for the QDOGE drop. Snapshot and launch times are locked so you can prepare with confidence.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/airdrop">
                  View airdrop
                  <Sparkles className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/tradein">
                  Trade in QXMR
                  <TrendingUp className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                Snapshot: {SNAPSHOT_TIME}
              </div>
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" />
                Airdrop send-out: {AIRDROP_SEND_TIME}
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                Trade-in opens: {TRADEIN_TIME}
              </div>
            </div>
          </CardHeader>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.15),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.12),transparent_30%)]" />
        </Card>

        <Card className="border-0 shadow-xl">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-card/60 p-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Total supply</div>
                <div className="text-2xl font-semibold">{formatAmount(QDOGE_SUPPLY)} QDOGE</div>
                <p className="text-sm text-muted-foreground">Fixed pool allocated across all tracks.</p>
              </div>
              <Image src={logo} alt="QDOGE logo" className="h-12 w-auto" priority />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Airdrop snapshot
                </div>
                <div className="text-lg">{SNAPSHOT_TIME}</div>
                <p className="text-xs text-muted-foreground">Holdings locked for allocation.</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Gift className="h-4 w-4 text-primary" />
                  Airdrop send-out
                </div>
                <div className="text-lg">{AIRDROP_SEND_TIME}</div>
                <p className="text-xs text-muted-foreground">Distribution begins.</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Coins className="h-4 w-4 text-primary" />
                  Trade-in launch
                </div>
                <div className="text-lg">{TRADEIN_TIME}</div>
                <p className="text-xs text-muted-foreground">QXMR → QDOGE conversion goes live.</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border bg-muted/30">
              <Image src={heroDog} alt="QDOGE illustration" className="h-full w-full object-cover" priority />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Airdrop breakdown</h2>
          <span className="text-sm text-muted-foreground">Percentages based on 21,000,000,000 QDOGE supply.</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AIRDROP_BREAKDOWN.map(({ title, percent, amount, description, icon: Icon }) => (
            <Card key={title} className="h-full border-0 shadow-md">
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-lg font-bold">{percent}</div>
                <div className="text-sm text-muted-foreground">{amount}</div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <TrendingUp className="h-5 w-5 text-primary" />
              Trade-in mechanics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-sm font-semibold">QXMR → QDOGE ratio</div>
              <p className="text-base">
                Send QXMR and receive <span className="font-semibold">1% QDOGE</span> of the QXMR amount (1 QDOGE per 100 QXMR).
              </p>
              <p className="text-xs text-muted-foreground">Conversion opens on {TRADEIN_TIME}.</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Connect your wallet and head to Trade-In.</li>
              <li>• Select the QXMR amount you want to convert.</li>
              <li>• Sign and broadcast the transaction to receive QDOGE.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <Gift className="h-5 w-5 text-primary" />
              Key dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-sm font-semibold">Snapshot</div>
              <div className="text-base">{SNAPSHOT_TIME}</div>
              <p className="text-xs text-muted-foreground">Eligibility captured for the airdrop.</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-sm font-semibold">Trade-in live</div>
              <div className="text-base">{TRADEIN_TIME}</div>
              <p className="text-xs text-muted-foreground">QXMR conversions to QDOGE begin.</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-sm font-semibold">Need access?</div>
              <p className="text-xs text-muted-foreground">
                New to QDOGE? Start on the Airdrop page to see your eligibility or register if required.
              </p>
              <div className="mt-2 flex gap-2">
                <Button asChild size="sm">
                  <Link href="/airdrop">
                    Go to airdrop
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild size="sm">
                  <Link href="/tradein">
                    Trade now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

