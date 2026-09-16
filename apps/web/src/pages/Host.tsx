import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Brand, Btn, ErrorBanner, MissingPoll, PageShell, PresenceLabel } from "../components/Brand";
import { ResultBars } from "../components/ResultBars";
import { StatusBadge } from "../components/StatusBadge";
import { usePollSocket } from "../hooks/usePollSocket";
import { getPoll } from "../lib/api";
import { readHostToken, saveHostToken } from "../lib/hostToken";

function joinUrlFor(code: string): string {
  return `${window.location.origin}/p/${code}`;
}

function formatExpiry(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = t - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Expires in ${days}d ${hours % 24}h`;
  }
  if (hours >= 1) return `Expires in ${hours}h ${minutes}m`;
  return `Expires in ${minutes}m`;
}

function HostFallback({
  title,
  body,
  code,
}: {
  title: string;
  body: string;
  code: string;
}) {
  return (
    <PageShell>
      <Brand />
      <h1 className="font-display mt-10 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          to={`/p/${code}`}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-coral px-5 text-sm font-semibold text-white shadow-[3px_3px_0_#1c140f]"
        >
          Sit with the audience
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

export function Host() {
  const { code: rawCode } = useParams();
  const [params] = useSearchParams();
  const code = (rawCode ?? "").toUpperCase();
  const queryToken = params.get("host");

  const token = useMemo(() => {
    return queryToken || readHostToken(code);
  }, [queryToken, code]);

  useEffect(() => {
    if (queryToken && code) saveHostToken(code, queryToken);
  }, [queryToken, code]);

  if (!rawCode) {
    return <Navigate to="/" replace />;
  }

  if (rawCode !== code) {
    const qs = params.toString();
    return <Navigate to={`/host/${code}${qs ? `?${qs}` : ""}`} replace />;
  }

  if (!token) {
    return (
      <HostFallback
        code={code}
        title="Host desk"
        body="Open this from the tab that created the poll, or use a host link that includes the token."
      />
    );
  }

  return <HostGate code={code} hostToken={token} />;
}

function HostGate({ code, hostToken }: { code: string; hostToken: string }) {
  const [missing, setMissing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void getPoll(code, hostToken)
      .then((state) => {
        if (!live) return;
        if (!state.isHost) {
          setForbidden(true);
          return;
        }
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!live) return;
        const message = err instanceof Error ? err.message : "";
        if (message.toLowerCase().includes("not found")) {
          setMissing(true);
          return;
        }
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [code, hostToken]);

  if (missing) return <MissingPoll code={code} />;
  if (forbidden) {
    return (
      <HostFallback
        code={code}
        title="This host link is wrong"
        body={`That token does not match poll ${code}.`}
      />
    );
  }
  if (!ready) {
    return (
      <PageShell>
        <Brand />
        <p className="mt-10 text-sm text-muted">Opening the host desk…</p>
      </PageShell>
    );
  }

  return <HostConsole code={code} hostToken={hostToken} />;
}

function HostConsole({ code, hostToken }: { code: string; hostToken: string }) {
  const { state, presence, error, connected, lock, unlock, reveal, close, clearError } =
    usePollSocket(code, hostToken);
  const [copied, setCopied] = useState<"join" | "code" | "host" | null>(null);

  const joinUrl = joinUrlFor(code);
  const hostUrl = `${window.location.origin}/host/${code}?host=${encodeURIComponent(hostToken)}`;
  const inactive = state?.status === "closed" || state?.status === "expired";
  const missing = error?.toLowerCase().includes("not found");

  if (state && !state.isHost) {
    return (
      <HostFallback
        code={code}
        title="This host link is wrong"
        body={`That token does not match poll ${code}.`}
      />
    );
  }

  if (missing) return <MissingPoll code={code} />;

  async function copyText(value: string, kind: "join" | "code" | "host") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <PageShell wide>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Brand />
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {state ? <StatusBadge status={state.status} /> : null}
          <PresenceLabel count={state?.presence ?? presence} />
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </div>
      ) : null}

      <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="pulse-ticket min-w-0 px-5 py-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Admit one</p>
          <p className="font-display mt-2 max-w-full overflow-x-clip text-5xl font-semibold tracking-[0.12em] sm:text-6xl">
            {code}
          </p>
          {state ? (
            <h1 className="mt-4 text-lg font-semibold text-balance break-words sm:text-xl">
              {state.question}
            </h1>
          ) : (
            <p className="mt-4 text-sm text-muted">Connecting to poll…</p>
          )}
          {state ? (
            <p className="mt-2 text-sm text-muted">{formatExpiry(state.expiresAt)}</p>
          ) : null}
          {state?.hideUntilReveal && !state.revealed ? (
            <p className="mt-2 text-sm font-semibold text-coral">Scoreboard is covered for the room.</p>
          ) : null}

          <div className="mt-5 inline-block max-w-full rounded-2xl border-[2.5px] border-ink bg-white p-3">
            <QRCodeSVG
              value={joinUrl}
              size={160}
              bgColor="#ffffff"
              fgColor="#1c140f"
              level="M"
              title={`Join poll ${code}`}
            />
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Btn type="button" variant="ghost" onClick={() => void copyText(code, "code")}>
              {copied === "code" ? "Code copied" : "Copy room code"}
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => void copyText(joinUrl, "join")}>
              {copied === "join" ? "Link copied" : "Copy join link"}
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => void copyText(hostUrl, "host")}>
              {copied === "host" ? "Host link copied" : "Copy host link"}
            </Btn>
            <Link
              to={`/p/${code}`}
              className="inline-flex min-h-11 items-center justify-center text-sm font-semibold underline decoration-2 underline-offset-4"
            >
              Audience view
            </Link>
          </div>
        </section>

        <section className="pulse-card min-w-0 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold">Scoreboard</h2>
            <p className="text-sm font-semibold tabular-nums text-muted">
              {state ? `${state.totalVotes} vote${state.totalVotes === 1 ? "" : "s"}` : "—"}
            </p>
          </div>

          <div className="mt-5">
            {state ? (
              <ResultBars
                options={state.options}
                totalVotes={state.totalVotes}
                resultsVisible
                youVotedOptionId={state.youVotedOptionId}
                disabled
              />
            ) : (
              <div className="h-32 animate-pulse rounded-3xl border-[2.5px] border-ink bg-cream" />
            )}
          </div>

          <div className="sticky bottom-0 z-10 mt-6 grid grid-cols-2 gap-2 bg-paper/90 py-1 sm:grid-cols-4">
            <Btn
              type="button"
              variant="ghost"
              onClick={lock}
              disabled={!state || inactive || state.locked}
              className="px-3 shadow-[3px_3px_0_#1c140f]"
            >
              Lock
            </Btn>
            <Btn
              type="button"
              variant="ghost"
              onClick={unlock}
              disabled={!state || inactive || !state.locked}
              className="px-3"
            >
              Unlock
            </Btn>
            <Btn type="button" onClick={reveal} disabled={!state || inactive || state.revealed} className="px-3">
              Reveal
            </Btn>
            <Btn
              type="button"
              variant="ink"
              onClick={close}
              disabled={!state || inactive}
              className="px-3"
            >
              Close
            </Btn>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
