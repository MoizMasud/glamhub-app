import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import type { MyProfile } from "../lib/profile";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;

  profile: MyProfile | null;
  profileLoading: boolean;
  refreshProfile: () => Promise<MyProfile | null>;

  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const refreshProfile = async (): Promise<MyProfile | null> => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      return null;
    }

    try {
      setProfileLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,role,username,bio,city,avatar_url")
        .eq("id", uid)
        .single();

      if (error) throw error;

      const p = data as MyProfile;
      setProfile(p);
      return p;
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const s = data.session ?? null;
      setSession(s);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ✅ keep profile in sync with session changes
  useEffect(() => {
    // signed out
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }

    // signed in / session restored
    refreshProfile().catch(() => {
      // don't crash app if profile fetch fails
      setProfile(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const value = useMemo<AuthState>(() => {
    return {
      session,
      user: session?.user ?? null,
      loading,

      profile,
      profileLoading,
      refreshProfile,

      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        // clear local state
        setProfile(null);
        setSession(null);
      },
    };
  }, [session, loading, profile, profileLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
