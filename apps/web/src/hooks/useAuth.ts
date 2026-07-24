// useAuth: minimal session hook for the SPA.
//
// - On mount, fetches /api/auth/me.
// - Exposes { user, loading, error, signIn, signOut, refresh }.
// - signIn() navigates to /api/auth/login (the Pages Function 302s to Google).
// - signOut() navigates to /api/auth/logout (the Function clears the cookie).
// - Hooks can be safely called multiple times; state is shared via a single
//   module-level in-flight request so concurrent callers don't refetch.

import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface UseAuthResult {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  signIn: (returnTo?: string) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

let inflight: Promise<AuthUser | null> | null = null;
let lastUser: AuthUser | null = null;
const listeners = new Set<(u: AuthUser | null) => void>();

function setUserShared(user: AuthUser | null): void {
  lastUser = user;
  for (const l of listeners) l(user);
}

export function _resetAuthSharedStateForTesting(): void {
  lastUser = null;
  inflight = null;
}

async function fetchMe(): Promise<AuthUser | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const targetUrl =
        typeof window !== "undefined" && window.location?.origin
          ? new URL("/api/auth/me", window.location.origin).toString()
          : "/api/auth/me";
      const r = await fetch(targetUrl, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (r.status === 401) return null;
      if (!r.ok) throw new Error(`me: ${r.status}`);
      const data = (await r.json()) as { user: AuthUser };
      return data.user;
    } catch (e) {
      // Network errors → treat as unauthenticated but surface the error.
      console.error("[useAuth] /api/auth/me failed", e);
      throw e;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(lastUser);
  const [status, setStatus] = useState<AuthStatus>(
    lastUser ? "authenticated" : "loading",
  );
  const [error, setError] = useState<string | null>(null);

  // Subscribe to shared user updates so multiple components stay in sync.
  useEffect(() => {
    const l = (u: AuthUser | null) => setUser(u);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const u = await fetchMe();
      setUserShared(u);
      setStatus(u ? "authenticated" : "unauthenticated");
      if (u) {
        setError(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setError(msg);
      setUserShared(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    // Detect auth_error query parameter from OAuth callback redirects.
    if (typeof window !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("auth_error");
      if (authError) {
        let friendlyMsg = authError;
        if (authError === "domain_not_allowed") {
          friendlyMsg = "Email domain is not allowed for sign-in.";
        } else if (authError === "email_not_verified") {
          friendlyMsg = "Your Google email is not verified.";
        } else if (authError === "access_denied") {
          friendlyMsg = "Sign-in request was cancelled or denied.";
        } else if (authError === "invalid_state") {
          friendlyMsg = "Sign-in session expired. Please try again.";
        } else if (authError === "not_configured") {
          friendlyMsg = "Google Sign-in is not configured on this deployment.";
        }
        setError(friendlyMsg);

        // Remove auth_error from URL clean state without triggering reload
        params.delete("auth_error");
        const newSearch = params.toString();
        const newUrl =
          window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
        window.history.replaceState({}, "", newUrl);
      }
    }

    if (lastUser) {
      // Already loaded by another component; just sync.
      setStatus("authenticated");
      return;
    }
    void refresh();
  }, [refresh]);

  const signIn = useCallback((returnTo?: string) => {
    const next = returnTo && returnTo.startsWith("/") ? returnTo : "/";
    window.location.href = `/api/auth/login?next=${encodeURIComponent(next)}`;
  }, []);

  const signOut = useCallback(() => {
    // Clear shared state immediately so UI doesn't show a flash of the user.
    setUserShared(null);
    window.location.href = "/api/auth/logout";
  }, []);

  return { user, status, error, signIn, signOut, refresh };
}
