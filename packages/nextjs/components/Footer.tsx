import React from "react";
import Link from "next/link";

/**
 * Simple site footer with navigation links
 */
export const Footer = () => {
  return (
    <footer className="w-full py-4 text-center text-xs text-base-content/70">
      <div className="flex justify-center gap-4">
        <Link href="/blog" className="hover:underline">
          Blog
        </Link>
        <Link href="/license" className="hover:underline">
          License
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
