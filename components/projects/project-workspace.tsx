"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { InitialPlanGeneration } from "@/components/projects/initial-plan-generation";
import { ProjectRipple } from "@/components/projects/project-ripple";
import type { ProjectPlan } from "@/lib/planning/initial-plan-approval";
import type { SourceBlock } from "@/lib/ingestion/contracts";
import type { Project } from "@/lib/projects/schemas";
import type { SceneReviewRevision } from "@/lib/scripts/scene-review-state";
import type { ScriptVersion } from "@/lib/scripts/schemas";

type ApiError = { error?: string | { code?: string; message?: string } };

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}
function errorMessage(payload: ApiError | null, fallback: string) {
  if (typeof payload?.error === "string") return payload.error;
  return payload?.error?.message ?? payload?.error?.code ?? fallback;
}

export function ProjectWorkspace({ projects }: { projects: Project[] }) {
  return <main className="project-shell"><header className="project-header"><div><p className="overline">ScriptOps / private productions</p><h1>Projects</h1></div><Link className="project-primary-action" href="/projects/new">New project</Link></header>{projects.length === 0 ? <section className="project-empty-state"><p className="overline">No production selected</p><h2>Start with a production brief.</h2><p>Create a project, confirm planning assumptions, then upload a screenplay in the next step.</p><Link className="project-primary-action" href="/projects/new">Create project</Link></section> : <section className="project-list" aria-label="Projects">{projects.map((project) => <Link className="project-card" href={`/projects/${project.id}`} key={project.id}><span>{project.lifecycle}</span><h2>{project.title}</h2><p>{project.approvedPlanVersion > 0 ? `Plan v${project.approvedPlanVersion} approved` : project.acceptedSceneRevisionId ? "Scenes accepted; plan generation is next" : project.activeScriptVersionId ? "Screenplay in progress" : "No screenplay yet"}</p></Link>)}</section>}<p className="project-demo-link"><Link href="/demo">Open the isolated demo</Link></p></main>;
}

export function NewProjectForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setPending(true); setError(null);
    const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ title: data.get("title"), planningInputs: { countryCode: data.get("countryCode"), regionCode: data.get("regionCode"), currency: data.get("currency"), assumptions: [], budgetCeiling: null, shootWindow: null, targetHoursPerDay: null, supportProfileVersion: "pilot-v1" } }) }).catch(() => null);
    const payload = response ? await readJson<{ project?: Project } & ApiError>(response) : null;
    setPending(false);
    if (!response?.ok || !payload?.project) { setError(errorMessage(payload, "Project creation could not be completed.")); return; }
    router.push(`/projects/${payload.project.id}`); router.refresh();
  }
  return <main className="project-shell"><header className="project-header"><div><p className="overline">New production</p><h1>Create project</h1></div><Link href="/projects">Back to projects</Link></header><form className="project-form" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label>Production title<input name="title" required maxLength={200} placeholder="Working title" /></label><div className="project-form-grid"><label>Country<input name="countryCode" required defaultValue="US" maxLength={2} /></label><label>Region<input name="regionCode" required defaultValue="US-NM" maxLength={20} /></label><label>Currency<input name="currency" required defaultValue="USD" maxLength={3} /></label></div><p>These assumptions create an empty production workspace. They do not create a sample plan.</p>{error ? <p role="alert" className="project-form-error">{error}</p> : null}<button className="project-primary-action" disabled={pending} type="submit">{pending ? "Creating…" : "Create empty project"}</button></form></main>;
}

export function ProjectEmptyWorkspace({ project, script, revision, sourceBlocks = [], planningEnabled = false, approvedPlan = null }: { planningEnabled?: boolean; approvedPlan?: ProjectPlan | null; project: Project; script: ScriptVersion | null; revision: SceneReviewRevision | null; sourceBlocks?: SourceBlock[] }) {
  const canUpload = project.lifecycle === "active" && project.approvedPlanVersion === 0 && !script;
  return <main className="project-shell"><header className="project-header"><div><p className="overline">{project.lifecycle} production</p><h1>{project.title}</h1></div><Link href="/projects">All projects</Link></header><ProjectLifecycleControls project={project} />{project.lifecycle === "deleting" ? <section className="project-empty-state"><p className="overline">Deletion in progress</p><h2>Removing this production.</h2><p>Uploads, source blocks, jobs, plans, and their object generations are being removed. The page will no longer be available when cleanup finishes.</p></section> : <>{!script ? <section className="project-empty-state"><p className="overline">Setup complete</p><h2>No screenplay uploaded.</h2><p>Your planning profile is saved. Upload a PDF or Final Draft file; no baseline plan exists yet.</p><UploadScreenplay projectId={project.id} disabled={!canUpload} /></section> : script.status !== "review-ready" ? <section className="project-empty-state"><p className="overline">Screenplay received</p><h2>Preparing scene review.</h2><p>{script.originalFilename} is {script.status.replaceAll("-", " ")}. This workspace will unlock once extraction has completed.</p></section> : <SceneReviewWorkspace project={project} script={script} initialRevision={revision} sourceBlocks={sourceBlocks} />}{planningEnabled && project.lifecycle === "active" && project.acceptedSceneRevisionId && project.approvedPlanVersion === 0 ? <InitialPlanGeneration key={project.acceptedSceneRevisionId} projectId={project.id} activeJobId={project.activeJobId} /> : null}{planningEnabled && project.lifecycle === "active" && approvedPlan ? <ProjectRipple key={`${approvedPlan.id}-${project.activeJobId ?? "ready"}`} projectId={project.id} plan={approvedPlan} activeJobId={project.activeJobId} /> : null}</>}</main>;
}

function ProjectLifecycleControls({ project }: { project: Project }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmationTitle, setConfirmationTitle] = useState("");
  async function update(lifecycle: "active" | "archived") {
    setPending(true); setNotice(null);
    const response = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordVersion: project.recordVersion, lifecycle }) }).catch(() => null);
    const payload = response ? await readJson<ApiError>(response) : null;
    setPending(false);
    if (!response?.ok) { setNotice(errorMessage(payload, "The project state could not be updated.")); return; }
    router.refresh();
  }
  async function remove() {
    setPending(true); setNotice(null);
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordVersion: project.recordVersion, confirmationTitle }) }).catch(() => null);
    const payload = response ? await readJson<ApiError>(response) : null;
    setPending(false);
    if (!response?.ok) { setNotice(errorMessage(payload, "Deletion could not be started.")); return; }
    setNotice("Deletion is queued. This page will close once cleanup completes."); router.refresh();
  }
  if (project.lifecycle === "deleting") return null;
  return <section className="project-lifecycle" aria-label="Project lifecycle"><p>{project.lifecycle === "archived" ? "Archived projects are read-only and can be restored." : "Archive pauses production work. Delete permanently removes application data."}</p><div>{project.lifecycle === "active" ? <button type="button" disabled={pending} onClick={() => void update("archived")}>Archive</button> : <button type="button" disabled={pending} onClick={() => void update("active")}>Restore</button>}<button type="button" className="project-danger-action" disabled={pending} onClick={() => { setConfirmingDelete(true); setConfirmationTitle(""); }}>Delete project</button></div>{confirmingDelete ? <form className="project-delete-confirmation" onSubmit={(event) => { event.preventDefault(); void remove(); }}><label>Type <strong>{project.title}</strong> to permanently delete this project.<input value={confirmationTitle} onChange={(event) => setConfirmationTitle(event.target.value)} autoComplete="off" required disabled={pending} /></label><div><button type="button" disabled={pending} onClick={() => { setConfirmingDelete(false); setConfirmationTitle(""); }}>Cancel</button><button type="submit" className="project-danger-action" disabled={pending || confirmationTitle !== project.title}>Permanently delete</button></div></form> : null}{notice ? <p role="status">{notice}</p> : null}</section>;
}

function UploadScreenplay({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) { setNotice("Choose a PDF or .fdx file first."); return; }
    const contentType = file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/xml";
    setPending(true); setNotice(null);
    const reservationResponse = await fetch(`/api/projects/${projectId}/uploads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, declaredBytes: file.size, contentType }) }).catch(() => null);
    const reservation = reservationResponse ? await readJson<{ uploadId: string; writeUrl: string } & ApiError>(reservationResponse) : null;
    if (!reservationResponse?.ok || !reservation?.uploadId || !reservation.writeUrl) { setPending(false); setNotice(errorMessage(reservation, "Upload could not be reserved.")); return; }
    const written = await fetch(reservation.writeUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file }).then(response => response.ok).catch(() => false);
    if (!written) { setPending(false); setNotice("File transfer failed. You can choose the file again."); return; }
    const finalizedResponse = await fetch(`/api/projects/${projectId}/uploads/${reservation.uploadId}/finalize`, { method: "POST" }).catch(() => null);
    setPending(false);
    if (!finalizedResponse?.ok) { setNotice("The uploaded file could not be verified."); return; }
    setNotice("Screenplay verified. Parsing is now being prepared.");
  }
  return <div className="project-upload"><label>Screenplay file<input ref={input} type="file" accept="application/pdf,.pdf,.fdx,application/xml,text/xml" disabled={disabled || pending} /></label><button className="project-primary-action" type="button" disabled={disabled || pending} onClick={() => void upload()}>{pending ? "Uploading…" : "Upload screenplay"}</button>{notice ? <p role="status">{notice}</p> : null}</div>;
}

function SceneReviewWorkspace({ project, script, initialRevision, sourceBlocks }: { project: Project; script: ScriptVersion; initialRevision: SceneReviewRevision | null; sourceBlocks: SourceBlock[] }) {
  const router = useRouter();
  const [revision, setRevision] = useState(initialRevision);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acknowledgedWarningIds, setAcknowledgedWarningIds] = useState<string[]>(() => initialRevision?.warnings.filter(warning => warning.acknowledged).map(warning => warning.id) ?? []);
  const blocksById = useMemo(() => new Map(sourceBlocks.map(block => [block.id, block])), [sourceBlocks]);
  async function createDraft() {
    setPending(true); setNotice(null);
    const response = await fetch(`/api/projects/${project.id}/scripts/${script.id}/scene-reviews`, { method: "POST" }).catch(() => null);
    const payload = response ? await readJson<SceneReviewRevision & ApiError>(response) : null;
    setPending(false);
    if (!response?.ok || !payload?.id) { setNotice(errorMessage(payload, "Scene review could not be created.")); return; }
    setRevision(payload); setAcknowledgedWarningIds(payload.warnings.filter(warning => warning.acknowledged).map(warning => warning.id)); router.refresh();
  }
  async function edit(body: Record<string, unknown>) {
    if (!revision || revision.status !== "draft") return;
    setPending(true); setNotice(null);
    const response = await fetch(`/api/projects/${project.id}/scene-reviews/${revision.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, editVersion: revision.editVersion }) }).catch(() => null);
    const payload = response ? await readJson<SceneReviewRevision & ApiError>(response) : null;
    setPending(false);
    if (!response?.ok || !payload?.id) { setNotice(errorMessage(payload, "The scene change could not be saved.")); return; }
    setRevision(payload);
  }
  async function accept() {
    if (!revision || revision.status !== "draft") return;
    setPending(true); setNotice(null);
    const response = await fetch(`/api/projects/${project.id}/scene-reviews/${revision.id}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editVersion: revision.editVersion, acknowledgedWarningIds }) }).catch(() => null);
    const payload = response ? await readJson<{ revision?: SceneReviewRevision } & ApiError>(response) : null;
    setPending(false);
    if (!response?.ok || !payload?.revision) { setNotice(errorMessage(payload, "Scene review could not be accepted.")); return; }
    setRevision(payload.revision); setNotice("Scene review accepted. Initial plan generation is the next build stage."); router.refresh();
  }
  if (!revision) return <section className="project-empty-state"><p className="overline">Screenplay parsed</p><h2>Review {script.originalFilename}</h2><p>Confirm the extracted scene headings and any parser warnings before a planning job can spend generation budget.</p><button className="project-primary-action" disabled={pending} onClick={() => void createDraft()}>{pending ? "Preparing…" : "Start scene review"}</button>{notice ? <p role="status">{notice}</p> : null}</section>;
  const excludedSourceIds = revision.warnings.filter(warning => warning.code === "TEXT_OUTSIDE_SCENE").flatMap(warning => warning.sourceIds).filter(sourceId => !revision.scenes.some(scene => scene.sourceSpans.some(span => span.sourceId === sourceId)));
  return <section className="project-review" aria-label="Scene review"><header className="project-review-header"><div><p className="overline">Scene review · {script.originalFilename}</p><h2>{revision.status === "accepted" ? "Scenes accepted" : "Correct the extracted scene list"}</h2><p>Every scene retains links to its uploaded source. Changes use a version check so a stale browser cannot overwrite a newer correction.</p></div><span className={`project-review-status project-review-status-${revision.status}`}>{revision.status}</span></header>{revision.warnings.length > 0 ? <fieldset className="project-warnings" disabled={revision.status === "accepted" || pending}><legend>Parser warnings must be acknowledged</legend>{revision.warnings.map(warning => <label key={warning.id}><input type="checkbox" checked={acknowledgedWarningIds.includes(warning.id)} onChange={(event) => setAcknowledgedWarningIds(current => event.target.checked ? [...current, warning.id] : current.filter(id => id !== warning.id))} />{warning.code.replaceAll("_", " ")}</label>)}</fieldset> : null}{excludedSourceIds.length > 0 ? <section className="project-restore-source"><h3>Restore excluded source blocks</h3><p>These blocks cannot be accepted as a warning alone. Give each a scene heading and restore it to the ordered scene list.</p>{excludedSourceIds.map(sourceId => <form key={sourceId} onSubmit={(event) => { event.preventDefault(); const heading = new FormData(event.currentTarget).get("heading"); if (typeof heading === "string") void edit({ action: "restore", sourceBlockId: sourceId, reviewedHeading: heading, insertAfterSceneId: null }); }}><code>{sourceId}</code><input name="heading" required maxLength={500} placeholder="Scene heading" disabled={pending} /><button type="submit" disabled={pending}>Restore as scene</button><pre>{blocksById.get(sourceId)?.text ?? "Source block is unavailable."}</pre></form>)}</section> : null}<ol className="project-scene-list">{revision.scenes.map((scene, index) => <li key={scene.id} className="project-review-scene"><form onSubmit={(event) => { event.preventDefault(); const heading = new FormData(event.currentTarget).get("heading"); if (typeof heading === "string") void edit({ action: "rename", sceneId: scene.id, reviewedHeading: heading }); }}><label><span>Scene {scene.displayNumber ?? scene.ordinal}</span><input name="heading" defaultValue={scene.reviewedHeading} disabled={revision.status === "accepted" || pending} /></label><div className="project-scene-actions">{revision.status === "draft" ? <><button type="submit" disabled={pending}>Save heading</button>{scene.sourceSpans.length > 1 ? <button type="button" disabled={pending} onClick={() => void edit({ action: "split", sceneId: scene.id, sourceSpanIndex: 1 })}>Split after first source block</button> : null}{index < revision.scenes.length - 1 ? <button type="button" disabled={pending} onClick={() => void edit({ action: "merge", firstSceneId: scene.id })}>Merge next</button> : null}</> : null}</div><details><summary>Show source ({scene.sourceSpans.length} block{scene.sourceSpans.length === 1 ? "" : "s"})</summary>{scene.sourceSpans.map(span => <pre key={`${span.sourceId}-${span.blockIndex}`}>{blocksById.get(span.sourceId)?.text ?? "Source block is unavailable."}</pre>)}</details></form></li>)}</ol>{revision.status === "draft" ? <button className="project-primary-action" disabled={pending} onClick={() => void accept()}>{pending ? "Saving…" : "Accept scenes for planning"}</button> : <button className="project-primary-action" disabled={pending} onClick={() => void reopen(project, revision, setRevision, setAcknowledgedWarningIds, setPending, setNotice, router)}>Reopen scene review</button>}{notice ? <p role="status" className="project-form-error">{notice}</p> : null}</section>;
}

async function reopen(project: Project, revision: SceneReviewRevision, setRevision: (revision: SceneReviewRevision) => void, setAcknowledgedWarningIds: (warningIds: string[]) => void, setPending: (pending: boolean) => void, setNotice: (notice: string | null) => void, router: ReturnType<typeof useRouter>) {
  setPending(true); setNotice(null);
  const response = await fetch(`/api/projects/${project.id}/scene-reviews/${revision.id}/reopen`, { method: "POST" }).catch(() => null);
  const payload = response ? await readJson<{ revision?: SceneReviewRevision } & ApiError>(response) : null;
  setPending(false);
  if (!response?.ok || !payload?.revision) { setNotice(errorMessage(payload, "Scene review could not be reopened.")); return; }
  setRevision(payload.revision); setAcknowledgedWarningIds(payload.revision.warnings.filter(warning => warning.acknowledged).map(warning => warning.id)); router.refresh();
}
