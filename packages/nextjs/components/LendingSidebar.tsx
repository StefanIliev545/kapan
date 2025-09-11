"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RectangleStackIcon, BanknotesIcon } from "@heroicons/react/24/outline";

export const LendingSidebar = () => {
  const pathname = usePathname();
  const links = [
    { href: "/app", label: "Positions", icon: RectangleStackIcon },
    { href: "/markets", label: "Markets", icon: BanknotesIcon },
  ];

  return (
    <aside className="group sticky top-[4.5rem] min-h-[calc(100vh-4.5rem)] self-start flex-shrink-0 w-16 hover:w-40 transition-all duration-300 overflow-hidden">
      <ul className="menu bg-base-200 rounded-box py-2 pr-2 pl-0 min-h-full">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-2 ${
                pathname === href ? "active" : ""
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="hidden group-hover:inline">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default LendingSidebar;
