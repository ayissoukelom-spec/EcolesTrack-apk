import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 rounded-2xl border theme-border theme-card px-3 py-2 text-sm font-semibold theme-text shadow-sm transition hover:brightness-110"
      aria-label={`Basculer en mode ${theme === "dark" ? "clair" : "sombre"}`}
      title={`Basculer en mode ${theme === "dark" ? "clair" : "sombre"}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{theme === "dark" ? "☀️ Mode clair" : "🌙 Mode sombre"}</span>
    </button>
  );
}
