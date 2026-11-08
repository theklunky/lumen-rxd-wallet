import { SunIcon, Spinner } from "../components/ui";

export function LoadingSplash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">
      <div className="text-accent">
        <SunIcon size={40} />
      </div>
      <div className="flex items-center gap-2 text-[13px]">
        <Spinner />
        Starting Radiant Wallet…
      </div>
    </div>
  );
}
