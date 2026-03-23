import { useState, useEffect } from "react";
import { listDatasets } from "./api/client";
import type { Dataset } from "./types/dataset";
import ViewerCanvas from "./components/ViewerCanvas";
import "./App.css";

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    listDatasets().then(setDatasets).catch(console.error);
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <span className="logo">LiDAR Viewer</span>
        <button className="btn-primary">Upload Dataset</button>
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          <option value="">Select dataset...</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.status})
            </option>
          ))}
        </select>
      </header>
      <div className="main">
        <aside className="sidebar">
          <p style={{ padding: 16, color: "#888" }}>Sidebar panels (next task)</p>
        </aside>
        <div className="viewer">
          <ViewerCanvas datasetId={selectedId} />
        </div>
      </div>
    </div>
  );
}
