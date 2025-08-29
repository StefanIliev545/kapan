import React from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Site footer
 */
export const Footer = () => {
  return (
    <div className="min-h-0 py-5 px-1 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-start items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            <Link
              href="https://discord.gg/Vjk6NhkxGv"
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
              href="/blog"
              className="flex items-center gap-1 text-sm bg-base-100 dark:bg-base-200 rounded-full px-3 py-2 shadow-md hover:shadow-lg transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
              </svg>
              <span className="text-base-content">Blog</span>
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
        </div>
      </div>
    </div>
  );
};
