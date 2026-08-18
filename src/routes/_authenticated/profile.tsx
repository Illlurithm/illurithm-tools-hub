import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FloatingNav } from "@/components/FloatingNav";
import ProfileCard from "@/components/ProfileCard";
import { resolveAvatarUrl, useProfile } from "@/hooks/useProfile";


export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — ıðœlll Studio" },
      {
        name: "description",
        content:
          "Manage your ıðœlll Studio profile: change your username, update your password and pick or upload an avatar.",
      },
      { property: "og:title", content: "Your Profile — ıðœlll Studio" },
      {
        property: "og:description",
        content: "Update your username, password and avatar in ıðœlll Studio.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, username, tagline, avatarUrl, loading, reload } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (username) setName(username);
    setRole(tagline ?? "");
    setUploadPreview(avatarUrl);
  }, [username, tagline, avatarUrl]);


  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Image must be smaller than 5MB.");
      return;
    }
    setErr(null);
    setPendingFile(file);
    setUploadPreview(URL.createObjectURL(file));

  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const data = {
      title: "ıðœlll Studio",
      text: `Check out ıðœlll Studio — 51 tools, one studio.`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      setErr(null);
      setMsg("Link copied to clipboard.");
    } catch {
      /* user cancelled share */
    }
  }


  async function save() {
    if (!user) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const clean = name.trim();
      if (clean.length < 1) {
        throw new Error("Please enter a username.");
      }


      let avatar: string | null = null;
      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() ?? "png";
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, pendingFile, { upsert: true });
        if (upErr) throw upErr;
        avatar = path;
      }

      const update: {
        id: string;
        username: string;
        tagline: string | null;
        avatar_url?: string;
      } = { id: user.id, username: clean, tagline: role.trim() || null };
      if (avatar) update.avatar_url = avatar;

      const { error: pErr } = await supabase.from("profiles").upsert(update);
      if (pErr) throw pErr;

      if (password) {
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        const { error: passErr } = await supabase.auth.updateUser({ password });
        if (passErr) throw passErr;
        setPassword("");
      }

      setPendingFile(null);
      if (avatar) setUploadPreview(await resolveAvatarUrl(avatar));

      await reload();
      setMsg("Profile saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-background">
      <FloatingNav />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:pt-32">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Your profile
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Update your details and choose how you show up across the Studio.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Left: settings */}
          <section className="rounded-3xl border border-border bg-card p-6 shadow-glow">
            <h2 className="text-sm font-semibold tracking-[0.18em] text-muted-foreground">
              ACCOUNT
            </h2>

            <label className="mt-6 block text-sm font-medium text-foreground" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              placeholder="yourname"
            />

            <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Leave blank to keep current password"
            />

            <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="role">
              What are you?
            </label>
            <input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={60}
              className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Designer, student, creator…"
            />

            <p className="mt-5 text-xs text-muted-foreground">Signed in as {user?.email}</p>

            {err ? <p className="mt-4 text-sm text-destructive">{err}</p> : null}
            {msg ? <p className="mt-4 text-sm text-primary">{msg}</p> : null}

            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow glow-hover hover:-translate-y-0.5 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save profile
            </button>
          </section>

          {/* Right: card + avatar tools */}
          <aside className="flex flex-col gap-6">
            <ProfileCard
              name={name || "Your name"}
              title={role.trim() || "ıðœlll Studio member"}
              handle={name || "studio"}
              status="Online"
              contactText="Share"
              onContactClick={share}

              showUserInfo
              enableTilt
              avatarUrl={uploadPreview ?? ""}
              miniAvatarUrl={uploadPreview ?? ""}

              behindGlowColor="rgba(168, 211, 141, 0.6)"
              innerGradient="linear-gradient(145deg,#A8D38D66 0%,#D8FFB144 100%)"
            />

            <div className="rounded-3xl border border-border bg-card p-5 shadow-glow">
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">
                UPLOAD IMAGE
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Camera className="h-4 w-4" />
                {pendingFile ? pendingFile.name : "Choose an image"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
