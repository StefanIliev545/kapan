"use client";

import { useState, type ReactNode } from "react";
import { createSafeContext } from "./createSafeContext";

interface LandingSectionContextType {
  currentSection: number;
  totalSections: number;
  setCurrentSection: (section: number) => void;
  setTotalSections: (total: number) => void;
}

const { Context: LandingSectionContext, useContextValue } =
  createSafeContext<LandingSectionContextType>("LandingSection");

export const useLandingSection = useContextValue;

export const LandingSectionProvider = ({ children }: { children: ReactNode }) => {
  const [currentSection, setCurrentSection] = useState(0);
  const [totalSections, setTotalSections] = useState(6);

  return (
    <LandingSectionContext.Provider value={{ currentSection, totalSections, setCurrentSection, setTotalSections }}>
      {children}
    </LandingSectionContext.Provider>
  );
};
