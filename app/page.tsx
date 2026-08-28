const artifacts = ["Breakdown", "Schedule", "Budget", "Locations", "Casting"];

export default function Home() {
  return (
    <main className="shell">
      <section className="status-card" aria-labelledby="scriptops-title">
        <div className="eyebrow">
          <span className="status-dot" aria-hidden="true" />
          System bootstrap complete
        </div>
        <p className="kicker">Production control / New Mexico</p>
        <h1 id="scriptops-title">ScriptOps</h1>
        <p className="lede">
          One approved scene change stays connected across the entire pre-production plan.
        </p>

        <div className="artifact-row" aria-label="Connected production artifacts">
          {artifacts.map((artifact, index) => (
            <span key={artifact} className="artifact-chip">
              <span>{String(index + 1).padStart(2, "0")}</span>
              {artifact}
            </span>
          ))}
        </div>

        <div className="next-slice">
          <span>Next vertical proof</span>
          <strong>Cloud Run → Cloud Tasks → Firestore</strong>
        </div>
      </section>
    </main>
  );
}
