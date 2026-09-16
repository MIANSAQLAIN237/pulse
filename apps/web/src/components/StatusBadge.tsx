import type { PollStatus } from "@pulse/shared";

const STYLES: Record<PollStatus, string> = {
  open: "bg-coral text-white",
  locked: "bg-gold text-ink",
  closed: "bg-ink text-paper",
  expired: "bg-[#8a6a4a] text-paper",
};

export function StatusBadge({ status }: { status: PollStatus }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-sm px-2.5 text-[11px] font-bold uppercase tracking-[0.14em] ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
