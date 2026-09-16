import type { PollOptionState } from "@pulse/shared";

const LETTERS = "ABCDEFGH";

function sortedOptions(options: PollOptionState[]): PollOptionState[] {
  return options.slice().sort((a, b) => a.position - b.position);
}

function letterFor(position: number): string {
  return LETTERS[position] ?? String(position + 1);
}

type CommonProps = {
  options: PollOptionState[];
  youVotedOptionId: string | null;
  disabled: boolean;
  onVote?: (optionId: string) => void;
};

export function VoteOptions({
  options,
  youVotedOptionId,
  disabled,
  onVote,
}: CommonProps) {
  const voted = Boolean(youVotedOptionId);

  return (
    <ul className="flex flex-col gap-3">
      {sortedOptions(options).map((opt) => {
        const selected = youVotedOptionId === opt.id;
        return (
          <li key={opt.id}>
            <button
              type="button"
              aria-pressed={selected}
              disabled={disabled || voted || !onVote}
              onClick={() => onVote?.(opt.id)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-3xl border-[2.5px] px-3 py-2.5 text-left text-[15px] font-medium shadow-[4px_4px_0_#1c140f] transition ${
                selected
                  ? "border-ink bg-coral text-white"
                  : "border-ink bg-paper text-ink hover:bg-[#ffe8d8]"
              } disabled:opacity-70`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-[2.5px] border-ink font-display text-lg font-semibold ${
                  selected ? "bg-paper text-ink" : "bg-cream"
                }`}
              >
                {letterFor(opt.position)}
              </span>
              <span className="min-w-0 flex-1 break-words">{opt.label}</span>
              {selected ? (
                <span className="shrink-0 text-xs font-bold uppercase tracking-wide">Yours</span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ResultBars({
  options,
  totalVotes,
  resultsVisible,
  youVotedOptionId,
  disabled,
  onVote,
}: CommonProps & {
  totalVotes: number;
  resultsVisible: boolean;
}) {
  const voted = Boolean(youVotedOptionId);
  const canVote = Boolean(onVote) && !disabled && !voted;

  return (
    <ul className="flex flex-col gap-3">
      {sortedOptions(options).map((opt) => {
        const ratio = totalVotes > 0 ? opt.votes / totalVotes : 0;
        const pct = Math.round(ratio * 100);
        const selected = youVotedOptionId === opt.id;
        const label = resultsVisible
          ? `${opt.label}: ${opt.votes} votes, ${pct} percent`
          : opt.label;

        const inner = (
          <>
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-coral/25 transition-[width] duration-500 ease-out"
              style={{ width: `${ratio * 100}%` }}
            />
            <span className="relative flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-paper font-display text-lg font-semibold">
                {letterFor(opt.position)}
              </span>
              <span className="min-w-0 flex-1 break-words text-[15px] font-medium">
                {opt.label}
                {selected ? (
                  <span className="ml-2 text-xs font-bold uppercase tracking-wide text-coral">
                    Yours
                  </span>
                ) : null}
              </span>
              {resultsVisible ? (
                <span className="font-display shrink-0 text-lg tabular-nums">
                  {pct}%
                </span>
              ) : null}
            </span>
          </>
        );

        return (
          <li key={opt.id}>
            {canVote ? (
              <button
                type="button"
                aria-label={`Vote for ${opt.label}`}
                onClick={() => onVote?.(opt.id)}
                className={`relative w-full overflow-hidden rounded-3xl border-[2.5px] border-ink text-left shadow-[4px_4px_0_#1c140f] ${
                  selected ? "bg-[#ffe8d8]" : "bg-paper hover:bg-cream"
                }`}
              >
                {inner}
              </button>
            ) : (
              <div
                role="img"
                aria-label={label}
                className={`relative overflow-hidden rounded-3xl border-[2.5px] border-ink shadow-[4px_4px_0_#1c140f] ${
                  selected ? "bg-[#ffe8d8]" : "bg-paper"
                }`}
              >
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
