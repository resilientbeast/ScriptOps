"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ProjectJob } from "@/lib/jobs/schemas";
import type { ProjectPlan } from "@/lib/planning/initial-plan-approval";
import type { ProjectRippleManifest } from "@/lib/planning/project-ripple-manifest";
import { planFromRecord, rippleDelta } from "@/lib/planning/project-ripple-contracts";

type Progress = { job: ProjectJob; stage: string; completedStages: number; totalStages: number; failure: string | null };

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0, signDisplay: "always" }).format(value);
}

export function ProjectRipple({ projectId, plan, activeJobId }: { projectId: string; plan: ProjectPlan; activeJobId: string | null }) {
  const router = useRouter();
  const [sceneId, setSceneId] = useState(plan.manifest.draft.plan.scenes[0]?.id ?? "");
  const [requestText, setRequestText] = useState("");
  const [jobId, setJobId] = useState(activeJobId);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [proposal, setProposal] = useState<ProjectRippleManifest | null>(null);
  const [history, setHistory] = useState<ProjectPlan[]>([plan]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/plans`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then((payload: { plans?: ProjectPlan[] } | null) => { if (!cancelled && payload?.plans) setHistory(payload.plans); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined; const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/ripples/${jobId}`, { cache: "no-store", signal: controller.signal });
        const payload = response.ok ? await response.json() as Progress : null;
        if (!payload) throw new Error();
        if (cancelled) return;
        setProgress(payload); setError(null);
        if (["queued", "running"].includes(payload.job.status)) timer = setTimeout(() => void poll(), 3000);
      } catch { if (!cancelled) { setError("Revision progress is temporarily unavailable. Reloading will reconnect."); timer = setTimeout(() => void poll(), 10_000); } }
    };
    void poll();
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [jobId, projectId]);

  useEffect(() => {
    if (!jobId || progress?.job.status !== "proposal-ready") return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/ripples/${jobId}/review`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then((payload: { manifest?: ProjectRippleManifest } | null) => {
      if (!cancelled && payload?.manifest) setProposal(payload.manifest);
      else if (!cancelled) setError("The saved revision could not be loaded for review.");
    }).catch(() => { if (!cancelled) setError("The saved revision could not be loaded for review."); });
    return () => { cancelled = true; };
  }, [jobId, progress?.job.status, projectId]);

  async function start() {
    if (requestText.trim().length < 10 || !sceneId) { setError("Choose a scene and describe a production change in at least 10 characters."); return; }
    setPending(true); setError(null); key.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/projects/${projectId}/ripples`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current }, body: JSON.stringify({ sceneId, requestText }) });
      const payload = await response.json().catch(() => null) as { job?: ProjectJob; error?: string } | null;
      if (!response.ok || !payload?.job) throw new Error(payload?.error ?? "Revision could not start.");
      setProgress(null); setProposal(null); setJobId(payload.job.id); key.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revision could not start."); }
    finally { setPending(false); }
  }

  async function action(name: "approve" | "discard") {
    if (!jobId) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/ripples/${jobId}/${name}`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `Revision could not be ${name}d.`);
      setJobId(null); setProgress(null); setProposal(null); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revision review could not be completed."); }
    finally { setPending(false); }
  }

  const base = planFromRecord(plan);
  const terminal = progress && ["failed", "superseded"].includes(progress.job.status);
  return <section className="project-empty-state project-ripple" aria-label="Project revision ripple">
    <p className="overline">Plan v{plan.planVersion} · revision ripple</p>
    <h2>Propose the next production plan.</h2>
    <p>Use an approved scene as the anchor. ScriptOps preserves screenplay facts and runs a fresh evidence search for the proposed revision. Review the operational impact before it can become Plan v{plan.planVersion + 1}.</p>
    {!jobId || terminal ? <div className="project-ripple-form"><label>Anchor scene<select value={sceneId} onChange={event => setSceneId(event.target.value)} disabled={pending}>{base.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.displayNumber ?? scene.id} · {scene.heading}</option>)}</select></label><label>Production change<textarea value={requestText} onChange={event => setRequestText(event.target.value)} minLength={10} maxLength={2000} placeholder="For example: move this exterior sequence to a rain cover day and assess the schedule, location, crew and cost impact." disabled={pending} /></label><button className="project-primary-action" disabled={pending} onClick={() => void start()}>{pending ? "Starting…" : terminal ? "Start a new revision" : `Propose Plan v${plan.planVersion + 1}`}</button></div> : null}
    {jobId && !progress ? <p role="status">Loading revision progress…</p> : null}
    {progress ? <p role="status">{progress.job.status.replaceAll("-", " ")} · {progress.completedStages} of {progress.totalStages} stages complete</p> : null}
    {proposal ? <RippleReview base={base} proposal={proposal} pending={pending} onApprove={() => void action("approve")} onDiscard={() => void action("discard")} /> : null}
    {terminal ? <p role="alert">{progress.failure ?? "Revision stopped before producing a complete proposal."}</p> : null}
    {history.length > 0 ? <details><summary>Approved plan history ({history.length})</summary><ol>{history.map(item => <li key={item.id}>Plan v{item.planVersion} · {item.kind} · approved {new Date(item.approvedAt).toLocaleString()} · <a href={`/api/projects/${projectId}/plans/${item.planVersion}/export`} download>Download approved PDF</a></li>)}</ol></details> : null}
    {error ? <p role="alert" className="project-form-error">{error}</p> : null}
  </section>;
}

function RippleReview({ base, proposal, pending, onApprove, onDiscard }: { base: ReturnType<typeof planFromRecord>; proposal: ProjectRippleManifest; pending: boolean; onApprove: () => void; onDiscard: () => void }) {
  const next = proposal.draft.plan; const delta = rippleDelta(base, next);
  const provenance = proposal.draft.evidenceProvenance;
  const evidenceDescription = provenance
    ? `Fresh Parallel research completed for this revision: ${provenance.freshRecordCount} sources retrieved ${new Date(provenance.searchedAt).toLocaleString()}.`
    : `Evidence retained from approved Plan v${proposal.basePlanVersion}; this revision did not run a new evidence search.`;
  const evidenceSummary = provenance
    ? `${next.evidence.length} fresh evidence records`
    : `${next.evidence.length} retained evidence records from Plan v${proposal.basePlanVersion}`;
  return <section className="project-plan-review" aria-label="Revision proposal review"><header><p className="overline">Plan v{proposal.basePlanVersion + 1} proposal</p><h3>{next.title}</h3><p>Anchored to scene {proposal.draft.sceneId} · created {new Date(proposal.createdAt).toLocaleString()}</p><p>{evidenceDescription}</p></header><div className="project-plan-review-grid"><section><h4>Schedule impact</h4><p>{next.schedule.shootDays} shoot days ({delta.shootDays >= 0 ? "+" : ""}{delta.shootDays})</p></section><section><h4>Budget impact</h4><p>{money(next.budget.low, next.currency)}–{money(next.budget.high, next.currency)}</p><p>{money(delta.budgetLow, delta.currency)} to {money(delta.budgetHigh, delta.currency)}</p></section><section><h4>Locations</h4><p>{next.locations.length} candidates ({delta.locationCount >= 0 ? "+" : ""}{delta.locationCount})</p></section><section><h4>Evidence</h4><p>{evidenceSummary}</p></section></div><details><summary>Proposal details</summary><p>{proposal.draft.requestText}</p><ul>{next.assumptions.map(note => <li key={note}>{note}</li>)}</ul><ul>{next.warnings.map(note => <li key={note}>{note}</li>)}</ul></details><p>Approve to create immutable Plan v{proposal.basePlanVersion + 1}; discard to release this proposal lock.</p><div className="project-scene-actions"><button className="project-primary-action" disabled={pending} onClick={onApprove}>{pending ? "Saving…" : `Approve Plan v${proposal.basePlanVersion + 1}`}</button><button disabled={pending} onClick={onDiscard}>Discard proposal</button></div></section>;
}
