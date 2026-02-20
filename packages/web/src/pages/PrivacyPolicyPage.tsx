import { Link } from "react-router-dom";

export function PrivacyPolicyPage() {
  return (
    <div className="px-4 pt-6 pb-6 max-w-2xl mx-auto">
      <Link
        to="/profile"
        className="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block"
      >
        &larr; Back
      </Link>
      <h1 className="text-xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none text-slate-300 space-y-4">
        <p className="text-xs text-slate-500">Last updated: February 20, 2026</p>

        <h2 className="text-lg font-semibold text-white mt-6">1. Who We Are</h2>
        <p>
          Memo is a self-hosted health and wellness tracking application. We act as the
          data controller for your personal data under GDPR (EU General Data Protection
          Regulation) and CCPA (California Consumer Privacy Act).
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">2. Data We Collect</h2>
        <p>We collect the following personal data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account data:</strong> email address, name (optional), encrypted password</li>
          <li><strong>Health data (special category):</strong> meal logs, stool tracking,
            mood, symptoms, medications, exercise, water intake, sleep, and notes</li>
          <li><strong>Reminder settings:</strong> notification preferences and schedules</li>
          <li><strong>Technical data:</strong> push notification endpoints, consent records, access logs</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">3. Legal Basis (GDPR Article 6 & 9)</h2>
        <p>
          We process your data based on your <strong>explicit consent</strong> (Article 9(2)(a))
          for health data, and <strong>contract performance</strong> (Article 6(1)(b)) for
          providing the service.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">4. How We Use Your Data</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide the health tracking and journaling service</li>
          <li>Send reminders and notifications you configure</li>
          <li>Generate data exports you request</li>
          <li>Maintain security and prevent unauthorized access</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">5. Data Sharing</h2>
        <p>
          We do <strong>not</strong> sell, rent, or share your personal data with third parties.
          All data is stored on our self-hosted infrastructure. No third-party data processors
          are used.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">6. Data Retention</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Health data:</strong> retained while your account is active</li>
          <li><strong>Audit logs:</strong> 2 years, then automatically deleted</li>
          <li><strong>Consent records:</strong> 5 years after withdrawal (legal requirement)</li>
          <li><strong>Inactive accounts:</strong> notified after 23 months, deleted after 24 months of inactivity</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">7. Your Rights (GDPR)</h2>
        <p>Under GDPR, you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access</strong> (Article 15): Export all your data in JSON format</li>
          <li><strong>Rectification</strong> (Article 16): Edit your profile and events</li>
          <li><strong>Erasure</strong> (Article 17): Request account deletion with 30-day grace period</li>
          <li><strong>Restrict processing</strong> (Article 18): Manage consents individually</li>
          <li><strong>Data portability</strong> (Article 20): Download data in machine-readable JSON</li>
          <li><strong>Withdraw consent</strong> (Article 7): At any time via Privacy Settings</li>
        </ul>
        <p>
          Exercise these rights in <Link to="/settings/privacy" className="text-indigo-400 hover:text-indigo-300">Privacy Settings</Link>.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">8. Your Rights (CCPA)</h2>
        <p>California residents additionally have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Know</strong> what data is collected (this policy)</li>
          <li><strong>Delete</strong> your data (via account deletion)</li>
          <li><strong>Opt-Out</strong> of sale of personal information (we do not sell data)</li>
          <li><strong>Non-Discrimination</strong> for exercising your rights</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">9. Security</h2>
        <p>
          We implement the following security measures: encrypted passwords (bcrypt),
          short-lived access tokens (15 minutes), refresh token rotation, parameterized
          database queries, input validation, rate limiting on sensitive operations,
          and comprehensive audit logging.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">10. Changes to This Policy</h2>
        <p>
          We will notify you of material changes by requesting re-consent through the app.
          Continued use after notification constitutes acceptance.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">11. Contact</h2>
        <p>
          For privacy-related inquiries, contact the data controller at the email
          address provided in your deployment configuration.
        </p>
      </div>
    </div>
  );
}
