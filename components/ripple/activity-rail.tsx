import type { PublicRippleRun } from "@/lib/ripple/contracts";

const stages = [
  ["breakdown", "Breakdown"],
  ["evidence", "Parallel Evidence"],
  ["schedule", "Schedule"],
  ["budget", "Budget"],
  ["locations", "Locations"],
  ["casting", "Casting"],
] as const;

export function ActivityRail({ run }: { run: PublicRippleRun | null }) {
  if (!run) return null;

  return (
    <section className="ripple-activity" aria-labelledby="ripple-activity-title">
      <div className="ripple-activity-heading">
        <div>
          <p className="overline">Live revision lifecycle</p>
          <h2 id="ripple-activity-title">Revision Ripple</h2>
        </div>
        <span className="run-status">{run.status.replace("_", " ")}</span>
      </div>
      <ol className="ripple-stage-list">
        {stages.map(([key, label], index) => {
          const progress = run.stages[key];
          return (
            <li data-status={progress.status} key={key}>
              <span className="stage-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="stage-marker" aria-hidden="true" />
              <span className="stage-copy">
                <strong>{label}</strong>
                <small>{progress.message}</small>
              </span>
              <span className="stage-status">{progress.status}</span>
            </li>
          );
        })}
      </ol>
      {run.failure ? (
        <div className="ripple-failure" role="alert">
          <strong>{run.failure.message}</strong>
          <span>Baseline unchanged · your request is still editable.</span>
        </div>
      ) : (
        <p className="baseline-lock-note">The approved baseline remains unchanged while analysis runs.</p>
      )}
      {run.proposal ? (
        <div className="evidence-proof">
          <div className="evidence-proof-heading">
            <div>
              <span>Parallel proof</span>
              <strong>{run.proposal.evidence.sourceMode} evidence · {run.proposal.evidence.records.length} sources</strong>
            </div>
            <time dateTime={run.proposal.evidence.retrievedAt}>
              {new Date(run.proposal.evidence.retrievedAt).toLocaleString()}
            </time>
          </div>
          <div className="evidence-proof-sources">
            {run.proposal.evidence.records.slice(0, 3).map((record) => (
              <a href={record.url} target="_blank" rel="noreferrer" key={record.id}>
                {record.title}
              </a>
            ))}
          </div>
          <div className="impact-proof" aria-label="Validated proposal impacts">
            {Object.entries(run.proposal.impacts).map(([name, impact]) => (
              <span data-changed={impact.changed} key={name}>{name} · {impact.changed ? "changed" : "held"}</span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
