import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { domains } from "@/lib/domains";

const VISIBLE_TOOLS = 12;

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** smoothstep — keeps the growth buttery instead of linear/jumpy */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Scroll-driven pillars.
 * The three "lll" strokes of the logo drop out of the mark, travel down the
 * viewport, widen and grow into three tool pillars as the page is scrolled.
 * All animated values are written imperatively so SSR markup stays static.
 */
export function PillarsScroll() {
  const trackRef = useRef<HTMLDivElement>(null);
  const pillarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let frame = 0;

    const render = () => {
      frame = 0;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = clamp(total > 0 ? -rect.top / total : 0);
      const vh = window.innerHeight;

      pillarRefs.current.forEach((el, i) => {
        if (!el) return;
        const local = ease(clamp((p - i * 0.08) / 0.62));
        el.style.height = `min(${lerp(56, 640, local)}px, 80vh)`;
        el.style.maxWidth = `${lerp(14, 420, local)}px`;
        el.style.transform = `translate3d(0, ${lerp(-vh * 0.34, 0, local)}px, 0)`;
        el.style.opacity = String(0.35 + 0.65 * local);
        el.style.borderRadius = `${lerp(999, 32, local)}px ${lerp(999, 32, local)}px 0 0`;

        const content = contentRefs.current[i];
        if (content) {
          const inn = ease(clamp((p - 0.62 - i * 0.05) / 0.3));
          content.style.opacity = String(inn);
          content.style.transform = `translateY(${lerp(18, 0, inn)}px)`;
          content.style.pointerEvents = inn > 0.6 ? "auto" : "none";
        }
      });
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    render();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section ref={trackRef} className="relative h-[360vh]">
      <div className="sticky top-0 flex h-screen items-end justify-center overflow-hidden px-4 pb-8 sm:px-8">
        <div className="flex w-full max-w-6xl items-end justify-center gap-3 sm:gap-6">
          {domains.map((d, i) => {
            const tools = d.tools.slice(0, VISIBLE_TOOLS);
            return (
              <div
                key={d.id}
                ref={(el) => {
                  pillarRefs.current[i] = el;
                }}
                className="pillar-surface relative flex h-14 max-h-[80vh] max-w-[14px] flex-1 flex-col overflow-hidden rounded-full opacity-35 will-change-transform"
              >
                <div
                  ref={(el) => {
                    contentRefs.current[i] = el;
                  }}
                  className="pointer-events-none flex h-full flex-col p-5 opacity-0"
                >
                  <div className="flex items-center gap-2">
                    <d.icon className="h-4 w-4 shrink-0 text-primary" />
                    <h2 className="font-display text-lg tracking-tight text-foreground sm:text-2xl">
                      {d.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-[11px] tracking-[0.18em] text-muted-foreground">
                    {d.tagline.toUpperCase()} · {d.tools.length}
                  </p>

                  <ul className="mt-4 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                    {tools.map((t) => (
                      <li key={t.name}>
                        <Link
                          to="/studio"
                          search={{ tool: t.name }}
                          className="block truncate rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-all duration-200 hover:text-primary hover:[text-shadow:0_0_14px_var(--primary)]"
                        >
                          {t.name}
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {d.tools.length > VISIBLE_TOOLS ? (
                    <Link
                      to="/studio"
                      search={{ picker: true }}
                      className="btn-shine mt-4 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow hover:-translate-y-0.5"
                    >
                      <span>More tools</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
