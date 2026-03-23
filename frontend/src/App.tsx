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
  const [showUpload, setShowUpload] = useState(false);

  const refreshDatasets = useCallback(() => {
    listDatasets().then(setDatasets).catch(console.error);
  }, []);

  useEffect(() => { refreshDatasets(); }, [refreshDatasets]);

  useEffect(() => {
    if (!selectedId) { setSelectedDataset(null); setJob(null); return; }
    getDataset(selectedId).then(setSelectedDataset).catch(console.error);
    getJob(selectedId).then(setJob).catch(() => setJob(null));
  }, [selectedId]);

  useEffect(() => {
    if (!job || (job.status !== "pending" && job.status !== "processing")) return;
    const interval = setInterval(() => {
      getJob(job.dataset_id).then((j) => {
        setJob(j);
        if (j.status === "complete" || j.status === "failed") {
          refreshDatasets();
          if (j.status === "complete") getDataset(j.dataset_id).then(setSelectedDataset);
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [job, refreshDatasets]);

  const handleUploadComplete = (datasetId: string) => {
    setShowUpload(false);
    refreshDatasets();
    setSelectedId(datasetId);
  };

  return (
    <div className="app">
      <Toolbar datasets={datasets} selectedId={selectedId} onSelect={setSelectedId} onUploadClick={() => setShowUpload(true)} />
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
