import type { ReactNode } from "react";

export type ChessDashboardNavItem<T extends string> = {
  id: T;
  icon: ReactNode;
  label: string;
};

export function NavigationSidebar<T extends string>({
  activeItem,
  items,
  onNavigate,
  profileLabel,
  profileMeta,
}: {
  activeItem: T;
  items: ChessDashboardNavItem<T>[];
  onNavigate: (item: T) => void;
  profileLabel: string;
  profileMeta: string;
}) {
  return (
    <aside className="trainer-sidebar" aria-label="Chess trainer navigation">
      <div className="trainer-brand">
        <span className="trainer-brand-mark" aria-hidden="true">♞</span>
        <strong>Blake's Chess Trainer</strong>
      </div>
      <a className="trainer-back-link" href="#/applets">
        Back to Applets
      </a>
      <nav className="trainer-nav">
        {items.map((item) => (
          <button
            aria-current={activeItem === item.id ? "page" : undefined}
            className={activeItem === item.id ? "selected" : ""}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="trainer-sidebar-profile">
        <span>{profileLabel.slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>{profileLabel}</strong>
          <small>{profileMeta}</small>
        </div>
      </div>
    </aside>
  );
}

export function StatCard({
  accent,
  helper,
  icon,
  label,
  trend,
  value,
}: {
  accent?: "blue" | "green" | "red" | "yellow";
  helper?: string;
  icon?: ReactNode;
  label: string;
  trend?: string;
  value: string;
}) {
  return (
    <article className={`trainer-stat-card ${accent ? `accent-${accent}` : ""}`}>
      <div className="trainer-card-topline">
        <span>{label}</span>
        {icon ? <span className="trainer-card-icon">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      <div className="trainer-stat-footer">
        {helper ? <small>{helper}</small> : null}
        {trend ? <em>{trend}</em> : null}
      </div>
    </article>
  );
}

export function DashboardCard({
  actionLabel,
  children,
  eyebrow,
  icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: ReactNode;
  eyebrow?: string;
  icon?: ReactNode;
  onAction?: () => void;
  title: string;
}) {
  return (
    <article className="trainer-dashboard-card">
      <div className="trainer-card-heading">
        <div>
          {eyebrow ? <span>{eyebrow}</span> : null}
          <strong>{title}</strong>
        </div>
        {icon ? <span className="trainer-card-icon">{icon}</span> : null}
      </div>
      <div className="trainer-dashboard-card-body">{children}</div>
      {actionLabel && onAction ? (
        <button className="trainer-text-action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

function parseFenBoard(fen: string): string[][] {
  const placement = fen.split(" ")[0] ?? "";
  return placement.split("/").map((rank) => {
    const squares: string[] = [];
    for (const char of rank) {
      const emptyCount = Number(char);
      if (Number.isInteger(emptyCount) && emptyCount > 0) {
        squares.push(...Array(emptyCount).fill(""));
      } else {
        squares.push(char);
      }
    }
    return squares;
  });
}

const previewGlyphs: Record<string, string> = {
  B: "♗",
  K: "♔",
  N: "♘",
  P: "♙",
  Q: "♕",
  R: "♖",
  b: "♝",
  k: "♚",
  n: "♞",
  p: "♟",
  q: "♛",
  r: "♜",
};

export function ChessBoardPreview({
  fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  label,
  orientation = "white",
}: {
  fen?: string;
  label?: string;
  orientation?: "black" | "white";
}) {
  const rows = parseFenBoard(fen);
  const orientedRows = orientation === "black" ? [...rows].reverse().map((row) => [...row].reverse()) : rows;

  return (
    <div className="trainer-board-preview" aria-label={label ?? "Chess board preview"}>
      {orientedRows.map((row, rowIndex) =>
        row.map((piece, colIndex) => (
          <span
            className={`trainer-board-square ${(rowIndex + colIndex) % 2 === 0 ? "light" : "dark"}`}
            key={`${rowIndex}-${colIndex}`}
          >
            {piece ? (
              <span className={`trainer-board-piece ${piece === piece.toUpperCase() ? "piece-white" : "piece-black"}`}>
                {previewGlyphs[piece]}
              </span>
            ) : null}
          </span>
        )),
      )}
    </div>
  );
}

export function LeakCard({
  actionLabel = "Open details",
  impact,
  onAction,
  patterns,
  severity,
  summary,
  title,
}: {
  actionLabel?: string;
  impact?: string;
  onAction?: () => void;
  patterns?: string[];
  severity: "Critical" | "High" | "Medium" | "Low";
  summary: string;
  title: string;
}) {
  return (
    <article className={`trainer-leak-card severity-${severity.toLowerCase()}`}>
      <div className="trainer-card-heading">
        <div>
          <strong>{title}</strong>
          <span>{summary}</span>
        </div>
        <em>{severity}</em>
      </div>
      {impact ? <p className="trainer-impact-copy">Impact: {impact}</p> : null}
      {patterns && patterns.length > 0 ? (
        <ul>
          {patterns.map((pattern) => (
            <li key={pattern}>{pattern}</li>
          ))}
        </ul>
      ) : null}
      {onAction ? (
        <button className="trainer-text-action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

export function DrillCard({
  category,
  difficulty,
  estimate,
  onStart,
  progress,
  title,
}: {
  category: string;
  difficulty: string;
  estimate: string;
  onStart?: () => void;
  progress: number;
  title: string;
}) {
  const boundedProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <article className="trainer-drill-card">
      <div className="trainer-card-heading">
        <div>
          <span>{category}</span>
          <strong>{title}</strong>
        </div>
        <em>{difficulty}</em>
      </div>
      <div className="trainer-drill-meta">
        <span>{estimate}</span>
        <span>{boundedProgress}% complete</span>
      </div>
      <div className="trainer-progress-track" aria-label={`${boundedProgress}% complete`}>
        <span style={{ width: `${boundedProgress}%` }} />
      </div>
      {onStart ? (
        <button className="trainer-start-button" onClick={onStart} type="button">
          Start
        </button>
      ) : null}
    </article>
  );
}

export function ActivityTimeline({
  items,
}: {
  items: { detail?: string; label: string; tone?: "good" | "neutral" | "warning" }[];
}) {
  return (
    <ol className="trainer-activity-timeline">
      {items.map((item) => (
        <li className={item.tone ? `tone-${item.tone}` : ""} key={`${item.label}-${item.detail ?? ""}`}>
          <span aria-hidden="true">✓</span>
          <div>
            <strong>{item.label}</strong>
            {item.detail ? <small>{item.detail}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ProgressChart({
  label,
  points,
}: {
  label: string;
  points: number[];
}) {
  const values = points.length > 0 ? points : [0, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const polyline = values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 88 - ((value - min) / range) * 72;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="trainer-progress-chart" aria-label={label}>
      <svg viewBox="0 0 100 100" role="img">
        <path d="M0 88H100" />
        <path d="M0 16H100" />
        <polyline points={polyline} />
      </svg>
    </div>
  );
}
