"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";
import { Theme } from "@radix-ui/themes";

/**
 * ThemeProvider that does NOT block rendering.
 * 
 * Previous implementation hid the entire page until hydration completed,
 * which blocked FCP/LCP for 2-3 seconds. This version renders immediately.
 * 
 * Flash prevention is handled by an inline script in layout.tsx that sets
 * the theme class before React hydrates.
 */
export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <Theme>{children}</Theme>
      {/* Sync DaisyUI's data-theme alongside class-based theme */}
      <DaisyUISync />
    </NextThemesProvider>
  );
};

const DaisyUISync = () => {
  const { resolvedTheme } = useTheme();
  React.useEffect(() => {
    try {
      const theme = resolvedTheme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
    } catch {}
  }, [resolvedTheme]);
  return null;
};
