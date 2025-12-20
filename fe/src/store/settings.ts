import { DEFAULT_TICK_OFFSET } from "@/constants";
import { atom } from "jotai";
import { THEME_LIST } from "@/constants";

export type Settings = {
  tickOffset: number;
  darkMode: boolean;
  notifications: boolean;
  theme: (typeof THEME_LIST)[number]["value"];
};

export const DEFAULT_SETTINGS: Settings = {
  tickOffset: DEFAULT_TICK_OFFSET,
  darkMode: true,
  notifications: false,
  theme: THEME_LIST[0].value,
};

export const settingsAtom = atom(
  DEFAULT_SETTINGS,
  (get, set, update: Partial<Settings>) => {
    const newSettings = { ...get(settingsAtom), ...update };
    set(settingsAtom, newSettings);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("settings", JSON.stringify(newSettings));
    }
  },
);
