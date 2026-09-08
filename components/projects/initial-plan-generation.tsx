"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectJob } from "@/lib/jobs/schemas";
import type { InitialPlanManifest } from "@/lib/planning/initial-plan-manifest";

type Progress = { job: ProjectJob; stage: string; completedStages: number; totalStages: number; failure: string | null };
type Proposal = { manifest: InitialPlanManifest };

export function InitialPlanGeneration({ projectId, activeJobId }: { projectId: string; activeJobId: string | null }) {
  const router = useRouter();
  const [jobId, setJobId] = useState(activeJobId);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`/api/projects/${projectId}/initial-plans/${jobId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Generation progress is unavailable. Reload to try again.");
        const payload = await response.json() as Progress;
        if (cancelled) return;
        setProgress(payload); setError(null);
        if (["queued", "running"].includes(payload.job.status)) timer = setTimeout(() => void poll(), 3000);
      } catch {
        if (!cancelled) { setError("Generation progress is unavailable. Work can continue while this page is closed."); timer = setTimeout(() => void poll(), 10_000); }
      }
    }
    void poll();
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [projectId, jobId]);

  useEffect(() => {
    if (!jobId || progress?.job.status !== "proposal-ready") return;
    let cancelled = false;
    async function loadProposal() {
      const response = await fetch(`/api/projects/${projectId}/initial-plans/${jobId}/review`, { cache: "no-store" }).catch(() => null);
      const payload = response ? await response.json().catch(() => null) as Proposal | null : null;
      if (cancelled) return;
      if (!response?.ok || !payload?.manifest) { setError("The saved draft could not be loaded for review."); return; }
      setProposal(payload); setError(null);
    }
    void loadProposal();
    return () => { cancelled = true; };
  }, [jobId, progress?.job.status, projectId]);

  async function start() {
    setPending(true); setError(null);
    key.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/projects/${projectId}/initial-plans`, { method: "POST", headers: { "Idempotency-Key": key.current } });
      const payload = await response.json() as { job?: ProjectJob; error?: string };
      if (!response.ok || !payload.job) {
        if (response.status === 409) key.current = null;
        throw new Error(payload.error ?? "Initial generation could not start.");
      }
      setProgress(null); setProposal(null); setJobId(payload.job.id); key.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Initial generation could not start."); }
    finally { setPending(false); }
  }

  async function reviewAction(action: "approve" | "discard") {
    if (!jobId) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/initial-plans/${jobId}/${action}`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `The draft could not be ${action === "approve" ? "approved" : "discarded"}.`);
      setProgress(null); setProposal(null); setJobId(null);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The review action could not be completed."); }
    finally { setPending(false); }
  }

  const terminal = progress && ["failed", "superseded"].includes(progress.job.status);
  return <section className="project-empty-state" aria-label="Initial production plan">
    <p className="overline">Initial production plan</p>
    <h2>{progress?.job.status === "proposal-ready" ? "Your plan draft is ready." : "Turn accepted scenes into a production draft."}</h2>
    <p>Generate scene breakdowns, a shooting schedule, budget estimates, location recommendations and casting briefs. Generation uses Gemini and production research from Parallel. A draft does not become an approved baseline automatically.</p>
    {jobId && !progress ? <p role="status">Loading saved generation progress…</p> : null}
    {progress ? <p role="status">{progress.job.status.replaceAll("-", " ")} · {progress.completedStages} of {progress.totalStages} stages complete{progress.job.status === "running" ? ` · ${progress.stage.replaceAll("-", " ")}` : ""}</p> : null}
    {progress?.job.status === "proposal-ready" ? <p>The complete draft is saved and awaits producer review.</p> : null}
    {proposal ? <InitialPlanReview proposal={proposal.manifest} pending={pending} onApprove={() => void reviewAction("approve")} onDiscard={() => void reviewAction("discard")} /> : null}
    {terminal ? <p role="alert">{progress.failure ?? "Generation stopped before creating a complete draft."}</p> : null}
    {!jobId || terminal ? <button className="project-primary-action" disabled={pending} onClick={() => void start()}>{pending ? "Starting…" : terminal ? "Start a new generation" : "Generate initial plan"}</button> : null}
    {error ? <p role="alert" className="project-form-error">{error}</p> : null}
  </section>;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function InitialPlanReview({ proposal, pending, onApprove, onDiscard }: { proposal: InitialPlanManifest; pending: boolean; onApprove: () => void; onDiscard: () => void }) {
  const plan = proposal.draft.plan;
  return <section className="project-plan-review" aria-label="Initial plan review">
    <header><p className="overline">Draft review</p><h3>{plan.title}</h3>{plan.logline ? <p>{plan.logline}</p> : null}<p>Manifest {proposal.id} · created {new Date(proposal.createdAt).toLocaleString()}</p></header>
    <div className="project-plan-review-grid">
      <section><h4>Schedule</h4><p>{plan.schedule.shootDays} shoot days across {plan.scenes.length} scenes.</p><ol>{plan.schedule.days.map(day => <li key={day.id}>Day {day.dayNumber}: {day.label} · {day.estimatedHours} hours · {day.sceneIds.length} scenes</li>)}</ol></section>
      <section><h4>Budget</h4><p>{money(plan.budget.low, plan.budget.currency)}–{money(plan.budget.high, plan.budget.currency)}</p><ul>{plan.budget.lineItems.map(item => <li key={item.id}>{item.category}: {money(item.low, plan.budget.currency)}–{money(item.high, plan.budget.currency)}</li>)}</ul></section>
      <section><h4>Locations</h4><ul>{plan.locations.map(location => <li key={location.id}><strong>{location.name}</strong>, {location.locality} — {location.fit}</li>)}</ul></section>
      <section><h4>Casting</h4>{plan.casting.length ? <ul>{plan.casting.map(brief => <li key={brief.id}><strong>{brief.roleName}</strong>: {brief.archetype}</li>)}</ul> : <p>No casting briefs were produced.</p>}</section>
    </div>
    <details><summary>Evidence and assumptions</summary><ul>{plan.evidence.map(record => <li key={record.id}><a href={record.url} rel="noreferrer" target="_blank">{record.title}</a></li>)}</ul><ul>{plan.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul></details>
    <p>Approving creates the immutable Plan v1 baseline. Discarding keeps this review record but clears the draft lock so you can generate again.</p>
    <div className="project-scene-actions"><button className="project-primary-action" disabled={pending} onClick={onApprove}>{pending ? "Saving…" : "Approve Plan v1"}</button><button disabled={pending} onClick={onDiscard}>Discard draft</button></div>
  </section>;
}
