import { useMemo } from "react";

export const resolveAppUrl = (location?: Pick<Location, "protocol" | "hostname" | "host">): string => {
  if (!location) {
    return "/app";
  }

  const { protocol, hostname, host } = location;

  if (hostname === "kapan.finance" || hostname === "www.kapan.finance") {
    return "https://app.kapan.finance";
  }

  if (hostname === "app.kapan.finance") {
    return `${protocol}//${host}`;
  }

  // Preview and local hosts serve the dashboard directly at /app.
  return "/app";
};

/** Use the production app subdomain or the current deployment's /app route. */
export const useAppUrl = (): string =>
  useMemo(() => resolveAppUrl(typeof window === "undefined" ? undefined : window.location), []);
