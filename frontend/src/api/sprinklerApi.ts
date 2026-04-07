import { api } from "./client";
import type {
  ControlResponse,
  ControlState,
  HistoryResponse,
  MlMetrics,
  NodeSummary,
  PredictionResponse,
  RetrainResponse
} from "../types";

export async function fetchLatestData(readingSource?: string) {
  const { data } = await api.get<NodeSummary[]>("/data", {
    params: readingSource ? { reading_source: readingSource } : undefined
  });
  return data;
}

export async function fetchHistory(nodeId?: string, limit = 24, readingSource?: string) {
  const params: Record<string, string | number> = { limit };
  if (nodeId) {
    params.node_id = nodeId;
  }
  if (readingSource) {
    params.reading_source = readingSource;
  }
  const { data } = await api.get<HistoryResponse>("/history", { params });
  return data;
}

export async function fetchMlMetrics() {
  const { data } = await api.get<MlMetrics>("/ml/metrics");
  return data;
}

export async function updatePreferredModel(preferredModel: string) {
  const { data } = await api.post<MlMetrics>("/ml/preference", {
    preferred_model: preferredModel
  });
  return data;
}

export async function fetchControlStates() {
  const { data } = await api.get<ControlState[]>("/control/state");
  return data;
}

export async function predictSprinkler(temperature: number, humidity: number) {
  const { data } = await api.post<PredictionResponse>("/ml/predict", {
    temperature,
    humidity
  });
  return data;
}

export async function login(username: string, password: string) {
  const { data } = await api.post<{ access_token: string }>("/auth/login", {
    username,
    password
  });
  return data;
}

export async function updateControlMode(nodeId: string, controlMode: "manual" | "ml" | "esp32_fallback") {
  const { data } = await api.post<ControlState>("/control/mode", {
    node_id: nodeId,
    control_mode: controlMode
  });
  return data;
}

export async function sendManualControl(nodeId: string, relay1On: boolean, relay2On: boolean) {
  const { data } = await api.post<ControlResponse>("/control/manual", {
    node_id: nodeId,
    relay1_on: relay1On,
    relay2_on: relay2On
  });
  return data;
}

export async function retrainModel() {
  const { data } = await api.post<RetrainResponse>("/ml/retrain");
  return data;
}

export async function retrainModelWithDataset(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<RetrainResponse>("/ml/retrain/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return data;
}
