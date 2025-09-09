import React from "react";
import Image from "next/image";
import Link from "next/link";
import DebtComparison from "./DebtComparison.client";

const HeroSection = () => {
  return (
    <div className="hero min-h-screen relative">
      <div className="hero-content flex-col lg:flex-row gap-8 py-16 z-10">
        <div className="lg:w-1/2">
          <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300 rounded-lg">
            <div className="card-body p-6">
              <h1 className="text-4xl font-bold mb-2">Optimize Your DeFi Debt</h1>
              <h2 className="text-2xl mb-4">Move debts between lending protocols seamlessly</h2>
              <p className="py-2 text-lg">
                Now supporting Starknet alongside your favorite chains.
              </p>
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
                  <Link href="/blog" passHref>
                    <button className="btn btn-ghost btn-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                      </svg>
                      Blog
                    </button>
                  </Link>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="badge badge-outline">Starknet Live</div>
                  <div className="flex gap-2">
                    <div className="avatar">
                      <div className="w-8 rounded-lg bg-base-100 p-1 shadow-sm border border-base-300">
                        <Image src="/logos/aave.svg" alt="Aave" width={24} height={24} />
                      </div>
                    </div>
                    <div className="avatar">
                      <div className="w-8 rounded-lg bg-base-100 p-1 shadow-sm border border-base-300">
                        <Image src="/logos/compound.svg" alt="Compound" width={24} height={24} />
                      </div>
                    </div>
                    <div className="avatar">
                      <div className="w-8 rounded-lg bg-base-100 p-1 shadow-sm border border-base-300">
                        <Image src="/logos/starknet.svg" alt="Starknet" width={24} height={24} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="lg:w-1/2">
          <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300 rounded-lg">
            <div className="card-body p-6">
              {/* Debt comparison component */}
              <DebtComparison />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
