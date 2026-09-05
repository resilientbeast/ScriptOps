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
        if (nextSnapshot.openRunId) setObservedRunId(nextSnapshot.openRunId);
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
  }, []);
  const selectedScene =
    snapshot.currentPlan.scenes.find((scene) => scene.id === selectedSceneId) ??
    snapshot.currentPlan.scenes.at(-1)!;
  const artifactSummaries = buildArtifactSummaries(snapshot.currentPlan);
  const analysisActive = activeRun?.status === "queued" || activeRun?.status === "analyzing";

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
              disabled={analysisActive}
              onRequestTextChange={setRequestText}
              onRunStarted={handleRunStarted}
            />
          </div>
        </section>

        <ActivityRail run={activeRun} />

        <ArtifactGrid artifacts={artifactSummaries} onOpen={setActiveArtifact} />

        <footer className="workspace-footer">
          <span>Fixture {snapshot.currentPlan.fixtureVersion}</span>
          <span>Evidence: bundled baseline</span>
          <span>Cycle {snapshot.cycle}</span>
        </footer>
      </section>

      <DetailDrawer
        artifact={activeArtifact}
        plan={snapshot.currentPlan}
        scene={selectedScene}
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
