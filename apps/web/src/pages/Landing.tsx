import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Brand, Btn, ErrorBanner, FieldLabel, PageShell } from "../components/Brand";
import { createPoll } from "../lib/api";
import { saveHostToken } from "../lib/hostToken";

type OptionField = { id: string; value: string };

const TTL_HOURS = [1, 6, 12, 24, 48, 72] as const;

function newField(): OptionField {
  return { id: crypto.randomUUID(), value: "" };
}

export function Landing() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<OptionField[]>(() => [newField(), newField()]);
  const [hideUntilReveal, setHideUntilReveal] = useState(false);
  const [ttlHours, setTtlHours] = useState<(typeof TTL_HOURS)[number]>(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = useMemo(
    () => options.map((o) => o.value.trim()).filter(Boolean),
    [options],
  );

  function updateOption(id: string, value: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, value } : o)));
  }

  function addOption() {
    setOptions((prev) => (prev.length >= 8 ? prev : [...prev, newField()]));
  }

  function removeOption(id: string) {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((o) => o.id !== id)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const q = question.trim();
    if (q.length < 5) {
      setError("Question must be at least 5 characters.");
      return;
    }
    if (q.length > 200) {
      setError("Question must be 200 characters or fewer.");
      return;
    }
    if (filled.length < 2) {
      setError("Add at least two options.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createPoll({
        question: q,
        options: filled,
        hideUntilReveal,
        ttlHours,
      });
      saveHostToken(created.code, created.hostToken);
      navigate(`/host/${created.code}?host=${encodeURIComponent(created.hostToken)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create poll.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <header className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Brand />
        <Link
          to="/join"
          className="inline-flex min-h-11 items-center justify-center rounded-full border-[2.5px] border-ink bg-paper px-4 text-sm font-semibold shadow-[2px_2px_0_#1c140f] sm:w-auto"
        >
          Join
        </Link>
      </header>

      <p className="mt-10 inline-block rounded-sm bg-ink px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-paper">
        Live in the room
      </p>
      <h1 className="font-display mt-4 max-w-md text-[2.35rem] leading-[1.05] font-semibold tracking-tight sm:text-5xl">
        Hand the room a question. Catch the answer live.
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
        Share a 4-character code or a QR. Everyone votes once. You lock, reveal, and close from
        the host desk.
      </p>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
        <Link to="/p/K7MQ" className="underline decoration-2 underline-offset-4">
          Sit in the demo →
        </Link>
        <Link
          to="/host/K7MQ?host=pulse-demo-host-token"
          className="underline decoration-2 underline-offset-4"
        >
          Host the demo →
        </Link>
      </div>

      <form onSubmit={onSubmit} className="pulse-ticket mt-10 min-w-0 px-5 py-7 sm:px-7">
        <h2 className="font-display text-2xl font-semibold">Print a poll</h2>
        <p className="mt-1 text-sm text-muted">A question and two to eight options.</p>

        {error ? (
          <div className="mt-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        ) : null}

        <label className="mt-6 block">
          <FieldLabel>Question</FieldLabel>
          <textarea
            required
            rows={3}
            maxLength={200}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Which topic should we cover next?"
            className="mt-2 min-h-11 w-full resize-y rounded-2xl border-[2.5px] border-ink bg-white px-3 py-2.5 text-base text-ink placeholder:text-[#b7a89c] focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <span className="mt-1 block text-[11px] text-muted">{question.trim().length}/200</span>
        </label>

        <fieldset className="mt-5">
          <legend>
            <FieldLabel>Options</FieldLabel>
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {options.map((opt, index) => (
              <div key={opt.id} className="flex min-w-0 gap-2">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-cream font-display text-lg font-semibold">
                  {String.fromCharCode(65 + index)}
                </span>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Option {index + 1}</span>
                  <input
                    value={opt.value}
                    onChange={(e) => updateOption(opt.id, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    maxLength={80}
                    className="min-h-12 w-full rounded-2xl border-[2.5px] border-ink bg-white px-3 text-base text-ink placeholder:text-[#b7a89c] focus:outline-none focus:ring-2 focus:ring-coral"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove option ${index + 1}`}
                  disabled={options.length <= 2}
                  onClick={() => removeOption(opt.id)}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[2.5px] border-ink bg-paper text-lg disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            disabled={options.length >= 8}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-bold underline decoration-2 underline-offset-4 disabled:opacity-40"
          >
            Add another option
          </button>
        </fieldset>

        <label className="mt-5 block">
          <FieldLabel>Expires after</FieldLabel>
          <select
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value) as (typeof TTL_HOURS)[number])}
            className="mt-2 min-h-12 w-full rounded-2xl border-[2.5px] border-ink bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-coral"
          >
            {TTL_HOURS.map((hours) => (
              <option key={hours} value={hours}>
                {hours === 1 ? "1 hour" : `${hours} hours`}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={hideUntilReveal}
            onChange={(e) => setHideUntilReveal(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-coral"
          />
          Hide the scoreboard until I reveal
        </label>

        <Btn type="submit" disabled={submitting} className="mt-7 w-full">
          {submitting ? "Printing…" : "Create poll"}
        </Btn>
      </form>
    </PageShell>
  );
}
