import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Lock } from "lucide-react";
import { setEncryptionExpiredCallback } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function EncryptionExpiredBanner() {
  const [expired, setExpired] = useState(false);
  const { logout } = useAuth();

  useEffect(() => {
    setEncryptionExpiredCallback(() => setExpired(true));
  }, []);

  return (
    <AnimatePresence>
      {expired && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-rose-500/20 text-rose-300">
            <Lock size={14} />
            <span>Encryption session expired</span>
            <button
              onClick={logout}
              className="ml-1 underline underline-offset-2 hover:text-white transition-colors"
            >
              Sign in again
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
