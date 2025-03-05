"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";

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

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
};
