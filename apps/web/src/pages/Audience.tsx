import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { PollState } from "@pulse/shared";
import { Brand, ErrorBanner, MissingPoll, PageShell, PresenceLabel } from "../components/Brand";
import { ResultBars, VoteOptions } from "../components/ResultBars";
import { StatusBadge } from "../components/StatusBadge";
import { usePollSocket } from "../hooks/usePollSocket";
import { getPoll } from "../lib/api";

export function Audience() {
  const { code: rawCode } = useParams();
  const code = (rawCode ?? "").toUpperCase();

  if (!rawCode) {
    return <Navigate to="/join" replace />;
  }

  if (rawCode !== code) {
    return <Navigate to={`/p/${code}`} replace />;
  }

  return <AudienceGate code={code} />;
}

function AudienceGate({ code }: { code: string }) {
  const [missing, setMissing] = useState(false);
  const [initial, setInitial] = useState<PollState | null>(null);

  useEffect(() => {
    let live = true;
    void getPoll(code)
      .then((state) => {
        if (live) setInitial(state);
      })
      .catch((err: unknown) => {
        if (!live) return;
        const message = err instanceof Error ? err.message : "";
        if (message.toLowerCase().includes("not found")) {
          setMissing(true);
          return;
        }
      });
    return () => {
      live = false;
    };
  }, [code]);

  if (missing) return <MissingPoll code={code} />;
  if (!initial) {
    return (
      <PageShell>
        <Brand />
        <p className="mt-10 text-sm text-muted">Finding the room…</p>
      </PageShell>
    );
  }

  return <AudienceRoom code={code} initial={initial} />;
}

function AudienceRoom({ code, initial }: { code: string; initial: PollState }) {
  const { state, presence, error, connected, vote, clearError } = usePollSocket(code);
  const view = state ?? initial;
  const votingOpen = view.status === "open";
  const alreadyVoted = Boolean(view.youVotedOptionId);
  const live = Boolean(state);
  const voteDisabled = !votingOpen || alreadyVoted || !live;
  const missing = error?.toLowerCase().includes("not found");

  if (missing) return <MissingPoll code={code} />;

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Brand />
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <StatusBadge status={view.status} />
          <PresenceLabel count={state?.presence ?? presence ?? view.presence} />
        </div>
      </header>

      <p className="font-display mt-8 text-sm tracking-[0.28em] text-muted">{code}</p>

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </div>
      ) : null}

      <h1 className="font-display mt-3 text-[1.85rem] leading-tight font-semibold text-balance break-words sm:text-3xl">
        {view.question}
      </h1>

      {!view.resultsVisible ? (
        <p
          role="status"
          className="mt-5 rounded-2xl border-[2.5px] border-dashed border-ink bg-paper px-4 py-3 text-sm font-medium"
        >
          Scoreboard is covered. Vote anyway — the host will lift the sheet.
        </p>
      ) : null}

      <div className="mt-6">
        {view.resultsVisible ? (
          <ResultBars
            options={view.options}
            totalVotes={view.totalVotes}
            resultsVisible
            youVotedOptionId={view.youVotedOptionId}
            disabled={voteDisabled}
            onVote={votingOpen && !alreadyVoted && live ? vote : undefined}
          />
        ) : (
          <VoteOptions
            options={view.options}
            youVotedOptionId={view.youVotedOptionId}
            disabled={voteDisabled}
            onVote={votingOpen && !alreadyVoted && live ? vote : undefined}
          />
        )}
      </div>

      <p className="mt-5 text-sm font-medium text-muted">
        {!connected && !state
          ? "Connecting for live updates…"
          : votingOpen
            ? alreadyVoted
              ? "Your vote is in."
              : "Tap a letter. One vote per person."
            : view.status === "locked"
              ? "The host locked voting."
              : view.status === "closed"
                ? "This poll is closed."
                : "This poll has expired."}
      </p>

      <Link
        to="/join"
        className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold underline decoration-2 underline-offset-4"
      >
        Different room
      </Link>
    </PageShell>
  );
}
