import React from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Floating social links banner
 */
export const FloatingSocials = () => {
  return (
    <div className="fixed flex justify-between items-end w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
      {/* Social links - left side */}
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
          href="https://t.me/+vYCKr2TrOXRiODg0"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm bg-base-100 dark:bg-base-200 rounded-full px-3 py-2 shadow-md hover:shadow-lg transition-all"
        >
          <Image
            src="/logos/telegram.svg"
            alt="Telegram Logo"
            width={20}
            height={20}
            className="w-5 h-5"
          />
          <span className="text-base-content">Join our Telegram</span>
        </Link>
        <Link
          href="https://x.com/KapanFinance"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center bg-base-100 dark:bg-base-200 rounded-full w-10 h-10 shadow-md hover:shadow-lg transition-all"
          title="Follow us on X"
          aria-label="Follow us on X"
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

      {/* Empty div to maintain layout */}
      <div />
    </div>
  );
};

export default FloatingSocials;
