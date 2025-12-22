// prettier-ignore
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useAtomValue } from "jotai";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock4,
  Gift,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet2,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import heroImage from "@/assets/qdoge_bark.webp";
import { THEME_LIST } from "@/constants";
import { settingsAtom } from "@/store/settings";

type HighlightCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const heroHighlights: HighlightCard[] = [
  {
    icon: Shield,
    title: "Verified supply",
    description: "All figures stream from Qubic RPC in real time.",
  },
  {
    icon: TrendingUp,
    title: "Adaptive APR",
    description: "Rewards scale with liquidity, not snapshots.",
  },
  {
    icon: Wallet2,
    title: "Wallet agnostic",
    description: "Bring MetaMask, WalletConnect, or Qubic native.",
  },
  {
    icon: Zap,
    title: "No gas surprises",
    description: "Fees subsidized during the active drop window.",
  },
];

const dropStats = [
  { label: "Eligible wallets", value: "12,784", delta: "+18% vs last epoch" },
  { label: "QDOGE committed", value: "68.4M", delta: "Locked for 5 epochs" },
  { label: "Mission score", value: "94 / 100", delta: "Risk Level · Low" },
  { label: "Live throughput", value: "742 tx/min", delta: "Last 10 minutes" },
];

const missionSteps = [
  {
    id: "01",
    title: "Verify wallet reach",
    description: "Connect or import your wallet and confirm residency checks.",
  },
  {
    id: "02",
    title: "Stake or lock QDOGE",
    description: "Lock a minimum of 1,000 QDOGE to earn the base multiplier.",
  },
  {
    id: "03",
    title: "Signal contributions",
    description: "Submit on-chain activity or ecosystem contributions.",
  },
];

type Tier = {
  name: string;
  requirement: string;
  reward: string;
};

const tiering: Tier[] = [
  {
    name: "Tier 1 · Scout",
    requirement: "1k – 9,999 QDOGE locked",
    reward: "1.0× base multiplier",
  },
  {
    name: "Tier 2 · Sentinel",
    requirement: "10k – 49,999 QDOGE + social proof",
    reward: "1.4× base multiplier",
  },
  {
    name: "Tier 3 · Guardian",
    requirement: "50k+ QDOGE · liquidity proof",
    reward: "2.2× + priority stream",
  },
];

const missionMoments = [
  {
    title: "Snapshot lock",
    time: "Dec 30 · 18:00 UTC",
    description: "Balances + contribution proofs finalized for Epoch 12.",
    status: "next",
  },
  {
    title: "Distribution window",
    time: "Jan 5 · 12:00 UTC",
    description: "Claim contracts open for 72 hours with auto restake.",
    status: "upcoming",
  },
  {
    title: "Grace settlement",
    time: "Jan 15 · 12:00 UTC",
    description: "Unclaimed allocation reverts to community treasury.",
    status: "final",
  },
] as const;

const engagementTasks = [
  {
    title: "Provide liquidity on BarkSwap",
    value: "+350 pts",
    detail: "Lock LP tokens for at least 14 days. Auto-verified on-chain.",
    href: "/airdrop",
  },
  {
    title: "Refer a validator",
    value: "+120 pts",
    detail: "Earn when invited validators finalize one full epoch.",
    href: "/account",
  },
  {
    title: "Submit ecosystem tooling",
    value: "Bonus tier",
    detail: "Ship dashboards, bots, or SDK extensions and claim review.",
    href: "/account",
  },
];

const rewardStreams = [
  {
    title: "Core drop",
    detail: "Direct QDOGE unlocked linearly across 4 checkpoints.",
  },
  {
    title: "Streaming boost",
    detail: "Mission tiers apply a multiplier to every unlocked block.",
  },
  {
    title: "Guardrail rebate",
    detail: "Gas and bridge rebates credited weekly in utility tokens.",
  },
];

const activityFeed = [
  {
    label: "Guardian wallet",
    detail: "staked 25,000 QDOGE",
    time: "1 min ago",
  },
  {
    label: "Sentinel vault",
    detail: "claimed 4,200 QDOGE",
    time: "8 mins ago",
  },
  {
    label: "Community tool",
    detail: "SDK monitor approved",
    time: "12 mins ago",
  },
  {
    label: "Liquidity routing",
    detail: "BarkSwap pool refuelled",
    time: "26 mins ago",
  },
];

const faqItems = [
  {
    question: "How does the theme affect this page?",
    answer:
      "Surface, border, and gradient tokens are wired directly to your selected theme inside Account → Settings. Switching themes or toggling dark mode updates every module instantly without reloads.",
  },
  {
    question: "Can I claim from multiple wallets?",
    answer:
      "Each identity can anchor up to three wallets provided they pass signature challenges. Rewards consolidate per identity to keep allocations fair.",
  },
  {
    question: "What happens if I miss the claim window?",
    answer:
      "Allocations flow back to the community treasury and will reappear as booster pools in later epochs. Set notifications inside Account to avoid missing it.",
  },
  {
    question: "Where do the live metrics come from?",
    answer:
      "Data is streamed from the Qubic RPC (`rpc.qubic.org`) plus a guarded cache. Light client proofs keep the figures verifiable.",
  },
];

export default function HomePage() {
  const settings = useAtomValue(settingsAtom);
  const activeThemeLabel = useMemo(() => {
    if (settings.theme === "default") {
      return "Default";
    }
    return THEME_LIST.find((entry) => entry.value === settings.theme)?.label ?? "Custom";
  }, [settings.theme]);

  const mintedProgress = 72;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-12">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="space-y-6">
          <Badge
            variant="secondary"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs uppercase tracking-wide"
          >
            <Sparkles className="size-3.5 text-primary" />
            Epoch 12 · Live QDOGE drop
          </Badge>

          <div className="space-y-4">
            <h1 className="text-4xl font-semibold leading-tight">
              QDOGE Airdrop Mission Control
            </h1>
            <p className="text-base text-muted-foreground">
              Track allocations, confirm wallet readiness, and trigger claims from a single console.
              Every tile below taps into the same theme tokens you pick in settings, so your brand look
              carries through the whole drop experience.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {heroHighlights.map((card) => (
              <div
                key={card.title}
                className="flex gap-3 rounded-xl border border-border/70 bg-card/80 p-4 backdrop-blur"
              >
                <card.icon className="mt-1 size-5 text-primary" />
                <div className="space-y-1">
                  <p className="font-medium">{card.title}</p>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/airdrop">
                Launch drop console
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/account">
                Personalize theme
                <CheckCircle2 className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Active visual system</span>
              <Badge variant="outline" className="rounded-full border-border/70 px-3 py-1 font-medium">
                {activeThemeLabel} • {settings.darkMode ? "Dark" : "Light"} mode
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Swap any theme shape from the Account area. Gradients, borders, cards, and typography on this page
              respond instantly thanks to CSS variables injected at the root.
            </p>
          </div>
        </div>

        <Card
          className="relative overflow-hidden border border-border/70 bg-linear-to-b from-primary/15 via-card to-card shadow-lg"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 0%, hsl(var(--primary) / 0.25) 0%, transparent 45%), radial-gradient(circle at 80% 20%, hsl(var(--accent) / 0.2) 0%, transparent 35%)",
          }}
        >
          <CardHeader className="relative z-10 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gift className="size-4 text-primary" />
              Epoch pool health
            </div>
            <CardTitle className="text-3xl">QDOGE Reserve</CardTitle>
            <CardDescription>Live telemetry feed from the drop vault.</CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 space-y-6">
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/50">
              <Image
                src={heroImage}
                alt="QDOGE vault artwork"
                className="h-48 w-full object-cover"
                priority
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Minted for Epoch 12</span>
                <span>{mintedProgress}% streamed</span>
              </div>
              <Progress value={mintedProgress} className="mt-3 h-3" />
              <div className="mt-3 grid gap-3 rounded-xl border border-border/70 bg-background/70 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vault capacity</span>
                  <strong>94,200,000 QDOGE</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Streaming rate</span>
                  <strong>3.8M QDOGE / day</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Protection bandwidth</span>
                  <strong>150% insured</strong>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dropStats.map((stat) => (
          <Card key={stat.label} className="border border-border/70 bg-card/90">
            <CardHeader className="space-y-2">
              <CardDescription className="text-xs uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </CardDescription>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
              <p className="text-sm text-muted-foreground">{stat.delta}</p>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              Flight plan
            </CardTitle>
            <CardDescription>Step-by-step guidance to stay allocation-ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {missionSteps.map((step) => (
              <div key={step.id} className="flex gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-sm font-semibold text-primary">
                  {step.id}
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
            <Button asChild className="mt-4 w-fit">
              <Link href="/airdrop">
                Check eligibility
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              Tiering & multipliers
            </CardTitle>
            <CardDescription>Higher commitment unlocks stronger boosts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tiering.map((tier) => (
              <div
                key={tier.name}
                className="rounded-2xl border border-border/60 bg-background/70 p-4"
              >
                <p className="text-sm uppercase tracking-wide text-muted-foreground">{tier.name}</p>
                <p className="text-base font-medium">{tier.requirement}</p>
                <p className="text-sm text-primary">{tier.reward}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="border border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock4 className="size-5 text-primary" />
              Mission timeline
            </CardTitle>
            <CardDescription>Stay ahead of the next critical checkpoints.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {missionMoments.map((moment, index) => (
              <div key={moment.title} className="flex gap-4">
                <div className="relative flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary">
                    {index + 1}
                  </div>
                  {index !== missionMoments.length - 1 && (
                    <div className="mt-2 h-full w-px bg-border" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {moment.time}
                  </p>
                  <p className="text-lg font-medium">{moment.title}</p>
                  <p className="text-sm text-muted-foreground">{moment.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              Latest activity
            </CardTitle>
            <CardDescription>Human-friendly mirror of on-chain proofs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activityFeed.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-muted-foreground">{item.detail}</p>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="rounded-3xl border border-border/80 bg-card/90 p-6">
        <Tabs defaultValue="tasks" className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                Mission toolkit
              </p>
              <h2 className="text-2xl font-semibold">Earn points & unlock boosters</h2>
            </div>
            <TabsList className="bg-background/70">
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="rewards">Rewards</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tasks" className="mt-6 space-y-4">
            {engagementTasks.map((task) => (
              <div
                key={task.title}
                className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/70 p-5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-sm text-muted-foreground">{task.detail}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full px-3 py-1">{task.value}</Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={task.href}>
                      Execute
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="rewards" className="mt-6 grid gap-4 md:grid-cols-3">
            {rewardStreams.map((stream) => (
              <Card
                key={stream.title}
                className="border border-border/70 bg-background/80 shadow-none"
              >
                <CardHeader>
                  <CardTitle className="text-lg">{stream.title}</CardTitle>
                  <CardDescription>{stream.detail}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {faqItems.map((faq) => (
            <Card key={faq.question} className="border border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="text-base">{faq.question}</CardTitle>
                <CardDescription className="text-sm">{faq.answer}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="flex flex-col justify-between border border-border/70 bg-linear-to-br from-primary/20 via-card to-card p-6">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-wide text-muted-foreground">Need a hand?</p>
            <h3 className="text-2xl font-semibold">Mission support desk</h3>
            <p className="text-sm text-muted-foreground">
              Talk to drop stewards, verify KYC paperwork, or request custom allocation reviews.
              Support inherits your theme so shared screenshots match what you see locally.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/account">
                Open support workspace
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/airdrop">View status page</Link>
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
