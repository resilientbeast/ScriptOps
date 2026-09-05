"use client";

import { useEffect } from "react";

import type { ArtifactKey } from "@/components/dashboard/types";
import type { ProductionPlan, SceneBreakdown } from "@/lib/domain/types";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
  onClose,
}: {
  artifact: ArtifactKey | null;
  plan: ProductionPlan;
  scene: SceneBreakdown;
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
        <DetailContent artifact={artifact} plan={plan} scene={scene} />
        <p className="drawer-note">Read-only baseline · opening this view never starts analysis.</p>
      </aside>
    </div>
  );
}
