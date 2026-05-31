import { ArrowRight } from "lucide-react";
import { appletsRegistry } from "./appletsRegistry";

export function AppletHub() {
  return (
    <main className="shell hub-shell">
      <section className="hub-hero" aria-labelledby="hub-title">
        <p className="eyebrow">Applet hub</p>
        <h1 id="hub-title">Math & Strategy Applets</h1>
        <p>
          Playable local prototypes for small mathematical and strategy systems.
          Choose an applet to inspect the rules and try it in the browser.
        </p>
      </section>

      <section className="applet-grid" aria-label="Available applets">
        {appletsRegistry.map((applet) => (
          <article className="applet-card" key={applet.id}>
            <div className="card-topline">
              <span className="status-tag">{applet.status}</span>
            </div>
            <h2>{applet.title}</h2>
            <p>{applet.description}</p>
            <div className="tag-row" aria-label={`${applet.title} tags`}>
              {applet.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <a className="primary-link" href={`#${applet.route}`}>
              Play
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </article>
        ))}

        <article className="applet-card placeholder-card" aria-label="Future applets">
          <div className="card-topline">
            <span className="status-tag muted">Future Slot</span>
          </div>
          <h2>More applets</h2>
          <p>
            This hub is registry-driven, so new applets can be added without
            redesigning the landing page.
          </p>
        </article>
      </section>
    </main>
  );
}
