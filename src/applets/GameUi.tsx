import { HelpCircle, Keyboard, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatScoreDate, getHighScores, type HighScoreEntry } from "./gameScoring";

export type TutorialStep = {
  highlight?: string;
  text: string;
  title: string;
};

export function KeyboardHints({ hints }: { hints: string[] }) {
  return (
    <section className="keyboard-hints" aria-label="Keyboard shortcuts">
      <p className="eyebrow">
        <Keyboard size={14} aria-hidden="true" />
        Keys
      </p>
      <div>
        {hints.map((hint) => (
          <span key={hint}>{hint}</span>
        ))}
      </div>
    </section>
  );
}

export function TutorialButton({
  gameId,
  steps,
}: {
  gameId: string;
  steps: TutorialStep[];
}) {
  const storageKey = `sts2.tutorialSeen.${gameId}`;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.localStorage.getItem(storageKey)) {
      const timer = window.setTimeout(() => setOpen(true), 350);
      return () => window.clearTimeout(timer);
    }
  }, [storageKey]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      window.addEventListener("keydown", closeOnEscape);
    }

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function close() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "true");
    }
    setOpen(false);
    setIndex(0);
  }

  const step = steps[index];

  return (
    <>
      <button className="secondary-button wide" onClick={() => setOpen(true)} type="button">
        <HelpCircle size={17} aria-hidden="true" />
        Tutorial
      </button>
      {open ? (
        <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby={`${gameId}-tutorial-title`}>
          <div className="tutorial-card">
            <button className="icon-button tutorial-close" onClick={close} type="button" aria-label="Close tutorial">
              <X size={18} aria-hidden="true" />
            </button>
            <p className="eyebrow">Step {index + 1} of {steps.length}</p>
            <h2 id={`${gameId}-tutorial-title`}>{step.title}</h2>
            <p>{step.text}</p>
            {step.highlight ? <div className="tutorial-highlight">{step.highlight}</div> : null}
            <div className="tutorial-actions">
              <button
                className="secondary-button"
                disabled={index === 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
                type="button"
              >
                Back
              </button>
              <button
                className="secondary-button primary-action"
                onClick={() => (index === steps.length - 1 ? close() : setIndex((value) => value + 1))}
                type="button"
              >
                {index === steps.length - 1 ? "Play" : "Next"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function HighScorePanel({
  entries,
  gameId,
  title = "Local best",
}: {
  entries?: HighScoreEntry[];
  gameId: string;
  title?: string;
}) {
  const scores = useMemo(() => entries ?? getHighScores(gameId), [entries, gameId]);

  return (
    <section className="high-score-panel" aria-label={`${title} scores`}>
      <p className="eyebrow">
        <Trophy size={14} aria-hidden="true" />
        {title}
      </p>
      {scores.length > 0 ? (
        <ol>
          {scores.slice(0, 3).map((entry, index) => (
            <li key={`${entry.date}-${index}`}>
              <strong>{entry.score}</strong>
              <span>{formatScoreDate(entry.date)}{entry.settings ? ` - ${entry.settings}` : ""}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="helper-text">Finish a run to save a local score.</p>
      )}
    </section>
  );
}

export function BoardCoordinates({
  children,
  cols,
  rows,
}: {
  children: ReactNode;
  cols: string[];
  rows: string[];
}) {
  return (
    <div className="coordinate-board-wrap" style={{ ["--board-cols" as string]: cols.length }}>
      <div className="board-coordinates top">
        {cols.map((col) => <span key={col}>{col}</span>)}
      </div>
      <div className="coordinate-middle">
        <div className="board-coordinates side">
          {rows.map((row) => <span key={row}>{row}</span>)}
        </div>
        {children}
        <div className="board-coordinates side">
          {rows.map((row) => <span key={row}>{row}</span>)}
        </div>
      </div>
      <div className="board-coordinates bottom">
        {cols.map((col) => <span key={col}>{col}</span>)}
      </div>
    </div>
  );
}
