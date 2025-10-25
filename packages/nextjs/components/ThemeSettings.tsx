"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

const themes = ["light", "synthwave", "emerald", "dark", "retro", "forest", "valentine"];

export const ThemeSettings = ({ className }: { className?: string }) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [lightTheme, setLightTheme] = useState("light");
  const [darkTheme, setDarkTheme] = useState("dark");

  useEffect(() => {
    const storedLight = localStorage.getItem("lightTheme") ?? "light";
    const storedDark = localStorage.getItem("darkTheme") ?? "dark";
    setLightTheme(storedLight);
    setDarkTheme(storedDark);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleLightChange = (value: string) => {
    setLightTheme(value);
    localStorage.setItem("lightTheme", value);
    if (theme === lightTheme) {
      setTheme(value);
      localStorage.setItem("theme", value);
    }
  };

  const handleDarkChange = (value: string) => {
    setDarkTheme(value);
    localStorage.setItem("darkTheme", value);
    if (theme === darkTheme) {
      setTheme(value);
      localStorage.setItem("theme", value);
    }
  };

  return (
    <div className={`dropdown dropdown-end ${className ?? ""}`}>
      <label tabIndex={0} className="btn btn-ghost btn-circle btn-xs">
        <Cog6ToothIcon className="h-4 w-4" />
      </label>
      <div tabIndex={0} className="dropdown-content z-[1] p-2 shadow bg-base-200 rounded-box w-44">
        <div className="form-control mb-2">
          <label className="label">
            <span className="label-text">Light theme</span>
          </label>
          <select
            className="select select-bordered select-xs"
            value={lightTheme}
            onChange={e => handleLightChange(e.target.value)}
          >
            {themes.map(t => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-control">
          <label className="label">
            <span className="label-text">Dark theme</span>
          </label>
          <select
            className="select select-bordered select-xs"
            value={darkTheme}
            onChange={e => handleDarkChange(e.target.value)}
          >
            {themes.map(t => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

