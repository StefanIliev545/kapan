import { CodeBracketIcon, CurrencyDollarIcon, LockClosedIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

/**
 * Verifiable trust signals for cold/organic visitors deciding whether to act.
 * Server component (no client JS). Deliberately carries ONLY claims we can stand behind:
 * - Non-custodial (architecture fact)
 * - No protocol fee (confirmed: contracts take no fee)
 * - Open source (public repo)
 * - Audit scoped accurately to Starknet contracts (the EVM deployments are pre-audit/beta —
 *   do NOT imply they are audited here).
 * No TVL / "trusted by N" / volume claims — those need audited mainnet data and stay out.
 */
interface TrustItem {
  Icon: typeof ShieldCheckIcon;
  label: string;
  sub?: string;
  href?: string;
}

const TRUST_ITEMS: TrustItem[] = [
  { Icon: LockClosedIcon, label: "Non-custodial", sub: "you keep custody of your funds" },
  { Icon: CurrencyDollarIcon, label: "No protocol fee", sub: "only network gas + swap fees" },
  { Icon: CodeBracketIcon, label: "Open source", href: "https://github.com/StefanIliev545/kapan" },
  {
    Icon: ShieldCheckIcon,
    label: "Starknet contracts audited by Codespect",
    href: "/audits/022_CODESPECT_KAPAN_FINANCE.pdf",
  },
];

export const TrustStrip = ({ className = "" }: { className?: string }) => (
  <ul className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs ${className}`}>
    {TRUST_ITEMS.map(({ Icon, label, sub, href }) => {
      const body = (
        <span className="inline-flex items-center gap-1.5">
          <Icon className="text-base-content/50 size-4 shrink-0" />
          <span className="text-base-content/80 font-medium">{label}</span>
          {sub && <span className="text-base-content/55 hidden sm:inline">— {sub}</span>}
        </span>
      );
      return (
        <li key={label}>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">
              {body}
            </a>
          ) : (
            body
          )}
        </li>
      );
    })}
  </ul>
);

export default TrustStrip;
