import { useState, useRef } from "react";
import { uploadFile } from "../api/client";
import type { ChunkUploadState } from "../types/dataset";

interface Props {
  onComplete: (datasetId: string) => void;
  onClose: () => void;
}

export default function UploadDialog({ onComplete, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ChunkUploadState | null>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    try {
      const id = await uploadFile(file, setState);
      onComplete(id);
    } catch (err) {
      setState((prev) => prev ? { ...prev, status: "error", error: String(err) } : null);
    }
  };

  const progress = state ? Math.round((state.uploadedChunks / state.totalChunks) * 100) : 0;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Upload Dataset</h3>
        <p style={{ color: "#999", fontSize: 12, marginBottom: 16 }}>Supported formats: .laz, .las</p>
        <input ref={fileRef} type="file" accept=".laz,.las" />
        {state && (
          <div style={{ marginTop: 12 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              {state.status === "uploading" && `Uploading: ${progress}% (${state.uploadedChunks}/${state.totalChunks} chunks)`}
              {state.status === "assembling" && "Assembling file..."}
              {state.status === "done" && "Upload complete! Conversion starting..."}
              {state.status === "error" && `Error: ${state.error}`}
            </p>
          </div>
        )}
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleUpload} disabled={state?.status === "uploading" || state?.status === "assembling"}>Upload</button>
        </div>
      </div>
    </div>
  );
}
