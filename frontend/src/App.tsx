import { useState, useEffect } from "react";
import { listDatasets } from "./api/client";
import type { Dataset } from "./types/dataset";
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
          {selectedId ? (
            <p>Viewer for {selectedId} (next task)</p>
          ) : (
            <p>Select or upload a dataset to begin</p>
          )}
        </div>
      </div>
    </div>
  );
}
