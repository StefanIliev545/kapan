"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const lightTheme =
    typeof window !== "undefined"
      ? localStorage.getItem("lightTheme") ?? "light"
      : "light";
  const darkTheme =
    typeof window !== "undefined"
      ? localStorage.getItem("darkTheme") ?? "synthwave"
      : "synthwave";
  const isDark = theme === darkTheme;

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

