"use client";

import Image from "next/image";
import Link from "next/link";
import { useAtom } from "jotai";
import { MdLightMode, MdDarkMode } from "react-icons/md";
import { StarHalf, UserIcon } from "lucide-react";
import ConnectLink from "@/components/connect/ConnectLink";
import { settingsAtom } from "@/store/settings";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@radix-ui/react-tooltip";
import logo from "@/assets/logo.png"

export default function Header() {
  const [settings, setSettings] = useAtom(settingsAtom);

  const toggleDarkMode = () => {
    setSettings({ darkMode: !settings.darkMode });
  };

  return (
    <header className="border-b">
      <div className="mx-auto flex justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logo}
            alt="QDOGE Airdrop logo"
            width={160}
            height={40}
            priority
            className="h-10 w-auto"
          />
          <span className="sr-only">QDOGE Airdrop home</span>
        </Link>
        <nav className="flex gap-3 text-sm">

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/airdrop"
                  className="rounded-lg border-none bg-transparent p-2 text-foreground transition-colors hover:text-primary"
                >
                  <StarHalf size={20} />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>Airdrop</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleDarkMode}
                  className="rounded-lg border-none bg-transparent text-foreground p-2 transition-colors hover:text-primary"
                >
                  {settings.darkMode ? <MdLightMode size={20} /> : <MdDarkMode size={20} />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{settings.darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/account"
                  className="rounded-lg border-none bg-transparent p-2 text-foreground transition-colors hover:text-primary"
                >
                  <UserIcon size={20} />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>Account</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <ConnectLink darkMode={settings.darkMode} />
        </nav>
      </div>
    </header>
  );
}

