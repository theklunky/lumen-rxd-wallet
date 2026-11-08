/** Main shell: sidebar navigation + content area for the unlocked wallet. */
import { useState } from "react";
import { useApp, type Tab } from "../state/AppContext";
import {
  BoxIcon,
  ClockIcon,
  ErrorNote,
  GearIcon,
  HomeIcon,
  LockIcon,
  RefreshIcon,
  Spinner,
  SunIcon,
} from "../components/ui";
import { OverviewView } from "./OverviewView";
import { HistoryView } from "./HistoryView";
import { TokensView } from "./TokensView";
import { SettingsView } from "./SettingsView";

const TABS: { id: Tab; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element }[] = [
  { id: "overview", label: "Overview", icon: HomeIcon },
  { id: "history", label: "History", icon: ClockIcon },
  { id: "tokens", label: "Tokens", icon: BoxIcon },
  { id: "settings", label: "Settings", icon: GearIcon },
];

export function MainLayout() {
  const { settings, online, scanning, refresh, lock, error, clearError } = useApp();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-[218px] shrink-0 flex-col border-r border-line bg-panel">
        {/* macOS traffic-light drag strip */}
        <div className="drag-strip flex h-[52px] items-end pb-2">
          <div className="ml-[68px] flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-[#1a1205]">
              <SunIcon size={17} />
            </span>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">Radiant</div>
              <div className="text-[10px] text-faint">RXD wallet</div>
            </div>
          </div>
        </div>

        {/* Network badge */}
        <div className="px-4 pb-3">
          <div
            className={`rounded-lg border px-3 py-1.5 text-center text-[11px] font-semibold tracking-wider ${
              settings.network === "mainnet"
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-good/40 bg-good/10 text-good"
            }`}
          >
            {settings.network === "mainnet" ? "MAINNET" : "TESTNET"}
            {settings.customEndpoint && " · custom"}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                tab === id
                  ? "bg-card2 text-text"
                  : "text-muted hover:bg-card hover:text-text"
              }`}
            >
              <Icon size={17} className={tab === id ? "text-accent" : undefined} />
              {label}
              {id === "tokens" && tab !== "tokens" && (
                <TokenCount />
              )}
            </button>
          ))}
        </nav>

        {/* Footer: status + lock */}
        <div className="space-y-2 border-t border-line p-3">
          <div className="flex items-center gap-2 px-2 text-[12px] text-muted">
            <span
              className={`h-2 w-2 rounded-full ${online ? "bg-good" : "bg-bad"}`}
              title={online ? "Connected" : "Disconnected"}
            />
            {online ? "Connected to server" : "Reconnecting…"}
            {scanning && <Spinner className="ml-auto text-faint" />}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void refresh()}
              title="Refresh"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[12.5px] text-muted hover:bg-card hover:text-text"
            >
              <RefreshIcon size={14} />
              Refresh
            </button>
            <button
              onClick={lock}
              title="Lock wallet"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[12.5px] text-muted hover:bg-card hover:text-text"
            >
              <LockIcon size={14} />
              Lock
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-panel/60 px-6">
          <h1 className="text-[15px] font-semibold">
            {TABS.find((t) => t.id === tab)?.label}
          </h1>
          {scanning && (
            <span className="flex items-center gap-1.5 text-[12px] text-faint">
              <Spinner /> syncing
            </span>
          )}
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4">
              <ErrorNote text={error} onDismiss={clearError} />
            </div>
          )}
          {tab === "overview" && <OverviewView />}
          {tab === "history" && <HistoryView />}
          {tab === "tokens" && <TokensView />}
          {tab === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}

/** Small token-count badge on the Tokens nav item. */
function TokenCount() {
  const { scan } = useApp();
  const n = scan?.tokens.length ?? 0;
  if (n === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
      {n}
    </span>
  );
}
