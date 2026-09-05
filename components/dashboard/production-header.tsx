import { UserButton } from "@clerk/nextjs";

import type { DashboardSnapshot } from "@/components/dashboard/types";

export function ProductionHeader({
  snapshot,
  authConfigured,
  syncState,
  theme,
  onToggleTheme,
}: {
  snapshot: DashboardSnapshot;
  authConfigured: boolean;
  syncState: "loading" | "ready" | "error";
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header className="production-header">
      <div className="production-identity">
        <p className="overline">Production control / New Mexico</p>
        <div className="production-title-row">
          <h1>{snapshot.currentPlan.production.title}</h1>
          <span className="plan-version">Plan v{snapshot.planVersion}</span>
        </div>
        <p className="logline">{snapshot.currentPlan.production.logline}</p>
      </div>

      <div className="header-status">
        <div className="header-tools">
          <button
            className="theme-toggle"
            type="button"
            onClick={onToggleTheme}
            aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
            aria-pressed={theme === "dark"}
          >
            <span aria-hidden="true">{theme === "light" ? "☼" : "◐"}</span>
            <span>{theme === "light" ? "Light" : "Dark"}</span>
          </button>
          <div className="trust-signal">
            <span className="status-dot" aria-hidden="true" />
            <span>
              {syncState === "ready"
                ? "Browser workspace synced"
                : syncState === "error"
                  ? "Showing verified baseline"
                  : "Syncing browser workspace"}
            </span>
          </div>
        </div>
        <div className="session-control">
          <span className="session-label">
            {authConfigured ? "Judge access" : "Local preview"}
          </span>
          {authConfigured ? <UserButton /> : <span className="preview-avatar">AP</span>}
        </div>
      </div>
    </header>
  );
}
