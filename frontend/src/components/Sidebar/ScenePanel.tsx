import { useState } from "react";
import type { Dataset, Job } from "../../types/dataset";

interface Props {
  dataset: Dataset | null;
  job: Job | null;
  fps: number;
}

export default function ScenePanel({ dataset, job, fps }: Props) {
  const [open, setOpen] = useState(true);
  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>{open ? "\u25be" : "\u25b8"} Scene</div>
      {open && (
        <div className="panel-body panel-info">
          {dataset ? (
            <>
              <div><span className="info-label">Dataset:</span> {dataset.name}</div>
              <div><span className="info-label">Status:</span> {dataset.status}
                {job && (job.status === "processing" || job.status === "pending") && (
                  <span style={{ marginLeft: 8, color: "#58a6ff" }}>{job.progress.toFixed(0)}%</span>
                )}
              </div>
              {job && job.status === "failed" && job.error && (
                <div style={{ color: "#ff5555", marginTop: 4, fontSize: "0.85em", whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>
                  <span className="info-label">Error:</span> {job.error}
                </div>
              )}
              {dataset.point_count && <div><span className="info-label">Points:</span> {dataset.point_count.toLocaleString()}</div>}
              {dataset.crs && <div><span className="info-label">CRS:</span> {dataset.crs}</div>}
              {dataset.file_size && <div><span className="info-label">Size:</span> {(dataset.file_size / 1e9).toFixed(2)} GB</div>}
            </>
          ) : (
            <div>No dataset selected</div>
          )}
          <div style={{ marginTop: 8, color: fps < 40 ? "#ff5555" : "#666" }}>
            <span className="info-label">FPS:</span> {fps}
          </div>
        </div>
      )}
    </div>
  );
}
