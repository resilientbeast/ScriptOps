import type { ArtifactSummary } from "@/components/dashboard/dashboard-model";
import type { ArtifactKey } from "@/components/dashboard/types";

export function ArtifactGrid({
  artifacts,
  onOpen,
  proposalReady,
}: {
  artifacts: ArtifactSummary[];
  onOpen: (artifact: ArtifactKey) => void;
  proposalReady: boolean;
}) {
  return (
    <section className="artifact-section" aria-labelledby="artifact-heading">
      <div className="section-heading-row">
        <div>
          <p className="overline">Connected baseline</p>
          <h2 id="artifact-heading">Production artifacts</h2>
        </div>
        <p>Every card is populated from the same validated plan.</p>
      </div>
      <div className="artifact-grid">
        {artifacts.map((artifact) => (
          <button
            className="artifact-card"
            data-proposed={proposalReady}
            key={artifact.key}
            onClick={() => onOpen(artifact.key)}
            type="button"
            aria-haspopup="dialog"
          >
            <span className="artifact-card-top">
              <span>{artifact.index}</span>
              <span aria-hidden="true">↗</span>
            </span>
            <strong>{artifact.metric}</strong>
            <span className="artifact-label">{artifact.label}</span>
            <small>{proposalReady ? "Baseline · proposal ready" : artifact.descriptor}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
