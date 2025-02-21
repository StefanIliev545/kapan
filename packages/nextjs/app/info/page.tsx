"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

const InfoPage = () => {
  return (
    <div className="container mx-auto px-5 py-8">
      <h1 className="text-4xl font-bold mb-8">About Kapan</h1>

      <section className="prose prose-lg max-w-none mb-12">
        <h2>Overview</h2>
        <p>
          Kapan is a decentralized lending aggregator that enables users to seamlessly interact with multiple lending protocols without having to navigate different platforms or understand their individual complexities.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title">Key Features</h3>
            <ul className="list-disc list-inside space-y-2">
              <li>Single interface for multiple lending protocols</li>
              <li>Non-custodial - your funds remain under your control</li>
              <li>Find optimal rates across multiple protocols</li>
              <li>Flash loan-powered debt migration</li>
              <li>Unified collateral management</li>
            </ul>
          </div>
        </div>

        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title">Supported Actions</h3>
            <ul className="list-disc list-inside space-y-2">
              <li>Supply assets as collateral</li>
              <li>Borrow against your collateral</li>
              <li>Repay existing loans</li>
              <li>Move positions between protocols</li>
              <li>Compare rates across platforms</li>
            </ul>
          </div>
        </div>
      </div>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How It Works</h2>
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title flex items-center gap-2">
                <ShieldCheckIcon className="h-6 w-6 text-primary" />
                Protocol Integration
              </h3>
              <p className="mb-4">
                Kapan integrates with leading lending protocols through protocol-specific gateways. Currently, we support:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-base-300 rounded-lg">
                  <Image
                    src="/logos/aave.svg"
                    alt="Aave"
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span className="font-medium">Aave V3</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-base-300 rounded-lg">
                  <Image
                    src="/logos/compound.svg"
                    alt="Compound"
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span className="font-medium">Compound V3</span>
                </div>
              </div>
              <p className="mt-4 text-base-content/70">
                Each protocol gateway implements a standardized interface, making it easy to add new protocols in the future.
              </p>
            </div>
          </div>

          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title flex items-center gap-2">
                <BoltIcon className="h-6 w-6 text-primary" />
                Flash Loan-Powered Migrations
              </h3>
              <p className="mb-4">
                Move debt positions between protocols without requiring upfront capital, powered by flash loans:
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">1</div>
                  <span>Flash loan obtains the required repayment amount</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">2</div>
                  <span>Debt is repaid in the source protocol</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">3</div>
                  <span>Collateral is moved to the target protocol</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">4</div>
                  <span>New debt is opened in the target protocol</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-full p-2 text-primary">5</div>
                  <span>Flash loan is repaid</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 text-base-content/70">
                <ArrowPathIcon className="h-5 w-5" />
                <span>All steps execute in a single atomic transaction</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap using daisyUI Vertical Timeline */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-center">Roadmap</h2>
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
              <h3 className="font-bold">Initial Launch</h3>
              <p className="text-base-content/70 mb-3">
                Core features supporting basic lending operations across Aave V3 and Compound V3.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-success">Supply Assets</span>
                <span className="badge badge-success">Repay Loans</span>
                <span className="badge badge-success">Move Debt</span>
                <span className="badge badge-success">Rate Comparison</span>
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
              <h3 className="font-bold">Advanced Operations</h3>
              <p className="text-base-content/70 mb-3">
                Enhanced debt management with smart routing and collateral operations.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-outline">Collateral Switching</span>
                <span className="badge badge-outline">Smart Move Routing</span>
                <span className="badge badge-outline">Compatible Collateral Detection</span>
                <span className="badge badge-outline">Multi-step Position Migration</span>
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
              <h3 className="font-bold">Protocol Expansion</h3>
              <p className="text-base-content/70 mb-3">
                Expanding support for additional lending protocols to provide more options and better rates.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-outline">Euler</span>
                <span className="badge badge-outline">Morpho</span>
                <span className="badge badge-outline">Spark</span>
                <span className="badge badge-outline">Venus</span>
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
              <h3 className="font-bold">Rate Optimization</h3>
              <p className="text-base-content/70 mb-3">
                Implementing sophisticated algorithms for finding and automatically executing the most profitable lending strategies.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-outline">APY Predictions</span>
                <span className="badge badge-outline">Auto-rebalancing</span>
                <span className="badge badge-outline">Gas-optimized Routes</span>
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
              <h3 className="font-bold">Cross-chain & Advanced Features</h3>
              <p className="text-base-content/70 mb-3">
                Expanding to multiple chains and implementing advanced portfolio management features.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="font-medium text-base-content/80">Chains</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-outline">Arbitrum</span>
                    <span className="badge badge-outline">Optimism</span>
                    <span className="badge badge-outline">Polygon</span>
                    <span className="badge badge-outline">Base</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="font-medium text-base-content/80">Features</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-outline">Position Notifications</span>
                    <span className="badge badge-outline">Risk Analytics</span>
                    <span className="badge badge-outline">Smart Alerts</span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section className="flex flex-col md:flex-row gap-4 items-center justify-center">
        <Link href="https://github.com/stefaniliev545/kapan" target="_blank" className="btn btn-primary">
          View on GitHub
          <ArrowTopRightOnSquareIcon className="h-4 w-4 ml-2" />
        </Link>
        <Link href="/docs" className="btn btn-outline">
          Documentation
        </Link>
      </section>
    </div>
  );
};

export default InfoPage;
