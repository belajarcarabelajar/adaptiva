import React, { useEffect } from "react";

export interface InsufficientPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredPoints: number;
  remainingPoints: number;
  actionName?: string;
}

export const InsufficientPointsModal: React.FC<InsufficientPointsModalProps> = ({
  isOpen,
  onClose,
  requiredPoints,
  remainingPoints,
  actionName = "fitur ini",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="insufficient-points-title"
    >
      <div className="relative w-full max-w-md p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 transform transition-all">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Tutup"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header Icon */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 mb-4 flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full shadow-inner">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h3 id="insufficient-points-title" className="text-xl font-bold text-gray-900 dark:text-white">
            Poin Anda Tidak Cukup
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Untuk menjalankan <span className="font-semibold text-amber-600 dark:text-amber-400">{actionName}</span>, Anda membutuhkan <span className="font-bold">{requiredPoints} Poin</span>.
          </p>
        </div>

        {/* Point Details Box */}
        <div className="mt-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 flex justify-between items-center text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-xs">Sisa Poin Anda</span>
            <span className="font-bold text-amber-800 dark:text-amber-300 text-lg">{remainingPoints} Poin</span>
          </div>
          <div className="text-right">
            <span className="text-gray-500 dark:text-gray-400 block text-xs">Kekurangan</span>
            <span className="font-bold text-red-600 dark:text-red-400 text-lg">
              -{Math.max(0, requiredPoints - remainingPoints)} Poin
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold shadow-md hover:bg-gray-800 dark:hover:bg-white transition-all"
          >
            Saya Mengerti
          </button>
        </div>
      </div>
    </div>
  );
};

export default InsufficientPointsModal;
