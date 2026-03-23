const BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listDatasets() {
  return fetchJSON<import("../types/dataset").Dataset[]>("/datasets");
}

export async function getDataset(id: string) {
  return fetchJSON<import("../types/dataset").Dataset>(`/datasets/${id}`);
}

export async function getJob(datasetId: string) {
  return fetchJSON<import("../types/dataset").Job>(`/datasets/${datasetId}/job`);
}

export async function deleteDataset(id: string) {
  return fetchJSON<{ deleted: boolean }>(`/datasets/${id}`, { method: "DELETE" });
}

export async function initUpload(filename: string, name?: string) {
  const params = new URLSearchParams({ filename });
  if (name) params.set("name", name);
  return fetchJSON<{ dataset_id: string; existing_chunks: number[] }>(
    `/datasets/upload/init?${params}`,
    { method: "POST" }
  );
}

export async function uploadChunk(datasetId: string, chunkIndex: number, chunk: Blob) {
  const form = new FormData();
  form.append("file", chunk, "chunk");
  return fetchJSON<{ chunk_index: number; received: boolean }>(
    `/datasets/upload/${datasetId}/chunk?chunk_index=${chunkIndex}`,
    { method: "POST", body: form }
  );
}

export async function finalizeUpload(datasetId: string, totalChunks: number) {
  return fetchJSON<{ dataset_id: string; status: string; job_id: string }>(
    `/datasets/upload/${datasetId}/finalize?total_chunks=${totalChunks}`,
    { method: "POST" }
  );
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export async function uploadFile(
  file: File,
  onProgress?: (state: import("../types/dataset").ChunkUploadState) => void
): Promise<string> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const { dataset_id, existing_chunks } = await initUpload(file.name);

  const state: import("../types/dataset").ChunkUploadState = {
    datasetId: dataset_id,
    filename: file.name,
    totalChunks,
    uploadedChunks: existing_chunks.length,
    status: "uploading",
  };
  onProgress?.(state);

  for (let i = 0; i < totalChunks; i++) {
    if (existing_chunks.includes(i)) continue;

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    await uploadChunk(dataset_id, i, chunk);
    state.uploadedChunks++;
    onProgress?.({ ...state });
  }

  state.status = "assembling";
  onProgress?.({ ...state });

  await finalizeUpload(dataset_id, totalChunks);

  state.status = "done";
  onProgress?.({ ...state });

  return dataset_id;
}
