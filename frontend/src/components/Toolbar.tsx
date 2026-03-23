import type { Dataset, Job } from "../types/dataset";

interface Props {
  datasets: Dataset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUploadClick: () => void;
  jobs: Record<string, Job>;
}

function datasetLabel(d: Dataset, job?: Job): string {
  if (job && (d.status === "processing" || d.status === "uploaded") && (job.status === "processing" || job.status === "pending")) {
    return `${d.name} (converting ${job.progress.toFixed(0)}%)`;
  }
  if (d.status === "failed") {
    return `${d.name} (failed)`;
  }
  return `${d.name} (${d.status})`;
}

export default function Toolbar({ datasets, selectedId, onSelect, onUploadClick, jobs }: Props) {
  return (
    <header className="toolbar">
      <span className="logo">LiDAR Viewer</span>
      <button className="btn-primary" onClick={onUploadClick}>Upload Dataset</button>
      <select value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
        <option value="">Select dataset...</option>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>{datasetLabel(d, jobs[d.id])}</option>
        ))}
      </select>
    </header>
  );
}
