"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import Head from "next/head";
import { DeployedContractsList } from "~~/app/components/DeployedContractsList";

const InfoPage = () => {
  return (
    <div className="container mx-auto px-5 py-8">
      <h1 className="text-4xl font-bold mb-8">Kapan Finance: Web3 Lending Aggregator & Atomic Debt Migration</h1>

      <section className="prose prose-lg max-w-none mb-12">
        <h2>DeFi Lending Aggregation & Debt Refinancing Platform</h2>
        <p>
          Kapan is a decentralized lending aggregator that enables users to seamlessly interact with multiple lending protocols without having to navigate different platforms or understand their individual complexities. Our revolutionary <strong>atomic debt migration</strong> technology allows borrowers to efficiently move loans between protocols like <strong>Aave and Compound</strong> to optimize interest rates and improve capital efficiency.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title">Key Features of Web3 Lending Optimization</h3>
            <ul className="list-disc list-inside space-y-2">
              <li>Single interface for multiple DeFi lending protocols</li>
              <li>Non-custodial - your funds remain under your control</li>
              <li>Find optimal loan rates across multiple DeFi protocols</li>
              <li><strong>Flash loan-powered atomic debt migration</strong></li>
              <li>Unified cross-protocol collateral management</li>
              <li>Zero additional capital required for loan refinancing</li>
            </ul>
          </div>
        </div>

        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title">Supported DeFi Operations</h3>
            <ul className="list-disc list-inside space-y-2">
              <li>Supply assets as collateral across multiple lending protocols</li>
              <li>Borrow against your collateral at optimal rates</li>
              <li>Repay existing loans efficiently</li>
              <li><strong>Migrate debt positions between protocols in one transaction</strong></li>
              <li>Compare lending and borrowing rates across DeFi platforms</li>
              <li>Refinance Web3 loans to reduce interest costs</li>
            </ul>
          </div>
        </div>
      </div>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How Web3 Atomic Debt Migration Works</h2>
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title flex items-center gap-2">
                <ShieldCheckIcon className="h-6 w-6 text-primary" />
                Cross-Protocol DeFi Integration
              </h3>
              <p className="mb-4">
                Kapan seamlessly integrates with leading DeFi lending protocols through specialized gateways. Our platform currently supports:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-base-300 rounded-lg">
                  <Image
                    src="/logos/aave.svg"
                    alt="Aave V3 lending protocol"
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span className="font-medium">Aave V3 - Leading DeFi lending protocol</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-base-300 rounded-lg">
                  <Image
                    src="/logos/compound.svg"
                    alt="Compound V3 lending protocol"
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span className="font-medium">Compound V3 - Efficient DeFi borrowing platform</span>
                </div>
              </div>
              <p className="mt-4 text-base-content/70">
                Each protocol gateway implements a standardized interface, making it easy to add new DeFi lending platforms in the future.
              </p>
            </div>
          </div>

          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title flex items-center gap-2">
                <BoltIcon className="h-6 w-6 text-primary" />
                Flash Loan-Powered Debt Refinancing
              </h3>
              <p className="mb-4">
                Our <strong>atomic debt migration</strong> technology lets you move loan positions between protocols like <strong>Aave and Compound</strong> without requiring upfront capital, powered by flash loans:
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">1</div>
                  <span>Flash loan obtains the required debt repayment amount</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">2</div>
                  <span>Existing loan is repaid in the source protocol (e.g., Aave)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">3</div>
                  <span>Collateral is transferred to the target protocol (e.g., Compound)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">4</div>
                  <span>New loan is opened in the target protocol at better rates</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">5</div>
                  <span>Flash loan is repaid from the new position</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 text-base-content/70">
                <ArrowPathIcon className="h-5 w-5" />
                <span>All steps execute in a single atomic transaction - 100% secure with zero risk of partial execution</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Benefits of Web3 Loan Refinancing</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title flex items-center gap-2">
                <CurrencyDollarIcon className="h-6 w-6 text-primary" />
                Financial Advantages
              </h3>
              <ul className="list-disc list-inside space-y-3">
                <li><strong>Lower interest rates</strong> by moving debt to the most competitive protocol</li>
                <li><strong>Zero additional capital required</strong> for refinancing existing loans</li>
                <li><strong>Reduced gas costs</strong> compared to manual migration methods</li>
                <li><strong>Improved capital efficiency</strong> across your DeFi lending portfolio</li>
                <li><strong>No liquidation risk</strong> during the migration process</li>
              </ul>
            </div>
          </div>
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title flex items-center gap-2">
                <ChartBarIcon className="h-6 w-6 text-primary" />
                Technical Innovations
              </h3>
              <ul className="list-disc list-inside space-y-3">
                <li><strong>Atomic execution</strong> guarantees complete success or full reversion</li>
                <li><strong>Smart contract orchestration</strong> coordinates complex multi-step processes</li>
                <li><strong>Cross-protocol compatibility</strong> between major lending platforms</li>
                <li><strong>Balancer flash loan integration</strong> for efficient capital sourcing</li>
                <li><strong>Automated rate optimization</strong> identifies the best lending terms</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap using daisyUI Vertical Timeline */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-center">DeFi Lending Aggregation Roadmap</h2>
        <ul className="timeline timeline-vertical">
          <li>
            <div className="timeline-start">0</div>
            <div className="timeline-middle">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="timeline-end timeline-box">
              <h3 className="font-bold">Initial Web3 Lending Platform Launch</h3>
              <p className="text-base-content/70 mb-3">
                Core features supporting basic lending operations and atomic debt migration across Aave V3 and Compound V3.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-success">Supply Assets</span>
                <span className="badge badge-success">Repay Loans</span>
                <span className="badge badge-success">Atomic Debt Migration</span>
                <span className="badge badge-success">Cross-Protocol Rate Comparison</span>
              </div>
            </div>
            <hr />
          </li>
          <li>
            <hr />
            <div className="timeline-start">1</div>
            <div className="timeline-middle">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="timeline-end timeline-box">
              <h3 className="font-bold">Advanced DeFi Loan Management</h3>
              <p className="text-base-content/70 mb-3">
                Enhanced debt management with smart routing and cross-protocol collateral operations.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-outline">Collateral Switching</span>
                <span className="badge badge-outline">Smart Debt Migration Routing</span>
                <span className="badge badge-outline">Cross-Protocol Collateral Detection</span>
                <span className="badge badge-outline">Multi-step Position Refinancing</span>
              </div>
            </div>
            <hr />
          </li>
          <li>
            <hr />
            <div className="timeline-start">2</div>
            <div className="timeline-middle">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="timeline-end timeline-box">
              <h3 className="font-bold">Web3 Lending Protocol Expansion</h3>
              <p className="text-base-content/70 mb-3">
                Expanding our atomic debt migration to support additional DeFi lending protocols for more refinancing options and better rates.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-outline">Euler Finance</span>
                <span className="badge badge-outline">Morpho Labs</span>
                <span className="badge badge-outline">Spark Protocol</span>
                <span className="badge badge-outline">Venus Protocol</span>
              </div>
            </div>
            <hr />
          </li>
          <li>
            <hr />
            <div className="timeline-start">3</div>
            <div className="timeline-middle">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="timeline-end timeline-box">
              <h3 className="font-bold">DeFi Loan Rate Optimization</h3>
              <p className="text-base-content/70 mb-3">
                Implementing sophisticated algorithms for finding and automatically executing the most profitable Web3 loan refinancing strategies.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-outline">Interest Rate Predictions</span>
                <span className="badge badge-outline">Automated Debt Rebalancing</span>
                <span className="badge badge-outline">Gas-optimized Migration Routes</span>
                <span className="badge badge-outline">Yield Optimization Strategies</span>
              </div>
            </div>
            <hr />
          </li>
          <li>
            <hr />
            <div className="timeline-start">4</div>
            <div className="timeline-middle">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="timeline-end timeline-box">
              <h3 className="font-bold">Cross-chain Web3 Debt Migration & Advanced Features</h3>
              <p className="text-base-content/70 mb-3">
                Expanding atomic debt migration to multiple blockchain networks and implementing advanced DeFi portfolio management features.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="font-medium text-base-content/80">Supported Chains</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-outline">Arbitrum</span>
                    <span className="badge badge-outline">Optimism</span>
                    <span className="badge badge-outline">Polygon</span>
                    <span className="badge badge-outline">Base</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-medium text-base-content/80">Advanced Features</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-outline">Loan Health Notifications</span>
                    <span className="badge badge-outline">DeFi Risk Analytics</span>
                    <span className="badge badge-outline">Rate Change Alerts</span>
                    <span className="badge badge-outline">Cross-chain Debt Migration</span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>

      {/* Deployed Contracts Section */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-center">Deployed Smart Contracts</h2>
        <p className="text-center mb-6">
          Kapan Finance&apos;s atomic debt migration functionality is powered by the following smart contracts, 
          enabling secure cross-protocol interactions for Web3 lending refinancing.
        </p>
        
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <DeployedContractsList />
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-center">The Web3 Lending Revolution</h2>
        <div className="card bg-base-200">
          <div className="card-body prose max-w-none">
            <p>
              Kapan Finance is at the forefront of the <strong>DeFi lending revolution</strong>, making it easier than ever to manage borrowing positions across multiple protocols. Our <strong>atomic debt migration</strong> technology eliminates the traditional barriers to refinancing in Web3:
            </p>
            <ul>
              <li><strong>No need for additional capital</strong> to close existing positions</li>
              <li><strong>Eliminate market exposure risks</strong> during migration</li>
              <li><strong>Save on gas fees</strong> with single-transaction refinancing</li>
              <li><strong>Optimize interest rates</strong> across the entire DeFi ecosystem</li>
              <li><strong>Maintain your collateral positions</strong> while moving debt</li>
            </ul>
            <p>
              Whether you&apos;re looking to move your <strong>Aave debt position</strong> to <strong>Compound</strong> for better rates, or optimize your borrowing strategy across multiple protocols, Kapan&apos;s atomic debt migration provides a seamless, secure solution for Web3 lending optimization.
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col md:flex-row gap-4 items-center justify-center">
        <Link href="https://github.com/stefaniliev545/kapan" target="_blank" className="btn btn-primary">
          View on GitHub
          <ArrowTopRightOnSquareIcon className="h-4 w-4 ml-2" />
        </Link>
        <Link href="/docs" className="btn btn-outline">
          DeFi Debt Migration Documentation
        </Link>
      </section>
    </div>
  );
};

export default InfoPage;
