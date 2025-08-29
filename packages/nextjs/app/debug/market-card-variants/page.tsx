import Image from "next/image";
import type { FC, ReactNode } from "react";
import { MarketCardProps } from "~~/components/specific/vesu/MarketCard";

const base: MarketCardProps = {
  icon: "/logos/strk.svg",
  name: "STRK",
  supplyRate: "5%",
  borrowRate: "10%",
  price: "1.00",
  utilization: "45",
  address: "0x0",
  networkType: "starknet",
};

const CardShell: FC<{ className?: string; children: ReactNode }> = ({ className = "", children }) => (
  <div className={`card ${className}`}>
    <div className="card-body p-4 space-y-4">{children}</div>
  </div>
);

const Header: FC<{ button?: ReactNode }> = ({ button }) => (
  <div className="flex items-center gap-3">
    <Image src={base.icon} alt={base.name} width={32} height={32} className="rounded-full" />
    <h3 className="text-lg font-semibold flex-1">{base.name}</h3>
    {button}
  </div>
);

const Stat: FC<{ label: string; value: ReactNode }> = ({ label, value }) => (
  <div>
    <div className="text-base-content/70">{label}</div>
    <div className="font-medium">{value}</div>
  </div>
);

// Variant 1 - base card
const VariantBase: FC = () => (
  <CardShell className="bg-base-100 shadow-md">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span className="text-success">{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span className="text-error">{base.borrowRate}</span>} />
    </div>
  </CardShell>
);

// Variant 2 - gradient background
const VariantGradient: FC = () => (
  <CardShell className="text-white shadow-md bg-gradient-to-br from-indigo-500 to-fuchsia-600">
    <Header button={<button className="btn btn-sm btn-circle bg-white text-black">+</button>} />
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span>{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span>{base.borrowRate}</span>} />
    </div>
  </CardShell>
);

// Variant 3 - pill interest display
const VariantPill: FC = () => (
  <CardShell className="bg-base-100 shadow-md">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <div className="flex justify-center">
      <div className="flex overflow-hidden rounded-full text-sm shadow">
        <span className="px-3 py-1 bg-base-200 text-success">{base.supplyRate}</span>
        <span className="px-3 py-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white flex items-center gap-1 animate-pulse">
          {base.borrowRate}
          <Image src="/logos/vesu.svg" alt="vesu" width={16} height={16} />
        </span>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
    </div>
  </CardShell>
);

// Variant 4 - vertical stats
const VariantVertical: FC = () => (
  <CardShell className="bg-base-100 shadow-md">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <div className="space-y-2 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span className="text-success">{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span className="text-error">{base.borrowRate}</span>} />
    </div>
  </CardShell>
);

// Variant 5 - heavy shadow
const VariantShadow: FC = () => (
  <CardShell className="bg-base-100 shadow-xl">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span className="text-success">{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span className="text-error">{base.borrowRate}</span>} />
    </div>
  </CardShell>
);

// Variant 6 - glass effect
const VariantGlass: FC = () => (
  <CardShell className="bg-white/10 backdrop-blur border border-white/20 shadow-md">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span className="text-success">{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span className="text-error">{base.borrowRate}</span>} />
    </div>
  </CardShell>
);

// Variant 7 - logo overlay
const VariantOverlay: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image
      src={base.icon}
      alt="overlay"
      width={80}
      height={80}
      className="opacity-10 absolute -right-4 -bottom-4"
    />
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span className="text-success">{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span className="text-error">{base.borrowRate}</span>} />
    </div>
  </CardShell>
);

// Variant 8 - bordered card
const VariantBorder: FC = () => (
  <CardShell className="bg-base-100 shadow-md border border-purple-500">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span className="text-success">{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span className="text-error">{base.borrowRate}</span>} />
    </div>
  </CardShell>
);

// Variant 9 - compact horizontal
const VariantCompact: FC = () => (
  <CardShell className="bg-base-100 shadow-md">
    <div className="flex items-center gap-4">
      <Image src={base.icon} alt={base.name} width={40} height={40} className="rounded-full" />
      <div className="flex-1">
        <h3 className="text-lg font-semibold">{base.name}</h3>
        <div className="text-sm">${base.price} · {base.utilization}% util</div>
        <div className="text-xs"><span className="text-success">{base.supplyRate}</span> / <span className="text-error">{base.borrowRate}</span></div>
      </div>
      <button className="btn btn-sm btn-primary btn-circle">+</button>
    </div>
  </CardShell>
);

// Variant 10 - floating action button
const VariantFloating: FC = () => (
  <CardShell className="bg-base-100 shadow-md relative">
    <Header />
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Stat label="Price" value={`$${base.price}`} />
      <Stat label="Utilization" value={`${base.utilization}%`} />
      <Stat label="Supply APY" value={<span className="text-success">{base.supplyRate}</span>} />
      <Stat label="Borrow APR" value={<span className="text-error">{base.borrowRate}</span>} />
    </div>
    <button className="btn btn-primary btn-circle btn-sm absolute -bottom-3 -right-3">+</button>
  </CardShell>
);

const variants = [
  VariantBase,
  VariantGradient,
  VariantPill,
  VariantVertical,
  VariantShadow,
  VariantGlass,
  VariantOverlay,
  VariantBorder,
  VariantCompact,
  VariantFloating,
];

const MarketCardVariantsPage: FC = () => (
  <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
    {variants.map((Variant, idx) => (
      <Variant key={idx} />
    ))}
  </div>
);

export default MarketCardVariantsPage;
