"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const LendingSidebar = () => {
  const pathname = usePathname();
  const links = [
    { href: "/app", label: "Positions" },
    { href: "/markets", label: "Markets" },
  ];
  return (
    <aside className="w-32 mr-4">
      <ul className="menu bg-base-200 rounded-box p-2">
        {links.map(link => (
          <li key={link.href}>
            <Link href={link.href} className={pathname === link.href ? "active" : ""}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
};

export default LendingSidebar;
