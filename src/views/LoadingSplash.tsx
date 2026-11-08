import { RadiantMark, Spinner } from "../components/ui";

export function LoadingSplash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">
      <RadiantMark size={52} />
      <div className="flex items-center gap-2 text-[13px]">
        <Spinner />
        Starting Lumen Wallet…
      </div>
    </div>
  );
}
