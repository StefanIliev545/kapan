"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface LandingSectionContextType {
  currentSection: number;
  totalSections: number;
  setCurrentSection: (section: number) => void;
  setTotalSections: (total: number) => void;
}

const LandingSectionContext = createContext<LandingSectionContextType>({
  currentSection: 0,
  totalSections: 6,
  setCurrentSection: () => {},
  setTotalSections: () => {},
});

export const useLandingSection = () => useContext(LandingSectionContext);

export const LandingSectionProvider = ({ children }: { children: ReactNode }) => {
  const [currentSection, setCurrentSection] = useState(0);
  const [totalSections, setTotalSections] = useState(6);

  return (
    <LandingSectionContext.Provider value={{ currentSection, totalSections, setCurrentSection, setTotalSections }}>
      {children}
    </LandingSectionContext.Provider>
  );
};
