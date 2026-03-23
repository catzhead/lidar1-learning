import { useState } from "react";
import type { Dataset, Job } from "../types/dataset";

interface Props {
  datasets: Dataset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUploadClick: () => void;
  onDelete: (id: string) => void;
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

export default function Toolbar({ datasets, selectedId, onSelect, onUploadClick, onDelete, jobs }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selected = datasets.find((d) => d.id === selectedId);

  const handleDelete = () => {
    if (selectedId) {
      onDelete(selectedId);
      setConfirmDelete(false);
    }
  };

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
      {selectedId && (
        <button className="btn-delete" onClick={() => setConfirmDelete(true)} title="Delete dataset">
          &#x1F5D1;
        </button>
      )}
      {confirmDelete && selected && (
        <div className="dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Dataset</h3>
            <p style={{ margin: "12px 0", fontSize: 13, color: "var(--text-secondary)" }}>
              Are you sure you want to delete <strong>{selected.name}</strong>? This will remove the file and all converted data permanently.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
