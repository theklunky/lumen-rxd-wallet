/** Shared UI primitives: buttons, fields, modal, icons, copy-to-clipboard. */
import { useEffect, useState, type ReactNode } from "react";
import radiantMarkUrl from "../assets/radiant-mark.png";

// ---- Icons (inline, 1.7px stroke, currentColor) -----------------------------

type IconProps = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

// Official Radiant "R" brand mark (sky gradient on transparent, from
// radiantcore.org — regenerate with `npm run icons`).
export const RadiantMark = ({ size = 20, className }: IconProps) => (
  <img
    src={radiantMarkUrl}
    width={size}
    height={size}
    className={className}
    alt=""
    aria-hidden
    draggable={false}
  />
);
export const HomeIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M3.5 10.5 12 3.5l8.5 7v9.5a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" />);
export const ClockIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>);
export const BoxIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="m12 2.7 8.5 4.9v8.8L12 21.3l-8.5-4.9V7.6zM12 21.3V12.4M3.5 7.6 12 12.4m-8.5-4.8 8.5 4.8m8.5-4.8L12 12.4" />);
export const GearIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.35.95a7 7 0 0 0-2.42-1.4L13.7 2.7h-3.4l-.4 2.44a7 7 0 0 0-2.41 1.4l-2.35-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.41 1.4l.4 2.44h3.4l.4-2.44a7 7 0 0 0 2.41-1.4l2.35.95 2-3.46-2-1.55A7 7 0 0 0 19 12z" /></>);
export const LockIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const RefreshIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" />);
export const CopyIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>);
export const CheckIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <path d="m4 12.5 5 5L20 6.5" />);
export const PlusIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M12 5v14M5 12h14" />);
export const SendIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M21.5 2.5 10.8 13.2M21.5 2.5 14.5 21.5l-3.7-8.3L2.5 9.5z" />);
export const XIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M5 5l14 14M19 5 5 19" />);
export const ArrowDownIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M12 4v14m0 0 6-6m-6 6-6-6" />);
export const ArrowUpIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M12 20V6m0 0 6 6m-6-6-6 6" />);
export const AlertIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><path d="M12 3 2.5 20h19zM12 10v4.5m0 2.5v.01" /></>);
export const ShieldIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <path d="M12 2.8 4.5 5.6v6c0 4.6 3.2 7.9 7.5 9.6 4.3-1.7 7.5-5 7.5-9.6v-6zM8.8 12l2.2 2.2 4.2-4.2" />);
export const KeyIcon = ({ size = 18, className }: IconProps) =>
  svg(size, className, <><circle cx="8" cy="14" r="4.5" /><path d="m11.5 10.5 8-8M17 4l3 3m-5 0 2.5 2.5" /></>);
export const ExternalIcon = ({ size = 14, className }: IconProps) =>
  svg(size, className, <path d="M14 4h6v6M20 4 11 13M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />);

// ---- Primitives --------------------------------------------------------------

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type BtnVariant = "primary" | "ghost" | "danger" | "subtle";
export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  busy,
  className = "",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed select-none";
  const styles: Record<BtnVariant, string> = {
    primary:
      "bg-gradient-to-r from-accent to-accent2 text-[#1a1205] hover:brightness-110 shadow-[0_2px_14px_-2px_rgba(249,115,22,0.45)]",
    ghost: "border border-line text-text hover:bg-card2",
    subtle: "bg-card2 text-text hover:bg-line/60",
    danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
  };
  return (
    <button
      type={type}
      title={title}
      className={`${base} ${styles[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-[14px] text-text placeholder:text-faint outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15";

export function Modal({
  title,
  onClose,
  children,
  width = 460,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-card2 hover:text-text" aria-label="Close">
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      className={`rounded-md p-1.5 text-muted transition-colors hover:bg-card2 hover:text-text ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Fallback for webviews without clipboard permission
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
    >
      {ok ? <CheckIcon className="text-good" /> : <CopyIcon />}
    </button>
  );
}

export function ErrorNote({ text, onDismiss }: { text: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[13px] text-bad">
      <AlertIcon className="mt-0.5 shrink-0" />
      <span className="flex-1 break-words">{text}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="opacity-70 hover:opacity-100" aria-label="Dismiss">
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-14 text-center">
      <div className="mb-3 text-faint">
        <BoxIcon size={28} />
      </div>
      <div className="text-[14px] font-medium text-muted">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[12.5px] text-faint">{body}</div>}
    </div>
  );
}
