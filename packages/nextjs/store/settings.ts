"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type SettingsState = {
  showInstructionConfirm: boolean;
  setShowInstructionConfirm: (value: boolean) => void;
};

const storage =
  typeof window !== "undefined"
    ? createJSONStorage<SettingsState>(() => localStorage)
    : undefined;

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      showInstructionConfirm: false,
      setShowInstructionConfirm: value => set({ showInstructionConfirm: value }),
    }),
    {
      name: "kapan-settings",
      storage,
    },
  ),
);
