import React from "react";
import Link from "next/link";
import Image from "next/image";
import { SwitchTheme } from "~~/components/SwitchTheme";

/**
 * Site footer
 */
export const Footer = () => {

  return (
    <div className="min-h-0 py-5 px-1 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            <Link
              href="https://discord.com/invite/D4TkKCFA"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm bg-base-100 rounded-full px-3 py-2 shadow-md hover:shadow-lg transition-all"
            >
              <Image
                src="/logos/discord.svg"
                alt="Discord Logo"
                width={20}
                height={20}
                className="w-5 h-5"
              />
              <span>Join our Discord</span>
            </Link>
          </div>
          <SwitchTheme className="pointer-events-auto" />
        </div>
      </div>
    </div>
  );
};
