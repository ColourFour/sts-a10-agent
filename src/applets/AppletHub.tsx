import { ArrowRight, Gamepad2, Sparkles, Swords, Trophy } from "lucide-react";
import { appletsRegistry, type AppletRegistryEntry } from "./appletsRegistry";

const visualCellCount = 12;
const featuredIds = new Set(["twelve-janggi", "super-hexagon", "lights-out"]);

const sections = [
  {
    title: "Strategy tables",
    description: "Two-player boards with territory, tactics, captures, or connection races.",
    ids: ["twelve-janggi", "nine-mens-morris", "mini-shogi", "amazons-mini", "hex", "domineering", "konane", "chess"],
  },
  {
    title: "Puzzle benches",
    description: "Solo problems with crisp goals, compact boards, and resettable challenge paths.",
    ids: ["xo-game-lab", "lights-out", "sliding-tiles", "towers-of-hanoi", "mastermind", "peg-solitaire", "sokoban-mini"],
  },
  {
    title: "Arcade cabinet",
    description: "Fast keyboard play and canvas action.",
    ids: ["super-hexagon"],
  },
];

function AppletVisual({ id }: { id: string }) {
  return (
    <div className={`applet-visual visual-${id}`} aria-hidden="true">
      <div className="visual-grid">
        {Array.from({ length: visualCellCount }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}

function AppletCard({
  applet,
  featured = false,
  index,
}: {
  applet: AppletRegistryEntry;
  featured?: boolean;
  index: number;
}) {
  return (
    <a
      className={`applet-card applet-card-${applet.id} ${featured ? "featured-card" : ""}`}
      href={`#${applet.route}`}
    >
      <div className="card-topline">
        <span className="status-tag">{featured ? "Featured" : applet.tags[0]}</span>
        <span className="applet-index">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <AppletVisual id={applet.id} />
      <h2>{applet.title}</h2>
      <p>{applet.description}</p>
      <div className="tag-row" aria-label={`${applet.title} tags`}>
        {applet.tags.slice(0, featured ? 3 : 2).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <span className="primary-link">
        Launch
        <ArrowRight size={18} aria-hidden="true" />
      </span>
    </a>
  );
}

export function AppletHub() {
  const featuredApplets = appletsRegistry.filter((applet) => featuredIds.has(applet.id));

  return (
    <main className="shell hub-shell">
      <section className="hub-hero" aria-labelledby="hub-title">
        <div className="hub-copy">
          <p className="eyebrow">Open arcade</p>
          <h1 id="hub-title">Strategy Lab Arcade</h1>
          <p>
            A cabinet wall of board games, logic puzzles, and reflex experiments.
            Pick a marquee, skim the rules, and start playing from the browser.
          </p>
          <div className="hub-stats" aria-label="Applet collection summary">
            <span>
              <Gamepad2 size={17} aria-hidden="true" />
              {appletsRegistry.length} playable applets
            </span>
            <span>
              <Swords size={17} aria-hidden="true" />
              8 strategy tables
            </span>
            <span>
              <Trophy size={17} aria-hidden="true" />
              Completion-tested builds
            </span>
          </div>
        </div>
        <div className="hub-showcase" aria-hidden="true">
          <div className="showcase-sign">PLAY</div>
          <div className="showcase-board">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="showcase-tokens">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="featured-strip" aria-labelledby="featured-title">
        <div className="section-heading">
          <p className="eyebrow">Start here</p>
          <h2 id="featured-title">Featured cabinets</h2>
        </div>
        <div className="featured-grid">
          {featuredApplets.map((applet) => (
            <AppletCard
              applet={applet}
              featured
              index={appletsRegistry.findIndex((entry) => entry.id === applet.id)}
              key={applet.id}
            />
          ))}
        </div>
      </section>

      {sections.map((section) => (
        <section className="applet-section" aria-labelledby={`${section.title}-title`} key={section.title}>
          <div className="section-heading">
            <p className="eyebrow">{section.ids.length} games</p>
            <h2 id={`${section.title}-title`}>{section.title}</h2>
            <p>{section.description}</p>
          </div>
          <div className="applet-grid">
            {section.ids.map((id) => {
              const applet = appletsRegistry.find((entry) => entry.id === id)!;
              return (
                <AppletCard
                  applet={applet}
                  index={appletsRegistry.findIndex((entry) => entry.id === applet.id)}
                  key={applet.id}
                />
              );
            })}
          </div>
        </section>
      ))}

      <section className="future-rack" aria-label="Future applets">
        <Sparkles size={18} aria-hidden="true" />
        <span>More applets can be added through the registry without rebuilding the launcher layout.</span>
      </section>
    </main>
  );
}
