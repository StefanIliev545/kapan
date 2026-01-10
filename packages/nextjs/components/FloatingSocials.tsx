import React from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Floating social links banner
 */
export const FloatingSocials = () => {
  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-10 flex w-full items-end justify-between p-4">
      {/* Social links - left side */}
      <div className="pointer-events-auto flex flex-col gap-2 md:flex-row">
        <Link
          href="https://discord.gg/Vjk6NhkxGv"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-base-100 dark:bg-base-200 floating-action flex items-center gap-1 rounded-full px-3 py-2 text-sm"
        >
          <Image
            src="/logos/discord.svg"
            alt="Discord Logo"
            width={20}
            height={20}
            className="size-5 dark:brightness-90 dark:invert"
          />
          <span className="text-base-content">Join our Discord</span>
        </Link>
        <Link
          href="https://t.me/+vYCKr2TrOXRiODg0"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-base-100 dark:bg-base-200 floating-action flex items-center gap-1 rounded-full px-3 py-2 text-sm"
        >
          <Image
            src="/logos/telegram.svg"
            alt="Telegram Logo"
            width={20}
            height={20}
            className="size-5"
          />
          <span className="text-base-content">Join our Telegram</span>
        </Link>
        <Link
          href="https://x.com/KapanFinance"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-center bg-base-100 dark:bg-base-200 floating-action size-10 rounded-full"
          title="Follow us on X"
          aria-label="Follow us on X"
        >
          <Image
            src="/logos/x-logo.svg"
            alt="X Logo"
            width={16}
            height={16}
            className="size-4 dark:brightness-90 dark:invert"
          />
        </Link>
      </div>

      {/* Empty div to maintain layout */}
      <div />
    </div>
  );
};

export default FloatingSocials;
