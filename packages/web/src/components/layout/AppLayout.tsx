import { useState, type ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { Sidebar } from "./Sidebar";
import { AiFab } from "./AiFab";
import { OfflineBanner } from "../OfflineBanner";

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <main className="flex-1 pt-14">
        <OfflineBanner />
        {children}
      </main>
      <AiFab />
    </div>
  );
}
