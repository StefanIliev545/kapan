"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const themes = ["light", "synthwave", "emerald", "dark", "retro", "forest", "valentine"];

export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <select
      className={`select select-bordered select-sm h-8 ${className ?? ""}`}
      value={theme}
      onChange={e => setTheme(e.target.value)}
    >
      {themes.map(t => (
        <option key={t} value={t}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </option>
      ))}
    </select>
  );
};
