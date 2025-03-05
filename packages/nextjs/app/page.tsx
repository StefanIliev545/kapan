"use client";

import type { NextPage } from "next";
import { useMemo } from "react";
import Image from "next/image";
import { useMockData } from "../services/mockData";
import TransactionFeed from "../components/TransactionFeed";
import HeroSection from "../components/home/HeroSection";
import AlphaWarning from "../components/home/AlphaWarning";
import HowItWorks from "../components/home/HowItWorks";
import ProtocolStats from "../components/home/ProtocolStats";
import ComingSoon from "../components/home/ComingSoon";

/**
 * Home Page Component
 */
const Home: NextPage = () => {
  // Use react-query hook to get mock data
  const { data: mockData, isLoading } = useMockData();
  
  // Calculate savings percentage with useMemo for efficiency
  const savingsPercentage = useMemo(() => {
    if (!mockData) return "0.0";
    return ((mockData.aaveRate - mockData.compoundRate) / mockData.aaveRate * 100).toFixed(1);
  }, [mockData]);

  // Display loading state
  if (isLoading || !mockData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading loading-spinner loading-lg text-primary"></div>
      </div>
    );
  }

  // Main content with background and UI
  return (
    <div className="flex-grow">
      {/* Background transaction feed */}
      <TransactionFeed />
      
      {/* Main content */}
      <main className="relative z-10">
        {/* Hero section */}
        <HeroSection mockData={mockData} savingsPercentage={savingsPercentage} />
        
        {/* Alpha warning */}
        <AlphaWarning />
        
        {/* How it works */}
        <HowItWorks />
        
        {/* Protocol stats */}
        <ProtocolStats />
        
        {/* Coming soon */}
        <ComingSoon />
      </main>
    </div>
  );
};

export default Home;
