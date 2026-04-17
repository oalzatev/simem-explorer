import { Link, useLocation } from "wouter";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Zap, BarChart3, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

function LogoIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="w-8 h-8"
      aria-label="SIMEM Explorer"
    >
      {/* Lightning bolt */}
      <path
        d="M18 2L8 18h6l-2 12 12-16h-6l2-12z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Small chart bars */}
      <rect x="22" y="22" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.5" />
      <rect x="26" y="18" width="3" height="12" rx="0.5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const isExplorer = location === "/" || location === "";
  const isPresets = location === "/presets";

  return (
    <aside
      className="flex flex-col w-[220px] min-h-screen border-r border-border bg-sidebar text-sidebar-foreground shrink-0"
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <span className="text-primary">
          <LogoIcon />
        </span>
        <div>
          <span className="text-sm font-semibold tracking-tight" data-testid="logo-text">SIMEM</span>
          <span className="text-xs text-muted-foreground ml-1">Explorer</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-2 mb-2">
          Navegación
        </p>
        <Link href="/">
          <button
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isExplorer
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            data-testid="nav-explorer"
          >
            <BarChart3 className="w-4 h-4" />
            Explorar
          </button>
        </Link>
        <Link href="/presets">
          <button
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isPresets
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            data-testid="nav-presets"
          >
            <BookmarkCheck className="w-4 h-4" />
            Presets
          </button>
        </Link>
      </nav>

      {/* Theme toggle */}
      <div className="px-3 py-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start gap-2 text-muted-foreground"
          data-testid="toggle-theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </Button>
      </div>
    </aside>
  );
}
