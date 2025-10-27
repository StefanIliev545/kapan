"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";
import { Theme } from "@radix-ui/themes";

// Add the force prop to ensure proper client-side rendering
export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  const [mounted, setMounted] = React.useState(false);

  // When mounted on client, now we can render
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // To avoid hydration mismatch, render a simple div until client-side
  if (!mounted) {
    return <div style={{ visibility: "hidden" }}>{children}</div>;
  }

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
