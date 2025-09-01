"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const lightTheme =
    typeof window !== "undefined"
      ? localStorage.getItem("lightTheme") ?? "light"
      : "light";
  const darkTheme =
    typeof window !== "undefined"
      ? localStorage.getItem("darkTheme") ?? "synthwave"
      : "synthwave";

  useEffect(() => {
    if (mounted && theme === "system" && resolvedTheme) {
      const preferred = resolvedTheme === "dark" ? darkTheme : lightTheme;
      setTheme(preferred);
      localStorage.setItem("theme", preferred);
    }
  }, [mounted, theme, resolvedTheme, darkTheme, lightTheme, setTheme]);

  if (!mounted) return null;

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = currentTheme === darkTheme;

  const toggleTheme = () => {
    const next = isDark ? lightTheme : darkTheme;
    setTheme(next);
    localStorage.setItem("theme", next);
  };

  return (
    <button
      aria-label="Toggle theme"
      onClick={toggleTheme}
      className={`btn btn-ghost btn-circle ${className ?? ""}`}
    >
      {isDark ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
    </button>
  );
};

