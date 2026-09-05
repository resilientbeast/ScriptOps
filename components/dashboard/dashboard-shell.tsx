"use client";

import { useCallback, useEffect, useState } from "react";

import { ArtifactGrid } from "@/components/dashboard/artifact-grid";
import { buildArtifactSummaries } from "@/components/dashboard/dashboard-model";
import { DetailDrawer } from "@/components/dashboard/detail-drawer";
import { ProductionHeader } from "@/components/dashboard/production-header";
import { ScenePanel } from "@/components/dashboard/scene-panel";
import type {
  ArtifactKey,
  DashboardSnapshot,
} from "@/components/dashboard/types";
import { ActivityRail } from "@/components/ripple/activity-rail";
import { ProposalReview } from "@/components/ripple/proposal-review";
import { RevisionComposer } from "@/components/ripple/revision-composer";
import { GOLDEN_REQUEST } from "@/lib/domain/golden-invariants";
import type { PublicRippleRun } from "@/lib/ripple/contracts";

const terminalRunStatuses = new Set([
  "rejected",
  "proposal_ready",
  "failed",
  "discarded",
  "approved",
  "superseded",
]);

export function DashboardShell({
  initialSnapshot,
  authConfigured,
}: {
  initialSnapshot: DashboardSnapshot;
  authConfigured: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedSceneId, setSelectedSceneId] = useState("scene-14");
  const [activeArtifact, setActiveArtifact] = useState<ArtifactKey | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [requestText, setRequestText] = useState(GOLDEN_REQUEST);
  const [activeRun, setActiveRun] = useState<PublicRippleRun | null>(null);
  const [observedRunId, setObservedRunId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [composerFocusToken, setComposerFocusToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/demo", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Demo sync failed");
        return (await response.json()) as DashboardSnapshot;
      })
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        if (nextSnapshot.openRun) {
          setActiveRun(nextSnapshot.openRun);
          setObservedRunId(
            terminalRunStatuses.has(nextSnapshot.openRun.status)
              ? null
              : nextSnapshot.openRun.runId,
          );
        } else {
          setActiveRun(null);
          setObservedRunId(null);
        }
        setSyncState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSyncState("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!observedRunId) return;
    let stopped = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const source = new EventSource(`/api/ripples/${observedRunId}/events`);

    const applyRun = (run: PublicRippleRun) => {
      if (stopped) return;
      setActiveRun(run);
      if (terminalRunStatuses.has(run.status)) {
        source.close();
        if (pollTimer) clearInterval(pollTimer);
      }
    };
    const poll = async () => {
      const response = await fetch(`/api/ripples/${observedRunId}`, {
        headers: { Accept: "application/json" },
      }).catch(() => null);
      if (!response?.ok) return;
      const payload = (await response.json()) as { run: PublicRippleRun };
      applyRun(payload.run);
    };
    const startPolling = () => {
      if (pollTimer || stopped) return;
      void poll();
      pollTimer = setInterval(() => void poll(), 1_500);
    };

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { run?: PublicRippleRun };
        if (payload.run) applyRun(payload.run);
      } catch {
        source.close();
        startPolling();
      }
    };
    source.onerror = () => {
      source.close();
      startPolling();
    };

    // A ready proposal can be persisted before a freshly mounted EventSource has
    // attached its first message handler. Read once immediately so a reload always
    // restores terminal runs as well as in-flight progress.
    void poll();

    return () => {
      stopped = true;
      source.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [observedRunId]);

  const closeDrawer = useCallback(() => setActiveArtifact(null), []);
  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }, []);
  const handleSceneSelect = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);
    setRequestText(sceneId === "scene-14" ? GOLDEN_REQUEST : "");
  }, []);
  const handleRunStarted = useCallback((run: PublicRippleRun) => {
    setActiveRun(run);
    setObservedRunId(run.runId);
    setDecisionNotice(null);
  }, []);
  const applySnapshot = useCallback((nextSnapshot: DashboardSnapshot) => {
    setSnapshot(nextSnapshot);
    setObservedRunId(null);
  }, []);
  const decide = useCallback(async (path: string) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      snapshot?: DashboardSnapshot;
      run?: PublicRippleRun;
      error?: { message?: string };
    };
    if (!response.ok || !payload.snapshot) {
      throw new Error(payload.error?.message ?? "The producer decision could not be completed.");
    }
    return payload;
  }, []);
  const handleApprove = useCallback(async () => {
    if (!activeRun) return;
    setDecisionPending(true);
    setDecisionNotice(null);
    try {
      const payload = await decide(`/api/ripples/${activeRun.runId}/approve`);
      applySnapshot(payload.snapshot!);
      setActiveRun(payload.run ?? null);
      setDecisionNotice("Approved. Plan v2 now contains all five validated updates.");
    } catch (error) {
      setDecisionNotice(error instanceof Error ? error.message : "Approval could not be completed.");
    } finally {
      setDecisionPending(false);
    }
  }, [activeRun, applySnapshot, decide]);
  const handleDiscard = useCallback(async (editAndRerun = false) => {
    if (!activeRun) return;
    const priorRequest = activeRun.requestText;
    setDecisionPending(true);
    setDecisionNotice(null);
    try {
      const payload = await decide(`/api/ripples/${activeRun.runId}/discard`);
      applySnapshot(payload.snapshot!);
      setActiveRun(null);
      if (editAndRerun) {
        setRequestText(priorRequest);
        setComposerFocusToken((token) => token + 1);
        setDecisionNotice("Proposal replaced safely. Edit the request, then run a new complete analysis.");
      } else {
        setDecisionNotice("Proposal discarded. The approved baseline remains unchanged.");
      }
    } catch (error) {
      setDecisionNotice(error instanceof Error ? error.message : "Discard could not be completed.");
    } finally {
      setDecisionPending(false);
    }
  }, [activeRun, applySnapshot, decide]);
  const handleReset = useCallback(async () => {
    setDecisionPending(true);
    setDecisionNotice(null);
    try {
      const payload = await decide("/api/demo/reset");
      applySnapshot(payload.snapshot!);
      setActiveRun(null);
      setSelectedSceneId("scene-14");
      setRequestText(GOLDEN_REQUEST);
      setDecisionNotice("Demo reset to its immutable baseline. The shared daily allowance was not changed.");
    } catch (error) {
      setDecisionNotice(error instanceof Error ? error.message : "Reset could not be completed.");
    } finally {
      setDecisionPending(false);
    }
  }, [applySnapshot, decide]);
  const selectedScene =
    snapshot.currentPlan.scenes.find((scene) => scene.id === selectedSceneId) ??
    snapshot.currentPlan.scenes.at(-1)!;
  const artifactSummaries = buildArtifactSummaries(snapshot.currentPlan);
  const analysisActive = activeRun?.status === "queued" || activeRun?.status === "analyzing";
  const proposalReady = activeRun?.status === "proposal_ready" && activeRun.proposal;
  const evidenceFooter = proposalReady
    ? `Evidence: ${proposalReady.evidence.sourceMode === "live" ? "live Parallel" : "cached Parallel fallback"} · ${proposalReady.evidence.records.length} sources`
    : snapshot.currentPlan.revisionRecord
      ? `Evidence: ${snapshot.currentPlan.revisionRecord.evidenceSourceMode === "live" ? "live Parallel" : "cached Parallel fallback"} approval`
      : "Evidence: bundled baseline";
  const composerDisabled = Boolean(
    analysisActive || proposalReady || snapshot.hasApprovedRipple || snapshot.dailyCapReached || decisionPending,
  );
  const composerDisabledMessage = analysisActive
    ? "Analysis in progress"
    : proposalReady
      ? "Review the proposal below"
      : snapshot.hasApprovedRipple
        ? "Reset demo for another ripple"
        : snapshot.dailyCapReached
          ? "Shared daily limit reached"
          : "Producer decision in progress";
  const resetAvailable =
    snapshot.hasApprovedRipple ||
    activeRun?.status === "failed" ||
    activeRun?.status === "rejected" ||
    decisionNotice?.startsWith("Proposal discarded") === true;

  return (
    <main className="dashboard-shell" data-theme={theme}>
      <nav className="app-rail" aria-label="ScriptOps workspace">
        <a className="brand-lockup" href="#workspace" aria-label="ScriptOps workspace">
          <span className="brand-mark" aria-hidden="true">SO</span>
          <span>ScriptOps</span>
        </a>
        <div className="rail-center" aria-label="Workspace status">
          <span className="rail-node rail-node-active" />
          <span className="rail-line" />
          <span className="rail-node" />
          <span className="rail-line" />
          <span className="rail-node" />
        </div>
        <span className="rail-code">NM / 01</span>
      </nav>

      <ScenePanel
        scenes={snapshot.currentPlan.scenes}
        selectedSceneId={selectedScene.id}
        onSelect={handleSceneSelect}
        disabled={analysisActive}
      />

      <section className="workspace" id="workspace">
        <ProductionHeader
          snapshot={snapshot}
          authConfigured={authConfigured}
          syncState={syncState}
          theme={theme}
          onToggleTheme={toggleTheme}
          onResetDemo={resetAvailable ? handleReset : undefined}
          resetPending={decisionPending}
        />

        <section className="scene-focus" aria-labelledby="scene-focus-heading">
          <div className="scene-focus-index">
            <span>Selected scene</span>
            <strong>{String(selectedScene.sceneNumber).padStart(2, "0")}</strong>
          </div>
          <div className="scene-focus-copy">
            <div className="scene-heading-row">
              <div>
                <p className="scene-slug">{selectedScene.heading}</p>
                <h2 id="scene-focus-heading">{selectedScene.summary}</h2>
              </div>
              <div className="scene-tags" aria-label="Scene requirements">
                <span>{selectedScene.setting.replace("-", " / ")}</span>
                <span>{selectedScene.requirements.timeOfDay}</span>
                <span>{selectedScene.requirements.castRoleIds.length} cast</span>
              </div>
            </div>
            <blockquote>“{selectedScene.excerpt}”</blockquote>
            <RevisionComposer
              sceneNumber={selectedScene.sceneNumber}
              sceneId={selectedScene.id}
              requestText={requestText}
              disabled={composerDisabled}
              disabledMessage={composerDisabledMessage}
              focusToken={composerFocusToken}
              onRequestTextChange={setRequestText}
              onRunStarted={handleRunStarted}
            />
          </div>
        </section>

        <ActivityRail run={activeRun} />

        {proposalReady ? (
          <ProposalReview
            proposal={proposalReady}
            pending={decisionPending}
            onApprove={() => void handleApprove()}
            onDiscard={() => void handleDiscard()}
            onEditAndRerun={() => void handleDiscard(true)}
          />
        ) : null}

        {decisionNotice ? <p className="decision-notice" role="status">{decisionNotice}</p> : null}

        {snapshot.dailyCapReached ? (
          <p className="cap-notice" role="status">Today’s shared analysis allowance is reached. You can still review evidence, approve a ready proposal, reset this browser demo, and export an approved plan.</p>
        ) : null}

        <ArtifactGrid
          artifacts={artifactSummaries}
          onOpen={setActiveArtifact}
          proposalReady={Boolean(proposalReady)}
        />

        <footer className="workspace-footer">
          <span>Fixture {snapshot.currentPlan.fixtureVersion}</span>
          <span>{evidenceFooter}</span>
          <span>Cycle {snapshot.cycle}</span>
        </footer>
      </section>

      <DetailDrawer
        artifact={activeArtifact}
        plan={snapshot.currentPlan}
        scene={selectedScene}
        proposal={proposalReady || null}
        onClose={closeDrawer}
      />
      <span className="sr-only" aria-live="polite">
        {syncState === "ready"
          ? "Browser workspace synchronized"
          : syncState === "error"
            ? "Workspace sync unavailable; verified baseline shown"
            : "Synchronizing browser workspace"}
      </span>
    </main>
  );
}
