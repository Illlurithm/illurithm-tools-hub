import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import logo from "@/assets/idoelll-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Log in — ıðœlll Studio" },
      {
        name: "description",
        content:
          "Log in to your ıðœlll account to access 51 bright, browser-based video, audio, PDF and converter tools.",
      },
      { property: "og:title", content: "Log in — ıðœlll Studio" },
      {
        property: "og:description",
        content: "Log in to ıðœlll Studio and unlock 51 creative utility tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/studio", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        if (/invalid login credentials/i.test(err.message)) {
          throw new Error("Incorrect email or password.");
        }
        throw err;
      }
      navigate({ to: "/studio", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/studio", replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background bg-aurora px-5 py-16">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8">
        <Link to="/" className="logo-mark mx-auto flex w-fit justify-center">
          <img src={logo.url} alt="ıðœlll logo" className="h-20 w-auto object-contain" />
        </Link>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Log in to continue to your studio.
        </p>

        <button
          onClick={handleGoogle}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary px-5 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] tracking-[0.3em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
        </div>


        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="glow-hover w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow hover:-translate-y-0.5 disabled:opacity-60"
          >

            {busy ? "Please wait…" : "Log in"}
          </button>
        </form>



      </div>
    </div>
  );
}
