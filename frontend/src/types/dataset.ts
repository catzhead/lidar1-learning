export interface Dataset {
  id: string;
  name: string;
  filename: string;
  file_size: number | null;
  point_count: number | null;
  crs: string | null;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  dataset_id: string;
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ChunkUploadState {
  datasetId: string;
  filename: string;
  totalChunks: number;
  uploadedChunks: number;
  status: "uploading" | "assembling" | "done" | "error";
  error?: string;
}
