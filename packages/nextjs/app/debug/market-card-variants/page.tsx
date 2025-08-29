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

const supplyBestRate = "10%";
const borrowBestRate = "12%";

const supplyColor = "bg-lime-500";
const borrowColor = "bg-orange-500";
const progressClass = "progress-info";

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

const RatePill: FC<{ current: string; optimal: string; color: string }> = ({
  current,
  optimal,
  color,
}) => (
  <div className="flex rounded-full overflow-hidden shadow text-sm text-white">
    <span className={`px-3 py-1 ${color}`}>{current}</span>
    <span className="px-3 py-1 flex items-center gap-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 animate-pulse">
      {optimal}
      <Image src="/logos/vesu.svg" alt="vesu" width={16} height={16} />
    </span>
  </div>
);

const PillRow: FC<{ label: string; current: string; optimal: string; color: string }> = ({
  label,
  current,
  optimal,
  color,
}) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-base-content/70 w-16">{label}</span>
    <RatePill current={current} optimal={optimal} color={color} />
  </div>
);

const InterestPillsVertical: FC = () => (
  <div className="space-y-2">
    <PillRow label="Supply" current={base.supplyRate} optimal={supplyBestRate} color={supplyColor} />
    <PillRow label="Borrow" current={base.borrowRate} optimal={borrowBestRate} color={borrowColor} />
  </div>
);

const InterestPillsRow: FC = () => (
  <div className="flex gap-6">
    <PillRow label="Supply" current={base.supplyRate} optimal={supplyBestRate} color={supplyColor} />
    <PillRow label="Borrow" current={base.borrowRate} optimal={borrowBestRate} color={borrowColor} />
  </div>
);

const InterestPillsRowBare: FC = () => (
  <div className="flex gap-6">
    <RatePill current={base.supplyRate} optimal={supplyBestRate} color={supplyColor} />
    <RatePill current={base.borrowRate} optimal={borrowBestRate} color={borrowColor} />
  </div>
);

const PriceInfo: FC = () => (
  <div className="flex items-baseline gap-2">
    <span className="text-sm text-base-content/70">Price</span>
    <span className="text-lg font-semibold">${base.price}</span>
  </div>
);

const Utilization: FC = () => (
  <div>
    <div className="flex justify-between text-sm text-base-content/70">
      <span>Utilization</span>
      <span>{base.utilization}%</span>
    </div>
    <progress className={`progress w-full ${progressClass}`} value={base.utilization} max="100"></progress>
  </div>
);

const VariantStacked: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPillsVertical />
    <PriceInfo />
    <Utilization />
  </CardShell>
);

const VariantRowPills: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPillsRow />
    <PriceInfo />
    <Utilization />
  </CardShell>
);

const VariantPriceTop: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <PriceInfo />
    <Utilization />
    <InterestPillsVertical />
  </CardShell>
);

const VariantHeaderPrice: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <div className="flex items-center gap-3">
      <Image src={base.icon} alt={base.name} width={32} height={32} className="rounded-full" />
      <div className="flex flex-col flex-1">
        <h3 className="text-lg font-semibold">{base.name}</h3>
        <span className="text-sm text-base-content/70">${base.price}</span>
      </div>
      <button className="btn btn-sm btn-primary btn-circle">+</button>
    </div>
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPillsVertical />
    <Utilization />
  </CardShell>
);

const VariantHeaderPriceRowPills: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <div className="flex items-center gap-3">
      <Image src={base.icon} alt={base.name} width={32} height={32} className="rounded-full" />
      <div className="flex flex-col flex-1">
        <h3 className="text-lg font-semibold">{base.name}</h3>
        <span className="text-sm text-base-content/70">${base.price}</span>
      </div>
      <button className="btn btn-sm btn-primary btn-circle">+</button>
    </div>
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPillsRow />
    <Utilization />
  </CardShell>
);

const VariantHeaderPriceRowPillsNote: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <div className="flex items-center gap-3">
      <Image src={base.icon} alt={base.name} width={32} height={32} className="rounded-full" />
      <div className="flex flex-col flex-1">
        <h3 className="text-lg font-semibold">{base.name}</h3>
        <span className="text-sm text-base-content/70">${base.price}</span>
      </div>
      <button className="btn btn-sm btn-primary btn-circle">+</button>
    </div>
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <div className="flex justify-between text-sm text-base-content/70">
      <span>Supply rate</span>
      <span>Borrow rate</span>
    </div>
    <InterestPillsRowBare />
    <Utilization />
  </CardShell>
);

const VariantHeaderPriceRowPillsLabelsBelow: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <div className="flex items-center gap-3">
      <Image src={base.icon} alt={base.name} width={32} height={32} className="rounded-full" />
      <div className="flex flex-col flex-1">
        <h3 className="text-lg font-semibold">{base.name}</h3>
        <span className="text-sm text-base-content/70">${base.price}</span>
      </div>
      <button className="btn btn-sm btn-primary btn-circle">+</button>
    </div>
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPillsRowBare />
    <div className="flex justify-between text-sm text-base-content/70">
      <span>Supply rate</span>
      <span>Borrow rate</span>
    </div>
    <Utilization />
  </CardShell>
);

const variants = [
  VariantStacked,
  VariantRowPills,
  VariantPriceTop,
  VariantHeaderPrice,
  VariantHeaderPriceRowPills,
  VariantHeaderPriceRowPillsNote,
  VariantHeaderPriceRowPillsLabelsBelow,
];

const MarketCardVariantsPage: FC = () => (
  <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
    {variants.map((Variant, idx) => (
      <Variant key={idx} />
    ))}
  </div>
);

export default MarketCardVariantsPage;
