"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";

const themes = ["light", "synthwave", "emerald", "dark", "retro", "forest", "valentine"];

export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [lightTheme, setLightTheme] = useState("light");
  const [darkTheme, setDarkTheme] = useState("synthwave");

  useEffect(() => {
    const storedLight = localStorage.getItem("lightTheme") ?? "light";
    const storedDark = localStorage.getItem("darkTheme") ?? "synthwave";
    const storedTheme = localStorage.getItem("theme");
    setLightTheme(storedLight);
    setDarkTheme(storedDark);
    setTheme(storedTheme ?? storedLight);
    setMounted(true);
  }, [setTheme]);

  if (!mounted) return null;

  const isDark = theme === darkTheme;

  const toggleTheme = () => {
    const next = isDark ? lightTheme : darkTheme;
    setTheme(next);
    localStorage.setItem("theme", next);
  };

  const handleLightChange = (value: string) => {
    setLightTheme(value);
    localStorage.setItem("lightTheme", value);
    if (!isDark) {
      setTheme(value);
      localStorage.setItem("theme", value);
    }
  };

  const handleDarkChange = (value: string) => {
    setDarkTheme(value);
    localStorage.setItem("darkTheme", value);
    if (isDark) {
      setTheme(value);
      localStorage.setItem("theme", value);
    }
  };

  return (
    <div className={`flex items-center ${className ?? ""}`}>
      <div className="flex items-center space-x-1">
        <input
          id="theme-toggle"
          type="checkbox"
          className="toggle toggle-primary bg-primary hover:bg-primary border-primary"
          onChange={toggleTheme}
          checked={isDark}
        />
        <label
          htmlFor="theme-toggle"
          className={`swap swap-rotate ${!isDark ? "swap-active" : ""}`}
        >
          <SunIcon className="swap-on h-5 w-5" />
          <MoonIcon className="swap-off h-5 w-5" />
        </label>
      </div>
      <div className="dropdown dropdown-end ml-1">
        <label tabIndex={0} className="btn btn-ghost btn-circle btn-xs">
          <Cog6ToothIcon className="h-4 w-4" />
        </label>
        <div
          tabIndex={0}
          className="dropdown-content z-[1] p-2 shadow bg-base-200 rounded-box w-44"
        >
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
    </div>
  );
};

