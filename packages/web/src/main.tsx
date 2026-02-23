import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { OnlineProvider } from "./contexts/OnlineContext";
import { App } from "./App";
import "./index.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OnlineProvider>
          <App />
        </OnlineProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
