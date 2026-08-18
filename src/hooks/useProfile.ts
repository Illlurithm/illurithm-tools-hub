import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export async function resolveAvatarUrl(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(value, 60 * 60);
  return data?.signedUrl ?? null;
}


export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState<string | null>(null);
  const [tagline, setTagline] = useState<string | null>(null);
  const [avatarValue, setAvatarValue] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setUsername(null);
      setTagline(null);
      setAvatarValue(null);
      setAvatarUrl(null);
      setLoading(false);
      return;
    }
    let { data } = await supabase
      .from("profiles")
      .select("username, avatar_url, tagline")
      .eq("id", user.id)
      .maybeSingle();

    if (!data) {
      const fallback =
        (user.user_metadata as { username?: string } | undefined)?.username ??
        user.email?.split("@")[0] ??
        "member";
      const { data: created } = await supabase
        .from("profiles")
        .insert({ id: user.id, username: fallback })
        .select("username, avatar_url, tagline")
        .maybeSingle();
      data = created ?? null;
    }

    setUsername(data?.username ?? null);
    setTagline(data?.tagline ?? null);
    setAvatarValue(data?.avatar_url ?? null);
    setAvatarUrl(await resolveAvatarUrl(data?.avatar_url ?? null));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void load();
  }, [authLoading, load]);

  return { user, username, tagline, avatarValue, avatarUrl, loading: loading || authLoading, reload: load };
}
