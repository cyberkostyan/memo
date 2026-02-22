import { AnimatePresence, motion } from "motion/react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useOnline } from "../contexts/OnlineContext";

export function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing } = useOnline();

  // Show banner when offline or actively syncing
  const showBanner = !isOnline || isSyncing;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div
            className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium ${
              isSyncing
                ? "bg-indigo-500/20 text-indigo-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {isSyncing ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <WifiOff size={14} />
                <span>
                  Offline{pendingCount > 0 && ` — ${pendingCount} change${pendingCount > 1 ? "s" : ""} pending sync`}
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
