"use client";

import { useEffect } from "react";

import type { ArtifactKey } from "@/components/dashboard/types";
import type { ProductionPlan, RevisionProposal, SceneBreakdown } from "@/lib/domain/types";

function proposalComparison(
  artifact: ArtifactKey,
  plan: ProductionPlan,
  proposedPlan: ProductionPlan,
) {
  if (artifact === "breakdown") {
    const before = plan.scenes.find((scene) => scene.id === "scene-14")!;
    const after = proposedPlan.scenes.find((scene) => scene.id === "scene-14")!;
    return [`${before.requirements.timeOfDay} / ${before.requirements.weather.join(", ") || "clear"}`, `${after.requirements.timeOfDay} / ${after.requirements.weather.join(", ") || "clear"}`];
  }
  if (artifact === "schedule") return [`${plan.schedule.shootDays} shoot days`, `${proposedPlan.schedule.shootDays} shoot days`];
  if (artifact === "budget") return [`$${Math.round(plan.budget.low / 1000)}k–$${Math.round(plan.budget.high / 1000)}k`, `$${Math.round(proposedPlan.budget.low / 1000)}k–$${Math.round(proposedPlan.budget.high / 1000)}k`];
  if (artifact === "locations") return [`${plan.locations.length} ranked candidates`, `${proposedPlan.locations.length} ranked candidates`];
  return [`${plan.casting.length} role briefs`, `${proposedPlan.casting.length} role briefs`];
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function ProposalAwareDetailContent({
  artifact,
  plan,
  scene,
  proposal,
}: {
  artifact: ArtifactKey;
  plan: ProductionPlan;
  scene: SceneBreakdown;
  proposal: RevisionProposal | null;
}) {
  const displayPlan = proposal?.proposedPlan ?? plan;
  const displayScene = displayPlan.scenes.find((candidate) => candidate.id === scene.id) ?? scene;
  const comparison = proposal ? proposalComparison(artifact, plan, displayPlan) : null;
  const impact = proposal?.impacts[artifact];

  return (
    <>
      {comparison && impact ? (
        <div className="drawer-comparison">
          <span>Before <strong>{comparison[0]}</strong></span>
          <span>After <strong>{comparison[1]}</strong></span>
          <p>{impact.reasons[0]} · {impact.confidence} confidence</p>
        </div>
      ) : null}
      <DetailContent artifact={artifact} plan={displayPlan} scene={displayScene} />
    </>
  );
}

function DetailContent({
  artifact,
  plan,
  scene,
}: {
  artifact: ArtifactKey;
  plan: ProductionPlan;
  scene: SceneBreakdown;
}) {
  if (artifact === "breakdown") {
    return (
      <div className="drawer-stack">
        <div className="drawer-highlight">
          <span>Selected scene</span>
          <strong>{scene.heading}</strong>
          <p>{scene.summary}</p>
        </div>
        <dl className="detail-grid">
          <div><dt>Setting</dt><dd>{scene.setting}</dd></div>
          <div><dt>Pages</dt><dd>{scene.pageStart}–{scene.pageEnd}</dd></div>
          <div><dt>Cast roles</dt><dd>{scene.requirements.castRoleIds.length}</dd></div>
          <div><dt>Vehicles</dt><dd>{scene.requirements.vehicles.length}</dd></div>
        </dl>
      </div>
    );
  }

  if (artifact === "schedule") {
    return (
      <ol className="drawer-list">
        {plan.schedule.days.map((day) => (
          <li key={day.id}>
            <span>Day {String(day.dayNumber).padStart(2, "0")}</span>
            <div><strong>{day.label}</strong><small>{day.sceneIds.length} scenes · {day.estimatedHours} hrs · {day.dayNight}</small></div>
          </li>
        ))}
      </ol>
    );
  }

  if (artifact === "budget") {
    return (
      <div className="drawer-stack">
        <div className="budget-band">
          <span>Working production band</span>
          <strong>{currency.format(plan.budget.low)}–{currency.format(plan.budget.high)}</strong>
        </div>
        <ul className="plain-list">
          {plan.budget.costDrivers.map((driver) => (
            <li key={driver.id}><strong>{driver.label}</strong><span>{driver.reason}</span></li>
          ))}
        </ul>
      </div>
    );
  }

  if (artifact === "locations") {
    return (
      <ol className="drawer-list ranked-list">
        {plan.locations.map((location, index) => (
          <li key={location.id}>
            <span>0{index + 1}</span>
            <div><strong>{location.name}</strong><small>{location.locality}</small><p>{location.fit}</p></div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ul className="plain-list casting-list">
      {plan.casting.map((brief) => (
        <li key={brief.id}>
          <strong>{brief.roleName}</strong>
          <span>{brief.archetype}</span>
          <small>{brief.ageCategory} · archetype brief</small>
        </li>
      ))}
    </ul>
  );
}

const titles: Record<ArtifactKey, string> = {
  breakdown: "Scene breakdown",
  schedule: "Shooting schedule",
  budget: "Budget band",
  locations: "Location candidates",
  casting: "Casting briefs",
};

export function DetailDrawer({
  artifact,
  plan,
  scene,
  proposal,
  onClose,
}: {
  artifact: ArtifactKey | null;
  plan: ProductionPlan;
  scene: SceneBreakdown;
  proposal: RevisionProposal | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!artifact) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [artifact, onClose]);

  if (!artifact) return null;

  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="Close artifact details" />
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-header">
          <div><p className="overline">Baseline detail</p><h2 id="drawer-title">{titles[artifact]}</h2></div>
          <button className="drawer-close" type="button" onClick={onClose} autoFocus aria-label="Close details">×</button>
        </div>
        <ProposalAwareDetailContent artifact={artifact} plan={plan} scene={scene} proposal={proposal} />
        <p className="drawer-note">{proposal ? "Proposal preview · approval is required before these updates become the baseline." : "Read-only baseline · opening this view never starts analysis."}</p>
      </aside>
    </div>
  );
}
