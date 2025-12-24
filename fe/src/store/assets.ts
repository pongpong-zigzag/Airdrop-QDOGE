import { atom } from "jotai";
import type { OwnedAssetSnapshot } from "@/types/user.types";

export const ownedAssetsAtom = atom<OwnedAssetSnapshot[]>([]);

