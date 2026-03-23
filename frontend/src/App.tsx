import { useState, useEffect, useCallback } from "react";
import { listDatasets, getDataset, getJob } from "./api/client";
import type { Dataset, Job } from "./types/dataset";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar/Sidebar";
import ViewerCanvas from "./components/ViewerCanvas";
import UploadDialog from "./components/UploadDialog";
import "./App.css";

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [showUpload, setShowUpload] = useState(false);

  const refreshDatasets = useCallback(() => {
    listDatasets().then(setDatasets).catch(console.error);
  }, []);

  useEffect(() => { refreshDatasets(); }, [refreshDatasets]);

  // Fetch job for selected dataset
  useEffect(() => {
    if (!selectedId) { setSelectedDataset(null); setJob(null); return; }
    getDataset(selectedId).then(setSelectedDataset).catch(console.error);
    getJob(selectedId).then((j) => { setJob(j); setJobs((prev) => ({ ...prev, [selectedId]: j })); }).catch(() => setJob(null));
  }, [selectedId]);

  // Poll jobs for all in-progress datasets (updates toolbar labels)
  useEffect(() => {
    const activeIds = datasets
      .filter((d) => d.status === "processing" || d.status === "uploaded")
      .map((d) => d.id);
    if (activeIds.length === 0) return;

    const poll = () => {
      for (const id of activeIds) {
        getJob(id)
          .then((j) => {
            setJobs((prev) => ({ ...prev, [id]: j }));
            if (id === selectedId) setJob(j);
            if (j.status === "complete" || j.status === "failed") {
              refreshDatasets();
              if (j.status === "complete" && id === selectedId) {
                getDataset(id).then(setSelectedDataset);
              }
            }
          })
          .catch(() => {});
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [datasets, selectedId, refreshDatasets]);

  const handleUploadComplete = (datasetId: string) => {
    setShowUpload(false);
    refreshDatasets();
    setSelectedId(datasetId);
  };

  return (
    <div className="app">
      <Toolbar datasets={datasets} selectedId={selectedId} onSelect={setSelectedId} onUploadClick={() => setShowUpload(true)} jobs={jobs} />
      <div className="main">
        <Sidebar dataset={selectedDataset} job={job} fps={0} onSettingsChange={() => {}} />
        <div className="viewer">
          <ViewerCanvas datasetId={selectedDataset?.status === "ready" ? selectedId : null} />
        </div>
      </div>
      {showUpload && <UploadDialog onComplete={handleUploadComplete} onClose={() => setShowUpload(false)} />}
    </div>
  );
}
