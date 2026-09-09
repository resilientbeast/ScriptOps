"use client";

import type { RevisionProposal } from "@/lib/domain/types";

const impactLabels = {
  breakdown: "Scene breakdown",
  schedule: "Shooting schedule",
  budget: "Budget band",
  locations: "Location candidates",
  casting: "Casting briefs",
} as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function impactDelta(proposal: RevisionProposal, key: keyof typeof impactLabels) {
  if (key === "breakdown") {
    const impact = proposal.impacts.breakdown;
    return `${impact.before.requirements.timeOfDay} → ${impact.after.requirements.timeOfDay}`;
  }
  if (key === "schedule") {
    const impact = proposal.impacts.schedule;
    return `${impact.before.shootDays} → ${impact.after.shootDays} shoot days`;
  }
  if (key === "budget") {
    const impact = proposal.impacts.budget;
    return `${formatCurrency(impact.before.low)}–${formatCurrency(impact.before.high)} → ${formatCurrency(impact.after.low)}–${formatCurrency(impact.after.high)}`;
  }
  if (key === "locations") {
    const impact = proposal.impacts.locations;
    return `${impact.before.length} → ${impact.after.length} candidates`;
  }
  const impact = proposal.impacts.casting;
  return `${impact.before.length} → ${impact.after.length} role briefs`;
}

export function ProposalReview({
  proposal,
  pending,
  onApprove,
  onDiscard,
  onEditAndRerun,
}: {
  proposal: RevisionProposal;
  pending: boolean;
  onApprove: () => void;
  onDiscard: () => void;
  onEditAndRerun: () => void;
}) {
  const evidenceById = new Map(
    proposal.evidence.records.map((record) => [record.id, record]),
  );
  const visibleEvidence = proposal.evidence.records.slice(0, 4);

  return (
    <section className="proposal-review" aria-labelledby="proposal-review-title">
      <div className="proposal-review-heading">
        <div>
          <p className="overline">Producer decision</p>
          <h2 id="proposal-review-title">One complete proposal, ready for review</h2>
          <p>The approved baseline is still unchanged. Approving commits every validated artifact together.</p>
        </div>
        <span className="proposal-version">Base plan v{proposal.basePlanVersion}</span>
      </div>

      <div className="proposal-impact-grid">
        {(Object.keys(impactLabels) as Array<keyof typeof impactLabels>).map((key) => {
          const impact = proposal.impacts[key];
          return (
            <article className="proposal-impact" key={key}>
              <div className="proposal-impact-title">
                <span>{impactLabels[key]}</span>
                <strong data-changed={impact.changed}>{impact.changed ? "Changed" : "Held"}</strong>
              </div>
              <p className="proposal-delta">{impactDelta(proposal, key)}</p>
              <p>{impact.reasons[0]}</p>
              <div className="proposal-meta">
                <span>Confidence: {impact.confidence}</span>
                <span>{impact.evidenceIds.length} cited sources</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="proposal-detail-grid">
        <div>
          <p className="overline">Assumptions</p>
          <ul>
            {proposal.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
          </ul>
        </div>
        <div>
          <p className="overline">Evidence consulted · showing {visibleEvidence.length} of {proposal.evidence.records.length} sources</p>
          <ul className="proposal-sources">
            {visibleEvidence.map((record) => (
              <li key={record.id}>
                <a href={record.url} target="_blank" rel="noreferrer">{record.title}</a>
                <span>{record.sourceMode} · {record.excerpt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {proposal.warnings.length ? (
        <p className="proposal-warning">{proposal.warnings.join(" ")}</p>
      ) : null}

      <div className="proposal-actions" aria-label="Proposal decisions">
        <button className="proposal-approve" type="button" disabled={pending} onClick={onApprove}>
          {pending ? "Committing…" : "Approve all 5 updates"}
        </button>
        <button className="proposal-secondary" type="button" disabled={pending} onClick={onEditAndRerun}>
          Edit request and rerun
        </button>
        <button className="proposal-discard" type="button" disabled={pending} onClick={onDiscard}>
          Discard proposal
        </button>
      </div>
      <p className="proposal-safety">No individual artifact can be patched outside this all-or-nothing decision.</p>
      <span className="sr-only">{evidenceById.size} evidence records are available for this proposal.</span>
    </section>
  );
}
