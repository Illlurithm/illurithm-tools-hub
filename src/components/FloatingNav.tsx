import { useState } from "react";
import { ChevronDown, LogOut, Menu, User as UserIcon, X } from "lucide-react";

import { Link, useNavigate } from "@tanstack/react-router";
import logo from "@/assets/idoelll-logo.png.asset.json";
import { sections } from "@/lib/tools-data";
import { useProfile } from "@/hooks/useProfile";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";

function AuthArea({ compact = false }: { compact?: boolean }) {
  const { user, username, avatarUrl, loading } = useProfile();

  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) return <div className="h-9 w-9 shrink-0 rounded-full bg-secondary" />;

  if (!user) {
    return (
      <div className={`flex shrink-0 items-center gap-2 ${compact ? "w-full" : ""}`}>
        <Link
          to="/auth"
          className={`rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow glow-hover hover:-translate-y-0.5 ${
            compact ? "flex-1 text-center" : ""
          }`}
        >
          Log in
        </Link>
      </div>
    );
  }

  const initial = (username ?? user.email ?? "U").charAt(0).toUpperCase();


  return (
    <div className={`relative shrink-0 ${compact ? "w-full" : ""}`}>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={menuOpen}
        className={`grid h-9 place-items-center overflow-hidden rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-glow ${
          compact ? "w-full" : "w-9"
        }`}
      >
        {compact ? (
          <span className="truncate px-3 text-xs">{username ?? user.email}</span>
        ) : avatarUrl ? (
          <img src={avatarUrl} alt="Your profile" className="h-full w-full object-cover" />

        ) : (
          initial
        )}
      </button>
      {menuOpen ? (
        <div
          className={`z-50 mt-2 rounded-2xl border border-border bg-card p-2 shadow-glow ${
            compact ? "w-full" : "absolute right-0 w-56"
          }`}
        >
          {!compact ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5" />
              <span className="truncate">{username ?? user.email}</span>
            </p>
          ) : null}
          <Link
            to="/profile"
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <UserIcon className="h-4 w-4" /> Profile
          </Link>
          <button
            onClick={async () => {
              setMenuOpen(false);
              await supabase.auth.signOut();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}


const toolLinkClass =
  "block w-full break-words rounded-md px-1.5 py-1 text-left text-[13px] leading-snug text-muted-foreground transition-all duration-200 hover:text-primary hover:[text-shadow:0_0_14px_var(--primary)]";


function ToolLink({ name, onClick }: { name: string; onClick?: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        navigate({ to: "/studio", search: { tool: name } });
      }}
      className={toolLinkClass}
    >
      {name}
    </button>
  );
}

export function FloatingNav() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);

  return (
    <div className="fixed inset-x-0 top-4 z-50 px-3 sm:px-4" onMouseLeave={() => setOpen(null)}>
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <a href="/" className="logo-mark flex shrink-0 items-center">
          <img
            src={logo.url}
            alt="ıðœlll logo"
            className="h-14 w-auto object-contain sm:h-20"
          />
        </a>
      <nav className="glass grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-full px-3 py-2 sm:gap-4 sm:px-5">



        {/* Desktop section links */}
        <div className="hidden min-w-0 items-center justify-center gap-1 lg:flex">
          {sections.map((s) => (
            <div key={s.id} onMouseEnter={() => setOpen(s.id)} className="min-w-0">
              <button
                className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-2 text-[11px] font-semibold tracking-[0.12em] transition-colors ${
                  open === s.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setOpen(open === s.id ? null : s.id)}
              >
                {s.label}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${open === s.id ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="lg:hidden" />

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <AuthArea />

          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
            className="grid h-10 w-10 place-items-center rounded-full text-foreground transition-colors hover:bg-accent lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      </div>



      {/* Desktop dropdowns */}
      {sections.map((s) =>
        open === s.id ? (
          <div
            key={s.id}
            onMouseEnter={() => setOpen(s.id)}
            className={`mt-2 hidden animate-in fade-in slide-in-from-top-2 duration-200 lg:block ${
              s.groups ? "w-full" : "mx-auto max-w-5xl"
            }`}
          >
            <div className="max-h-[75vh] overflow-y-auto rounded-3xl border border-border bg-card/95 p-5 shadow-glow backdrop-blur-xl">
              <p className="px-1 pb-3 text-[10px] tracking-[0.3em] text-muted-foreground">
                {s.label} · {s.total} TOOLS
              </p>
              {s.groups ? (
                <div className="grid grid-cols-2 items-start gap-x-8 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
                  {s.groups.map((g) => (
                    <div key={g.label} className="min-w-0">
                      <p className="mb-2 text-[10px] font-semibold leading-tight tracking-[0.18em] text-foreground">
                        {g.label.toUpperCase()} · {g.tools.length}
                      </p>
                      <ul className="space-y-0.5">
                        {g.tools.map((t) => (
                          <li key={t.name}>
                            <ToolLink name={t.name} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
                  {s.tools.map((t) => (
                    <ToolLink key={t.name} name={t.name} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null,
      )}

      {/* Mobile / tablet panel */}
      {mobileOpen ? (
        <div className="mx-auto mt-2 max-h-[75dvh] max-w-5xl overflow-y-auto rounded-3xl border border-border bg-card/97 p-3 shadow-glow backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 lg:hidden">
          {sections.map((s) => {
            const expanded = mobileSection === s.id;
            return (
              <div key={s.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setMobileSection(expanded ? null : s.id)}
                  className="flex min-h-11 w-full items-center gap-2.5 px-2 py-3 text-left"
                >
                  <s.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[0.12em] text-foreground">
                    {s.label}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {expanded ? (
                  <div className="pb-3">
                    {s.groups ? (
                      s.groups.map((g) => (
                        <div key={g.label} className="mb-3">
                          <p className="px-1.5 pb-1 text-[10px] font-semibold tracking-[0.18em] text-foreground">
                            {g.label.toUpperCase()}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2">
                            {g.tools.map((t) => (
                              <ToolLink
                                key={t.name}
                                name={t.name}
                                onClick={() => setMobileOpen(false)}
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2">
                        {s.tools.map((t) => (
                          <ToolLink
                            key={t.name}
                            name={t.name}
                            onClick={() => setMobileOpen(false)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

