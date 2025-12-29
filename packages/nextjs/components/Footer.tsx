import React from "react";
import Link from "next/link";

/**
 * Simple site footer with navigation links
 */
export const Footer = () => {
  return (
    <footer className="w-full py-6 text-center">
      <div className="flex justify-center gap-6 text-[10px] uppercase tracking-wider text-base-content/30">
        <Link href="/blog" className="hover:text-base-content/50 transition-colors">
          Blog
        </Link>
        <Link href="/license" className="hover:text-base-content/50 transition-colors">
          License
        </Link>
        <Link href="/privacy" className="hover:text-base-content/50 transition-colors">
          Privacy
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
