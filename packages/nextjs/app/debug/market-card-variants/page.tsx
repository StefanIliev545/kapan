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

const PillRow: FC<{ label: string; current: string; optimal: string; color: string }> = ({
  label,
  current,
  optimal,
  color,
}) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-base-content/70 w-16">{label}</span>
    <div className="flex rounded-full overflow-hidden shadow text-sm text-white">
      <span className={`px-3 py-1 ${color}`}>{current}</span>
      <span className="px-3 py-1 flex items-center gap-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 animate-pulse">
        {optimal}
        <Image src="/logos/vesu.svg" alt="vesu" width={16} height={16} />
      </span>
    </div>
  </div>
);

const InterestPills: FC<{ supplyColor: string; borrowColor: string }> = ({ supplyColor, borrowColor }) => (
  <div className="space-y-2">
    <PillRow label="Supply" current={base.supplyRate} optimal={supplyBestRate} color={supplyColor} />
    <PillRow label="Borrow" current={base.borrowRate} optimal={borrowBestRate} color={borrowColor} />
  </div>
);

const PriceUtil: FC<{ progressClass: string }> = ({ progressClass }) => (
  <div className="space-y-2">
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-base-content/70">Price</span>
      <span className="text-lg font-semibold">${base.price}</span>
    </div>
    <div>
      <div className="flex justify-between text-sm text-base-content/70">
        <span>Utilization</span>
        <span>{base.utilization}%</span>
      </div>
      <progress className={`progress w-full ${progressClass}`} value={base.utilization} max="100"></progress>
    </div>
  </div>
);

const VariantPurple: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPills supplyColor="bg-green-600" borrowColor="bg-purple-600" />
    <PriceUtil progressClass="progress-secondary" />
  </CardShell>
);

const VariantTeal: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPills supplyColor="bg-green-500" borrowColor="bg-cyan-500" />
    <PriceUtil progressClass="progress-info" />
  </CardShell>
);

const VariantSunset: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPills supplyColor="bg-lime-500" borrowColor="bg-orange-500" />
    <PriceUtil progressClass="progress-warning" />
  </CardShell>
);

const VariantLime: FC = () => (
  <CardShell className="relative bg-base-100 shadow-md overflow-hidden">
    <Header button={<button className="btn btn-sm btn-primary btn-circle">+</button>} />
    <Image src={base.icon} alt="overlay" width={120} height={120} className="absolute -right-8 -bottom-8 opacity-10" />
    <InterestPills supplyColor="bg-green-500" borrowColor="bg-indigo-600" />
    <PriceUtil progressClass="progress-success" />
  </CardShell>
);

const variants = [VariantPurple, VariantTeal, VariantSunset, VariantLime];

const MarketCardVariantsPage: FC = () => (
  <div className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
    {variants.map((Variant, idx) => (
      <Variant key={idx} />
    ))}
  </div>
);

export default MarketCardVariantsPage;
