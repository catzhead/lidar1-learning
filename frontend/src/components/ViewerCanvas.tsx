import { usePotree } from "../hooks/usePotree";

interface ViewerCanvasProps {
  datasetId: string | null;
}

export default function ViewerCanvas({ datasetId }: ViewerCanvasProps) {
  const { containerRef, loading, error, fps, pointBudget } =
    usePotree(datasetId);

  const fpsColor = fps > 0 && fps < 40 ? "#ff4444" : "#44ff44";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Loading overlay */}
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            fontSize: 18,
            zIndex: 10,
          }}
        >
          Loading point cloud...
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            color: "#ff4444",
            fontSize: 16,
            padding: 24,
            textAlign: "center",
            zIndex: 10,
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Empty state */}
      {!datasetId && !loading && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#888",
            fontSize: 16,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          Select or upload a dataset to begin
        </div>
      )}

      {/* FPS + point budget display */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          background: "rgba(0,0,0,0.7)",
          color: "#ccc",
          padding: "4px 8px",
          borderRadius: 4,
          fontSize: 12,
          fontFamily: "monospace",
          zIndex: 10,
          userSelect: "none",
        }}
      >
        <span style={{ color: fpsColor }}>{fps} FPS</span>
        {" | "}
        {(pointBudget / 1_000_000).toFixed(1)}M pts
      </div>
    </div>
  );
}
