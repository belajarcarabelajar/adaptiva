import React from "react";
import { useAuth } from "../hooks/useAuth";

export const PointsBadge: React.FC = () => {
  const { user, status } = useAuth();

  if (status !== "authenticated" || !user) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-semibold shadow-xs transition-all"
      title="Saldo Poin Anda"
    >
      <svg
        className="w-4 h-4 text-amber-500 animate-pulse"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.57l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.57l7-10a1 1 0 011.12-.384z"
          clipRule="evenodd"
        />
      </svg>
      <span>{user.points ?? 100} Poin</span>
    </div>
  );
};

export default PointsBadge;
