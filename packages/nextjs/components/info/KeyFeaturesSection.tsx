import { BoltIcon, ScaleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { FC } from "react";

interface Feature {
  icon: JSX.Element;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <BoltIcon className="w-6 h-6" />,
    title: "Atomic Debt Migration",
    description: "Move loans between protocols in a single transaction.",
  },
  {
    icon: <ScaleIcon className="w-6 h-6" />,
    title: "Best Rate Discovery",
    description: "Compare lending markets to find optimal APYs.",
  },
  {
    icon: <ShieldCheckIcon className="w-6 h-6" />,
    title: "Non‑custodial",
    description: "Your funds always remain under your control.",
  },
];

const KeyFeaturesSection: FC = () => {
  return (
    <section className="py-10">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Key Features</h2>
      <div className="md:grid md:grid-cols-3 gap-6">
        {features.map(feature => (
          <div
            key={feature.title}
            className="bg-base-200 p-6 rounded-xl flex flex-col items-center text-center mb-4 md:mb-0"
          >
            <div className="mb-3 text-primary">{feature.icon}</div>
            <h3 className="font-semibold mb-2">{feature.title}</h3>
            <p className="text-sm text-base-content/70">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default KeyFeaturesSection;
