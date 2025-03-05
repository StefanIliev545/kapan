import React from "react";
import Image from "next/image";
import Link from "next/link";
import { MockData } from "../../types/mockData";
import DebtComparison from "./DebtComparison";

interface HeroSectionProps {
  mockData: MockData;
  savingsPercentage: string;
}

const HeroSection = ({ mockData, savingsPercentage }: HeroSectionProps) => {
  return (
    <div className="hero min-h-screen relative">
      <div className="hero-content flex-col lg:flex-row-reverse gap-8 py-16 z-10">
        <div className="lg:w-1/2">
          <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300">
            <div className="card-body p-6">
              {/* Debt comparison component */}
              <DebtComparison mockData={mockData} savingsPercentage={savingsPercentage} />
            </div>
          </div>
        </div>
        
        <div className="lg:w-1/2">
          <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300">
            <div className="card-body p-6">
              <h1 className="text-4xl font-bold mb-2">Optimize Your DeFi Debt</h1>
              <h2 className="text-2xl mb-4">Move debts between lending protocols seamlessly</h2>
              <p className="py-2 text-lg">
                Our protocol enables users to optimize their borrowing costs by easily moving debt positions 
                between DeFi lending platforms like Aave and Compound.
              </p>
              <p className="py-2 text-lg">
                With a single transaction, users can take advantage of interest rate differences and save on borrowing costs.
              </p>
              
              <div className="flex flex-wrap items-center gap-4 mt-6">
                <div className="flex gap-2">
                  <Link href="/app" passHref>
                    <button className="btn btn-primary">Launch App</button>
                  </Link>
                  <Link href="/info" passHref>
                    <button className="btn btn-outline">Learn More</button>
                  </Link>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="badge badge-outline">Alpha</div>
                  <div className="flex gap-2">
                    <div className="avatar">
                      <div className="w-8 rounded-full bg-base-100 p-1 shadow-sm border border-base-300">
                        <Image src="/logos/aave.svg" alt="Aave" width={24} height={24} />
                      </div>
                    </div>
                    <div className="avatar">
                      <div className="w-8 rounded-full bg-base-100 p-1 shadow-sm border border-base-300">
                        <Image src="/logos/compound.svg" alt="Compound" width={24} height={24} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection; 