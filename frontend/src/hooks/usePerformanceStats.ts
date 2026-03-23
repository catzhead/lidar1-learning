import { useEffect, useState, useRef } from "react";

export interface PerformanceStats {
  cpuTime: number; // ms per frame (JS main thread)
  gpuMemUsed: number | null; // MB, from WEBGL_memory_info extension (Chromium only)
  gpuMemTotal: number | null;
  jsHeapUsed: number | null; // MB, from performance.memory (Chromium only)
  jsHeapTotal: number | null;
  gpuRenderer: string | null;
}

const SAMPLE_INTERVAL = 1000; // update stats every 1s

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

export function usePerformanceStats(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null
): PerformanceStats {
  const [stats, setStats] = useState<PerformanceStats>({
    cpuTime: 0,
    gpuMemUsed: null,
    gpuMemTotal: null,
    jsHeapUsed: null,
    jsHeapTotal: null,
    gpuRenderer: null,
  });

  const frameStartRef = useRef(0);
  const cpuTimesRef = useRef<number[]>([]);

  // Expose markFrameStart / markFrameEnd for the render loop
  // We use a simpler approach: sample periodically
  useEffect(() => {
    if (!gl) return;

    // GPU renderer info (one-time)
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const gpuRenderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : null;

    const interval = setInterval(() => {
      // JS heap memory (Chromium)
      const perfMem = (performance as unknown as { memory?: PerformanceMemory })
        .memory;
      const jsHeapUsed = perfMem
        ? Math.round(perfMem.usedJSHeapSize / 1048576)
        : null;
      const jsHeapTotal = perfMem
        ? Math.round(perfMem.totalJSHeapSize / 1048576)
        : null;

      // GPU memory (WEBGL_memory_info — Chromium behind flag, or GMAN_webgl_memory)
      let gpuMemUsed: number | null = null;
      let gpuMemTotal: number | null = null;

      const memInfo =
        gl.getExtension("GMAN_webgl_memory") as unknown as {
          getMemoryInfo: () => {
            memory: { total: number; allocated: number };
          };
        } | null;
      if (memInfo) {
        const info = memInfo.getMemoryInfo();
        gpuMemUsed = Math.round(info.memory.allocated / 1048576);
        gpuMemTotal = Math.round(info.memory.total / 1048576);
      }

      // CPU frame time from collected samples
      const samples = cpuTimesRef.current;
      const avgCpu =
        samples.length > 0
          ? samples.reduce((a, b) => a + b, 0) / samples.length
          : 0;
      cpuTimesRef.current = [];

      setStats({
        cpuTime: Math.round(avgCpu * 10) / 10,
        gpuMemUsed,
        gpuMemTotal,
        jsHeapUsed,
        jsHeapTotal,
        gpuRenderer,
      });
    }, SAMPLE_INTERVAL);

    return () => clearInterval(interval);
  }, [gl]);

  return {
    ...stats,
    // Expose frame timing helpers via ref
    _markFrameStart: () => {
      frameStartRef.current = performance.now();
    },
    _markFrameEnd: () => {
      if (frameStartRef.current > 0) {
        cpuTimesRef.current.push(performance.now() - frameStartRef.current);
        frameStartRef.current = 0;
      }
    },
  } as PerformanceStats & {
    _markFrameStart: () => void;
    _markFrameEnd: () => void;
  };
}
