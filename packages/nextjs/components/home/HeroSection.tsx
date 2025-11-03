"use client";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { track } from "@vercel/analytics";
import DebtComparison from "./DebtComparison.client";
import StableArea from "../common/StableArea";

const HeroSection = () => {
  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol } = window.location;
    const hostname = window.location.hostname;
    const baseHost = hostname.replace(/^www\./, "");
    if (window.location.host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${window.location.host}`;
    return `${protocol}//app.${baseHost}`;
  }, []);

  return (
    <div className="hero min-h-screen relative">
      <div className="hero-content flex-col lg:flex-row gap-8 py-16 z-10">
        <div className="lg:w-1/2">
          <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300 rounded-lg text-base-content">
            <div className="card-body p-6">
              <h1 className="text-4xl font-bold mb-2">The optimal way to lend and borrow on Starknet</h1>
              <h2 className="text-2xl mb-4">Manage all your lending positions in one place</h2>
              <p className="py-2 text-lg flex items-center gap-2">
                Now supporting
                  <Image
                    src="/logos/strk.svg"
                    alt="Starknet Logo"
                    width={22}
                    height={22}
                    className="ml-1"
                    style={{ display: "inline-block", verticalAlign: "middle" }}
                  />
                  Starknet!
              </p>
              <p className="py-2 text-lg">
                Kapan allows you to refinance your debt, swap collaterals, compare rates and do everything you need to
                manage your DeFi lending portfolio efficiently. All operations are atomic and require no additional capital thanks to flash loans.
              </p>
              
              <div className="flex flex-wrap items-center gap-4 mt-6">
                <div className="flex gap-2">
                  <a
                    href="/app"
                    onClick={e => {
                      e.preventDefault();
                      track("Application launched", { source: "landing_page" });
                      window.location.assign(appUrl);
                    }}
                  >
                    <button className="btn btn-primary">Launch App</button>
                  </a>
                  <Link href="/info" passHref>
                    <button className="btn btn-outline">Learn More</button>
                  </Link>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="badge badge-outline">Starknet Live</div>
                  <div className="flex gap-2">
                    <div className="avatar">
                      <div className="w-8 rounded-lg bg-base-100 p-1 shadow-sm border border-base-300">
                        <Image src="/logos/vesu.svg" alt="Vesu" width={24} height={24} />
                      </div>
                    </div>
                    <div className="avatar">
                      <div className="w-8 rounded-lg bg-base-100 p-1 shadow-sm border border-base-300">
                        <Image src="/logos/nostra.svg" alt="Nostra" width={24} height={24} />
                      </div>
                    </div>
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
          <div className="card bg-base-100 bg-opacity-98 shadow-2xl border border-base-300 rounded-lg text-base-content">
            <div className="card-body p-6">
              {/* Debt comparison component */}
              <StableArea minHeight="26rem" innerClassName="h-full">
                <DebtComparison />
              </StableArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
