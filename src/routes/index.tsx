import { useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ArrowRight, ShieldCheck, Zap, Infinity as InfinityIcon } from "lucide-react";
import { FloatingNav } from "@/components/FloatingNav";
import { PillarsScroll } from "@/components/PillarsScroll";
import { allTools } from "@/lib/tools-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ıðœlll — Premium Video, Audio, PDF & Converter Tools" },
      {
        name: "description",
        content:
          "ıðœlll is a premium suite of 50+ browser-based utility tools for video editing, audio, PDF and file conversion. Fast, private, no installs.",
      },
      { property: "og:title", content: "ıðœlll — Premium Utility & Productivity Tools" },
      {
        property: "og:description",
        content:
          "Edit video, trim audio, convert PDFs and files in one refined workspace. 50+ tools, zero installs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const featureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cards = Array.from(featureRef.current?.children ?? []) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = cards.indexOf(e.target as HTMLElement);
            (e.target as HTMLElement).style.transitionDelay = `${i * 140}ms`;
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.35 },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-background bg-aurora">
      <FloatingNav />

      <main className="mx-auto max-w-6xl px-5 pb-28 pt-40">
        <section className="glass-panel rounded-[2.5rem] px-6 py-14 text-center sm:px-12">
          <span className="badge-shine inline-flex items-center gap-2 rounded-full border border-white/50 px-4 py-1.5 text-[10px] font-semibold tracking-[0.3em] text-foreground shadow-sm">
            <span className="relative z-10">{allTools.length} TOOLS · ONE STUDIO</span>
          </span>

          <h1 className="mt-7 font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-7xl">
            Everything you need,
            <span className="block text-gradient">nothing you don't.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground">
            A bright, playful utility studio for video, audio, documents and conversion —
            refined, fast, and running entirely in your browser.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3">
            <Link
              to="/studio"
              className="btn-shine inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow hover:-translate-y-0.5"
            >
              <span>Explore Studio</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div ref={featureRef} className="mt-16 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Zap, title: "Instant", desc: "No uploads, no waiting queues." },
              { icon: ShieldCheck, title: "Private", desc: "Your files never leave you." },
              { icon: InfinityIcon, title: "Unlimited", desc: "Every tool, always free." },
            ].map((f) => (
              <div
                key={f.title}
                className="glass glow-hover reveal-card rounded-3xl p-6 text-left"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary/70 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-display text-base tracking-wide text-foreground">
                  {f.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <PillarsScroll />

      <footer className="border-t border-border py-8 text-center text-xs tracking-[0.2em] text-muted-foreground">
        ıðœlll © 2026
      </footer>


    </div>
  );
}

