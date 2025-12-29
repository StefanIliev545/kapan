"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";
import { Theme } from "@radix-ui/themes";

/**
 * ThemeProvider that forces the kapan dark theme.
 * 
 * We only support one theme (kapan) so this is simplified.
 */
export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      disableTransitionOnChange
      {...props}
    >
      <Theme appearance="dark">{children}</Theme>
      {/* Ensure DaisyUI's data-theme is always kapan */}
      <KapanThemeSync />
    </NextThemesProvider>
  );
};

const KapanThemeSync = () => {
  React.useEffect(() => {
    // Always force kapan theme
    document.documentElement.setAttribute("data-theme", "kapan");
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  }, []);
  return null;
};
