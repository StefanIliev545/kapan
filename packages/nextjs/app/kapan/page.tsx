import type { Metadata, NextPage } from "next";
import Link from "next/link";

const featureItems = [
  {
    title: "Automated Portfolios",
    description:
      "Deploy dynamic strategies that rebalance positions automatically so your allocations stay aligned with your goals, even while you sleep.",
    label: "AP",
  },
  {
    title: "Multi-Chain Support",
    description:
      "Connect major EVM and non-EVM networks with unified monitoring, settlement, and compliance-ready reporting in one place.",
    label: "MC",
  },
  {
    title: "Advanced Analytics",
    description:
      "Unlock real-time performance dashboards, stress tests, and predictive insights to navigate market shifts with confidence.",
    label: "AA",
  },
  {
    title: "Security First",
    description:
      "Institutional-grade custody integrations and continuous risk scoring keep your assets protected across every integration.",
    label: "SF",
  },
  {
    title: "Team Collaboration",
    description:
      "Assign roles, automate approvals, and share live reports so every stakeholder is aligned on strategy and execution.",
    label: "TC",
  },
  {
    title: "Regulatory Ready",
    description:
      "Generate audit trails, tax statements, and compliance snapshots tailored for your jurisdiction with a single click.",
    label: "RR",
  },
];

const statsItems = [
  { value: "120K+", label: "Global Users" },
  { value: "$4.8B", label: "Assets Automated" },
  { value: "99.9%", label: "Uptime Reliability" },
];

export const metadata: Metadata = {
  title: "Kapan Finance | Modern Fintech Automation",
  description:
    "Discover Kapan.finance, a modern fintech automation platform with responsive design, showcasing hero, features, stats, CTA, and footer sections built with Tailwind CSS.",
};

const Hero = () => {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white">
      <div className="absolute inset-0 opacity-30" aria-hidden="true">
        <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.45),_transparent_60%)]" />
      </div>
      <div className="relative mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 sm:py-32 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200">Automation for Modern Finance</p>
        <h1 className="mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          Kapan Finance: Your Fintech on Autopilot
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-blue-100 sm:text-xl">
          Streamline treasury workflows, automate digital asset operations, and empower teams with actionable insights from a single, secure platform.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <button className="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
            Get Started
          </button>
          <Link
            href="#features"
            className="rounded-lg px-6 py-3 text-base font-semibold text-white/90 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Explore Platform
          </Link>
        </div>
      </div>
    </section>
  );
};

const FeaturesOverview = () => {
  return (
    <section id="features" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Key Features</h2>
          <p className="mt-4 text-base text-gray-700 leading-relaxed sm:text-lg">
            Kapan.finance delivers precision tooling for modern fintech operators, pairing responsive automation with intuitive insights so every decision is data-backed.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          {featureItems.map(feature => (
            <div
              key={feature.title}
              className="flex h-full flex-col rounded-xl bg-white p-6 shadow-lg transition-shadow hover:shadow-xl"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/10 text-sm font-semibold uppercase text-blue-600">
                {feature.label}
              </div>
              <div className="mt-6 space-y-3">
                <h3 className="text-xl font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-base leading-relaxed text-gray-700">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const StatsSection = () => {
  return (
    <section className="bg-gray-50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Trusted at Scale</h2>
          <p className="mt-4 text-base leading-relaxed text-gray-700 sm:text-lg">
            From emerging funds to global institutions, teams rely on Kapan.finance to deliver clarity and performance with uncompromising security.
          </p>
        </div>
        <dl className="mt-12 grid gap-10 sm:grid-cols-3">
          {statsItems.map(stat => (
            <div key={stat.label} className="flex flex-col items-center space-y-2">
              <dt className="text-3xl font-bold text-gray-900 sm:text-4xl">{stat.value}</dt>
              <dd className="text-sm font-medium uppercase tracking-wide text-gray-600">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};

const SecondaryCTA = () => {
  return (
    <section className="bg-blue-50 py-16 sm:py-20">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:px-8">
        <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Reclaim Your Time with Kapan
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-gray-700 sm:text-lg">
          Automate treasury rebalancing, surface actionable alerts, and move faster with workflows designed for modern operators.
        </p>
        <button className="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-50">
          Get Started
        </button>
      </div>
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="bg-gray-100 py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 text-sm text-gray-600 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="font-semibold text-gray-800">Company</p>
            <Link href="#" className="transition-opacity hover:opacity-70">
              About Us
            </Link>
            <Link href="#" className="transition-opacity hover:opacity-70">
              Careers
            </Link>
            <Link href="#" className="transition-opacity hover:opacity-70">
              Contact
            </Link>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-gray-800">Legal</p>
            <Link href="#" className="transition-opacity hover:opacity-70">
              Privacy Policy
            </Link>
            <Link href="#" className="transition-opacity hover:opacity-70">
              Terms of Service
            </Link>
            <Link href="#" className="transition-opacity hover:opacity-70">
              Compliance
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium text-gray-600">
          <Link href="#" className="transition-opacity hover:opacity-70">
            Twitter
          </Link>
          <Link href="#" className="transition-opacity hover:opacity-70">
            LinkedIn
          </Link>
          <Link href="#" className="transition-opacity hover:opacity-70">
            YouTube
          </Link>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-gray-500">© {new Date().getFullYear()} Kapan.finance. All rights reserved.</p>
    </footer>
  );
};

const KapanLandingPage: NextPage = () => {
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <main className="flex-grow">
        <Hero />
        <FeaturesOverview />
        <StatsSection />
        <SecondaryCTA />
      </main>
      <Footer />
    </div>
  );
};

export default KapanLandingPage;
