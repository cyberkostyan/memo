import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useConsent } from "../hooks/useConsent";
import { usePrivacy } from "../hooks/usePrivacy";
import { ApiError } from "../api/client";

export function PrivacySettingsPage() {
  const {
    consents,
    loading: consentsLoading,
    fetchConsents,
    updateConsent,
  } = useConsent();
  const {
    deletionRequest,
    loading: privacyLoading,
    exportData,
    requestDeletion,
    cancelDeletion,
    fetchDeletionStatus,
  } = usePrivacy();

  const [exporting, setExporting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchConsents();
    fetchDeletionStatus();
  }, [fetchConsents, fetchDeletionStatus]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportData();
      toast.success("Data exported successfully");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Export failed",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleToggleConsent = async (type: string, granted: boolean) => {
    try {
      await updateConsent(type, granted);
      toast.success(`Consent ${granted ? "granted" : "withdrawn"}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update consent",
      );
    }
  };

  const handleDeleteRequest = async (e: FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await requestDeletion(deletePassword, deleteReason || undefined);
      setShowDeleteDialog(false);
      setDeletePassword("");
      setDeleteReason("");
      toast.success("Account deletion scheduled");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to request deletion",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    try {
      await cancelDeletion();
      toast.success("Deletion cancelled");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to cancel",
      );
    }
  };

  const getConsentGranted = (type: string) =>
    consents.find((c) => c.type === type)?.granted ?? false;

  const loading = consentsLoading || privacyLoading;

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-20">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-20">
      <Link
        to="/profile"
        className="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block"
      >
        &larr; Back to Profile
      </Link>
      <h1 className="text-xl font-bold mb-6">Privacy & Data</h1>

      {/* Consent Management */}
      <section className="max-w-sm mb-8">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Consent Management
        </h2>

        <div className="space-y-3">
          <ConsentToggle
            label="Health Data Processing"
            description="Required to use the app. Processing of your health and wellness data."
            checked={getConsentGranted("health_data_processing")}
            disabled
          />
          <ConsentToggle
            label="Marketing Communications"
            description="Receive updates and tips about health tracking."
            checked={getConsentGranted("marketing")}
            onChange={(v) => handleToggleConsent("marketing", v)}
          />
          <ConsentToggle
            label="Analytics"
            description="Help improve the app with anonymous usage data."
            checked={getConsentGranted("analytics")}
            onChange={(v) => handleToggleConsent("analytics", v)}
          />
          <ConsentToggle
            label="Do Not Sell My Data (CCPA)"
            description="Opt out of any future sale of personal information."
            checked={getConsentGranted("ccpa_do_not_sell")}
            onChange={(v) => handleToggleConsent("ccpa_do_not_sell", v)}
          />
        </div>
      </section>

      {/* Data Export */}
      <section className="max-w-sm mb-8 pt-6 border-t border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Export Your Data
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Download all your data in JSON format (GDPR Article 20).
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
        >
          {exporting ? "Exporting..." : "Export My Data"}
        </button>
      </section>

      {/* Account Deletion */}
      <section className="max-w-sm mb-8 pt-6 border-t border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Delete Account
        </h2>

        {deletionRequest ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-400 mb-2">
              Account deletion scheduled for{" "}
              <strong>
                {new Date(deletionRequest.scheduledAt).toLocaleDateString()}
              </strong>
            </p>
            <p className="text-xs text-slate-500 mb-3">
              Your data will be permanently deleted on this date. You can
              cancel anytime before then.
            </p>
            <button
              onClick={handleCancelDeletion}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg py-2 transition-colors text-sm"
            >
              Cancel Deletion
            </button>
          </div>
        ) : showDeleteDialog ? (
          <form
            onSubmit={handleDeleteRequest}
            className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3"
          >
            <p className="text-xs text-slate-400">
              Your account and all data will be permanently deleted after a
              30-day grace period. Enter your password to confirm.
            </p>
            <input
              type="password"
              placeholder="Current password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm"
            />
            <input
              type="text"
              placeholder="Reason (optional)"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm transition-colors"
              >
                {deleting ? "Requesting..." : "Delete Account"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">
              Permanently delete your account and all associated data.
            </p>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-lg py-3 transition-colors border border-red-500/30"
            >
              Request Account Deletion
            </button>
          </>
        )}
      </section>

      {/* Legal Links */}
      <section className="max-w-sm pt-6 border-t border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Legal
        </h2>
        <div className="space-y-2">
          <Link
            to="/privacy-policy"
            className="block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Privacy Policy
          </Link>
          <Link
            to="/cookie-policy"
            className="block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Cookie Policy
          </Link>
        </div>
      </section>
    </div>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          checked ? "bg-indigo-600" : "bg-slate-700"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
