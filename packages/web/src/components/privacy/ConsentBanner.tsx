import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const CONSENT_BANNER_KEY = "memo_consent_banner_dismissed";
const CONSENT_BANNER_VERSION = "1.0";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(CONSENT_BANNER_KEY);
    if (dismissed !== CONSENT_BANNER_VERSION) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_BANNER_KEY, CONSENT_BANNER_VERSION);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-2">
      <div className="max-w-sm mx-auto bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-xl">
        <p className="text-sm text-slate-300 mb-3">
          We use localStorage for authentication only. No tracking cookies.
          Your health data is processed with your explicit consent.
        </p>
        <div className="flex gap-2">
          <Link
            to="/privacy-policy"
            className="flex-1 text-center bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg py-2 transition-colors"
          >
            Read Policy
          </Link>
          <button
            onClick={handleAccept}
            className="flex-1 text-white text-sm font-medium rounded-lg py-2 transition-all duration-200 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 0 0 1px rgba(99,102,241,0.3), 0 4px 15px rgba(99,102,241,0.25)',
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
