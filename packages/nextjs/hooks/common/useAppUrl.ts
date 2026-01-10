import { useMemo } from "react";

/**
 * Hook to construct the app subdomain URL based on current location.
 * Maps landing pages (e.g., kapan.finance) to app.kapan.finance.
 * Handles localhost development and www. prefixes.
 *
 * @returns The app URL string (e.g., "https://app.kapan.finance")
 */
export const useAppUrl = (): string => {
  return useMemo(() => {
    if (typeof window === "undefined") return "/app";

    const { protocol, hostname, host } = window.location;
    const baseHost = hostname.replace(/^www\./, "");

    // Local dev: map anything *.localhost:3000 to app.localhost:3000
    if (host.endsWith("localhost:3000")) {
      return `${protocol}//app.localhost:3000`;
    }

    // If already on app.<host>, keep it
    if (hostname.startsWith("app.")) {
      return `${protocol}//${host}`;
    }

    // Default: prefix with app.
    return `${protocol}//app.${baseHost}`;
  }, []);
};
