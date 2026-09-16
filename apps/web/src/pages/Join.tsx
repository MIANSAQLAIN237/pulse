import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Brand, Btn, ErrorBanner, FieldLabel, PageShell } from "../components/Brand";
import { getPoll } from "../lib/api";
import { normalizeCodeInput } from "../lib/hostToken";

export function Join() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = normalizeCodeInput(code);
    if (next.length !== 4) return;
    setError(null);
    setChecking(true);
    try {
      await getPoll(next);
      navigate(`/p/${next}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Poll not found");
    } finally {
      setChecking(false);
    }
  }

  const slots = [0, 1, 2, 3].map((i) => code[i] ?? "");

  return (
    <PageShell>
      <Brand />
      <h1 className="font-display mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">
        Enter the room
      </h1>
      <p className="mt-2 text-sm text-muted">Four characters. No I, O, 0, or 1.</p>

      {error ? (
        <div className="mt-5">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8">
        <label className="block">
          <FieldLabel>Room code</FieldLabel>
          <span className="mt-3 grid grid-cols-4 gap-2" aria-hidden>
            {slots.map((ch, i) => (
              <span
                key={i}
                className="grid min-h-20 place-items-center rounded-2xl border-[2.5px] border-ink bg-paper font-display text-3xl font-semibold shadow-[4px_4px_0_#1c140f]"
              >
                {ch || "·"}
              </span>
            ))}
          </span>
          <input
            value={code}
            onChange={(e) => setCode(normalizeCodeInput(e.target.value))}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={4}
            placeholder="K7MQ"
            className="mt-4 min-h-14 w-full rounded-2xl border-[2.5px] border-ink bg-white px-3 text-center font-display text-2xl tracking-[0.12em] uppercase placeholder:text-[#d2c4b4] focus:outline-none focus:ring-2 focus:ring-coral sm:tracking-[0.2em]"
          />
        </label>
        <Btn type="submit" disabled={code.length !== 4 || checking} className="mt-5 w-full">
          {checking ? "Checking…" : "Join the room"}
        </Btn>
      </form>

      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold underline decoration-2 underline-offset-4"
      >
        Create a poll instead
      </Link>
    </PageShell>
  );
}
