// AuthButton: minimum viable Google sign-in / sign-out UI.
//
// Renders one of three states:
//   - loading: small spinner
//   - unauthenticated: "Sign in with Google" button (SVG Google "G" mark).
//   - authenticated: avatar + name + Sign out menu.
//
// Click sign-in -> window navigates to /api/auth/login (Pages Function 302s
// to Google). Click sign-out -> navigates to /api/auth/logout (clears cookie).

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

const GoogleMark: React.FC = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 48 48"
    className="w-5 h-5"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);

const AuthButton: React.FC = () => {
  const { user, status, error, signIn, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  if (status === "loading") {
    return (
      <div
        className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400"
        role="status"
        aria-live="polite"
      >
        <svg
          aria-hidden="true"
          className="animate-spin h-4 w-4 mr-2"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="sr-only">Loading sign-in status</span>
      </div>
    );
  }

  if (status === "unauthenticated" || !user) {
    return (
      <div className="flex flex-col items-end">
        <button
          type="button"
          onClick={() => signIn()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
          aria-label="Sign in with Google"
        >
          <GoogleMark />
          <span>Sign in with Google</span>
        </button>
        {error && (
          <span className="mt-1 text-xs text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>
    );
  }

  // Authenticated: avatar + name, click to open menu.
  const initial = user.name?.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt=""
            className="w-7 h-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="w-7 h-7 rounded-full bg-brand-blue text-white text-sm font-semibold flex items-center justify-center"
            aria-hidden="true"
          >
            {initial}
          </span>
        )}
        <span className="hidden sm:inline text-sm font-medium text-gray-800 dark:text-gray-200 max-w-[12ch] truncate">
          {user.name}
        </span>
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
        >
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {user.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              signOut();
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default AuthButton;
