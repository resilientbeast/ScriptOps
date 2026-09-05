"use client";

import { useRef, useState } from "react";

import type { PublicRippleRun } from "@/lib/ripple/contracts";

type StartResponse = {
  run?: PublicRippleRun;
  error?: { code?: string; message?: string };
};

export function RevisionComposer({
  sceneNumber,
  sceneId,
  requestText,
  disabled,
  onRequestTextChange,
  onRunStarted,
}: {
  sceneNumber: number;
  sceneId: string;
  requestText: string;
  disabled: boolean;
  onRequestTextChange: (value: string) => void;
  onRunStarted: (run: PublicRippleRun) => void;
}) {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startRipple() {
    if (submitting.current || disabled) return;
    submitting.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/ripples", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sceneId,
          requestText,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as StartResponse;
      if (payload.run) onRunStarted(payload.run);
      if (!response.ok) {
        setError(payload.error?.message ?? payload.run?.failure?.message ?? "Analysis could not be started.");
      }
    } catch {
      setError("The revision service is unreachable. Your baseline was not changed.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <div className="revision-composer">
      <div className="revision-composer-heading">
        <div>
          <span>Revision Ripple</span>
          <p>Type a change to Scene {sceneNumber} and watch it ripple through the whole plan.</p>
        </div>
        <span className="guidance-status">{disabled ? "Analysis in progress" : "Baseline protected"}</span>
      </div>
      <textarea
        aria-label={`Production change for Scene ${sceneNumber}`}
        disabled={disabled || pending}
        maxLength={2_000}
        onChange={(event) => onRequestTextChange(event.target.value)}
        placeholder="Change time of day, weather, cast, stunt, location, schedule, or budget requirements…"
        rows={3}
        value={requestText}
      />
      <div className="revision-composer-actions">
        <span>{requestText.trim().length}/2000</span>
        <button
          disabled={disabled || pending || requestText.trim().length < 10}
          onClick={startRipple}
          type="button"
        >
          {pending ? "Dispatching…" : "Analyze proposed ripple"}
        </button>
      </div>
      {error ? <p className="revision-error" role="alert">{error}</p> : null}
    </div>
  );
}

