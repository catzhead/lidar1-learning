import { useRef, useEffect, useState, useCallback } from "react";
import { createViewer, loadPointCloud, PotreeViewer } from "../lib/potreeSetup";
import { useAdaptivePerformance } from "./useAdaptivePerformance";

const FPS_WINDOW = 60;

export interface PotreeSettings {
  pointBudget?: number;
  pointSize?: number;
}

export function usePotree(datasetId: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PotreeViewer | null>(null);
  const animFrameRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [pointBudget, setPointBudgetState] = useState(2_000_000);

  // Adaptive performance integration
  useAdaptivePerformance({
    fps,
    getPointBudget: () => viewerRef.current?.potree.pointBudget ?? 2_000_000,
    setPointBudget: (budget: number) => {
      if (viewerRef.current) {
        viewerRef.current.potree.pointBudget = budget;
        setPointBudgetState(budget);
      }
    },
  });

  const updateSettings = useCallback((settings: PotreeSettings) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (settings.pointBudget !== undefined) {
      viewer.potree.pointBudget = settings.pointBudget;
      setPointBudgetState(settings.pointBudget);
    }

    if (settings.pointSize !== undefined) {
      for (const pc of viewer.pointClouds) {
        pc.material.size = settings.pointSize;
      }
    }
  }, []);

  // Create viewer on mount, cleanup on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const viewer = createViewer(container);
    viewerRef.current = viewer;

    // Animation loop
    function animate() {
      const now = performance.now();
      const frameTimes = frameTimesRef.current;
      frameTimes.push(now);

      // Keep rolling window
      while (frameTimes.length > FPS_WINDOW) {
        frameTimes.shift();
      }

      // Calculate FPS from rolling window
      if (frameTimes.length >= 2) {
        const elapsed = frameTimes[frameTimes.length - 1] - frameTimes[0];
        if (elapsed > 0) {
          setFps(Math.round(((frameTimes.length - 1) / elapsed) * 1000));
        }
      }

      viewer.controls.update(viewer.camera);
      viewer.potree.updatePointClouds(
        viewer.pointClouds,
        viewer.camera,
        viewer.renderer
      );
      viewer.renderer.render(viewer.scene, viewer.camera);

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    // Resize handler
    function onResize() {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      viewer.camera.aspect = w / h;
      viewer.camera.updateProjectionMatrix();
      viewer.renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animFrameRef.current);
      viewer.controls.dispose();
      viewer.renderer.dispose();
      const el = containerRef.current;
      if (el && el.contains(viewer.renderer.domElement)) {
        el.removeChild(viewer.renderer.domElement);
      }
      viewerRef.current = null;
    };
  }, []);

  // Load point cloud when datasetId changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Clear existing point clouds
    for (const pc of viewer.pointClouds) {
      viewer.scene.remove(pc);
      pc.dispose();
    }
    viewer.pointClouds.length = 0;

    if (!datasetId) {
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const baseUrl = `/api/datasets/${datasetId}/tiles`;
    loadPointCloud(viewer, baseUrl)
      .then(() => {
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
      });
  }, [datasetId]);

  return { containerRef, loading, error, fps, pointBudget, updateSettings };
}
