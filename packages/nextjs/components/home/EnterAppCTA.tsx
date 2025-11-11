"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

const EnterAppCTA = () => {
  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol } = window.location;
    const hostname = window.location.hostname;
    const baseHost = hostname.replace(/^www\./, "");

    if (window.location.host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${window.location.host}`;

    return `${protocol}//app.${baseHost}`;
  }, []);

  return (
    <section className="relative py-12 bg-base-100 dark:bg-base-200">
      <div className="container mx-auto max-w-screen-lg px-5">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center gap-4 text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-base-content md:text-4xl">
            Ready to experience unified lending?
          </h2>
          <p className="max-w-xl text-base text-base-content/80">
            Jump straight into the Kapan app to borrow anytime and lend everywhere with a seamless multi-protocol workflow.
          </p>
          <motion.a
            href="/app"
            onClick={event => {
              event.preventDefault();
              window.location.assign(appUrl);
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-xl p-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 rounded-[0.75rem] bg-[conic-gradient(from_0deg,_oklch(var(--p))_0deg,_oklch(var(--a))_120deg,_oklch(var(--p))_240deg,_oklch(var(--a))_360deg)] opacity-90 transition-opacity duration-500 animate-[spin_6s_linear_infinite] group-hover:opacity-100 group-focus-visible:opacity-100"
            />
            <span className="relative z-10 inline-flex items-center justify-center gap-2 rounded-lg bg-base-100/90 px-8 py-3 text-lg font-semibold text-base-content shadow-lg backdrop-blur-sm transition-colors duration-300 group-hover:bg-base-100 dark:bg-base-300/90 dark:text-base-content">
              Enter App
            </span>
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
};

export default EnterAppCTA;
