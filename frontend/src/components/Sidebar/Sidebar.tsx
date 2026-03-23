import AppearancePanel from "./AppearancePanel";
import ToolsPanel from "./ToolsPanel";
import ClassificationPanel from "./ClassificationPanel";
import ScenePanel from "./ScenePanel";
import type { Dataset, Job } from "../../types/dataset";

interface Props {
  dataset: Dataset | null;
  job: Job | null;
  fps: number;
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

export default function Sidebar({ dataset, job, fps, onSettingsChange }: Props) {
  return (
    <aside className="sidebar">
      <AppearancePanel onSettingsChange={onSettingsChange} />
      <ToolsPanel />
      <ClassificationPanel />
      <ScenePanel dataset={dataset} job={job} fps={fps} />
    </aside>
  );
}
