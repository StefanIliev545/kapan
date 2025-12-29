"use client";

import { useEffect } from "react";

/**
 * Ensures the kapan theme is always applied.
 * Since kapan is now the only theme, this is mostly a safeguard.
 */
export const useKapanTheme = () => {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", "kapan");
    html.classList.add("dark");
    html.classList.remove("light");
  }, []);
};

/**
 * Alias for useKapanTheme - kept for compatibility.
 */
export const useKapanThemePersistent = useKapanTheme;
