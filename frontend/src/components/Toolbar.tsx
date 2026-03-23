import type { Dataset } from "../types/dataset";

interface Props {
  datasets: Dataset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUploadClick: () => void;
}

export default function Toolbar({ datasets, selectedId, onSelect, onUploadClick }: Props) {
  return (
    <header className="toolbar">
      <span className="logo">LiDAR Viewer</span>
      <button className="btn-primary" onClick={onUploadClick}>Upload Dataset</button>
      <select value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
        <option value="">Select dataset...</option>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
        ))}
      </select>
    </header>
  );
}
