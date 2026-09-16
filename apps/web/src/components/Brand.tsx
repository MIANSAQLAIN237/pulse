import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="inline-flex min-h-11 items-center gap-2.5 text-ink">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-coral text-paper">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M1 9h2.2l1.3-4 2.2 8 2.4-10 2.1 8 1.4-4H17"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {compact ? (
        <span className="sr-only">Pulse</span>
      ) : (
        <span className="font-display text-xl font-semibold tracking-tight">Pulse</span>
      )}
    </Link>
  );
}

export function PageShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-dvh overflow-x-clip text-ink">
      <div className="h-2 bg-coral" />
      <div
        className={`relative mx-auto w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10 ${
          wide ? "max-w-5xl" : "max-w-lg"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Btn({
  children,
  variant = "coral",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "coral" | "ink" | "ghost";
}) {
  const styles = {
    coral:
      "bg-coral text-white hover:bg-coral-dark disabled:opacity-50",
    ink: "bg-ink text-paper hover:bg-black disabled:opacity-50",
    ghost:
      "border-[2.5px] border-ink bg-paper text-ink hover:bg-cream disabled:opacity-40",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[3px_3px_0_#1c140f] ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function TextLink({
  to,
  children,
  className = "",
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center text-sm font-semibold underline decoration-2 underline-offset-4 hover:text-coral ${className}`}
    >
      {children}
    </Link>
  );
}

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-11 items-start justify-between gap-3 rounded-2xl border-[2.5px] border-ink bg-[#f8d2c8] px-3 py-2.5 text-sm text-ink"
    >
      <p className="min-w-0 break-words">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 font-semibold"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export function PresenceLabel({ count }: { count: number }) {
  const n = Number.isFinite(count) ? count : 0;
  return (
    <p className="text-sm font-semibold text-muted" aria-live="polite">
      {n} in the room
    </p>
  );
}

export function MissingPoll({ code }: { code?: string }) {
  return (
    <PageShell>
      <Brand />
      <h1 className="font-display mt-10 text-3xl font-semibold tracking-tight">
        That room is empty
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        {code ? (
          <>
            No live poll for{" "}
            <span className="font-display tracking-[0.12em] text-ink">{code}</span>.
          </>
        ) : (
          "That room code is not active."
        )}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          to="/join"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-coral px-5 text-sm font-semibold text-white shadow-[3px_3px_0_#1c140f]"
        >
          Try another code
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-12 items-center justify-center rounded-full border-[2.5px] border-ink bg-paper px-5 text-sm font-semibold shadow-[3px_3px_0_#1c140f]"
        >
          Create a poll
        </Link>
      </div>
    </PageShell>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block text-xs font-bold uppercase tracking-[0.16em] text-muted">
      {children}
    </span>
  );
}
