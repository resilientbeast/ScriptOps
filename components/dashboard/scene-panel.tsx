import type { SceneBreakdown } from "@/lib/domain/types";

export function ScenePanel({
  scenes,
  selectedSceneId,
  onSelect,
}: {
  scenes: SceneBreakdown[];
  selectedSceneId: string;
  onSelect: (sceneId: string) => void;
}) {
  return (
    <aside className="scene-panel" aria-label="Screenplay scenes">
      <div className="scene-panel-heading">
        <div>
          <p className="overline">Source screenplay</p>
          <h2>Scenes</h2>
        </div>
        <span>{scenes.length}</span>
      </div>
      <div className="scene-list">
        {scenes.map((scene) => {
          const selected = scene.id === selectedSceneId;
          return (
            <button
              className="scene-list-item"
              data-selected={selected}
              key={scene.id}
              onClick={() => onSelect(scene.id)}
              type="button"
              aria-pressed={selected}
            >
              <span>{String(scene.sceneNumber).padStart(2, "0")}</span>
              <span>
                <strong>{scene.location}</strong>
                <small>{scene.requirements.timeOfDay}</small>
              </span>
              <span className="scene-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          );
        })}
      </div>
      <div className="source-meta">
        <span>Demo draft 1.0</span>
        <span>20 pp.</span>
      </div>
    </aside>
  );
}
