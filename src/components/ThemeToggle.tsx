import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={
        compact
          ? "flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          : "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-accent"
      }
    >
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {compact ? <span>{mounted && isDark ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}
