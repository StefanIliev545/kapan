import React from "react";
import Image from "next/image";
import Link from "next/link";
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
              className="flex items-center gap-1 text-sm bg-base-100 dark:bg-base-200 rounded-full px-3 py-2 shadow-md hover:shadow-lg transition-all"
            >
              <Image 
                src="/logos/discord.svg" 
                alt="Discord Logo" 
                width={20} 
                height={20} 
                className="w-5 h-5 dark:invert dark:brightness-90" 
              />
              <span className="text-base-content">Join our Discord</span>
            </Link>
            <Link
              href="https://x.com/KapanFinance"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center bg-base-100 dark:bg-base-200 rounded-full w-10 h-10 shadow-md hover:shadow-lg transition-all"
              title="Follow us on X"
            >
              <Image 
                src="/logos/x-logo.svg" 
                alt="X Logo" 
                width={16} 
                height={16} 
                className="w-4 h-4 dark:invert dark:brightness-90" 
              />
            </Link>
          </div>
          <SwitchTheme className="pointer-events-auto" />
        </div>
      </div>
    </div>
  );
};
