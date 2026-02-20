import { Link } from "react-router-dom";

export function CookiePolicyPage() {
  return (
    <div className="px-4 pt-6 pb-6 max-w-2xl mx-auto">
      <Link
        to="/profile"
        className="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block"
      >
        &larr; Back
      </Link>
      <h1 className="text-xl font-bold mb-6">Cookie & Storage Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none text-slate-300 space-y-4">
        <p className="text-xs text-slate-500">Last updated: February 20, 2026</p>

        <h2 className="text-lg font-semibold text-white mt-6">What We Store</h2>
        <p>
          Memo does <strong>not</strong> use tracking cookies, analytics cookies, or
          advertising cookies. We use browser localStorage exclusively for authentication:
        </p>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 text-slate-300">Key</th>
              <th className="text-left py-2 text-slate-300">Purpose</th>
              <th className="text-left py-2 text-slate-300">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800">
              <td className="py-2"><code className="text-indigo-400">accessToken</code></td>
              <td className="py-2">JWT for API authentication</td>
              <td className="py-2">15 minutes</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2"><code className="text-indigo-400">refreshToken</code></td>
              <td className="py-2">Token to obtain new access token</td>
              <td className="py-2">7 days</td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-lg font-semibold text-white mt-6">Third-Party Cookies</h2>
        <p>None. We do not load any third-party scripts or trackers.</p>

        <h2 className="text-lg font-semibold text-white mt-6">How to Clear</h2>
        <p>
          Sign out of Memo to clear all stored tokens. You can also clear them
          manually via your browser developer tools (Application &gt; Local Storage).
        </p>
      </div>
    </div>
  );
}
