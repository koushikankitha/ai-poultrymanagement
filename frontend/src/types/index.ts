export type Reading = {
  id: number;
  node_id: string;
  temperature: number;
  humidity: number;
  ammonia?: number | null;
  soil_moisture?: number | null;
  relay1_on: boolean;
  relay2_on: boolean;
  sprinkler_on: boolean;
  ai_decision: boolean;
  reading_source: string;
  created_at: string;
};

export type NodeSummary = {
  node_id: string;
  latest_reading: Reading;
  status: "safe" | "critical";
};

export type HistoryResponse = {
  node_id?: string | null;
  count: number;
  items: Reading[];
};

export type PredictionResponse = {
  sprinkler_on: boolean;
  confidence: number;
  model_version: string;
  reason: string;
};

export type RetrainResponse = {
  trained_samples: number;
  accuracy: number;
  model_version: string;
  best_model: string;
  source: string;
  current_model: string;
  preferred_model: string;
};

export type ControlResponse = {
  id: number;
  node_id: string;
  mode: string;
  command: string;
  applied: boolean;
  notes?: string | null;
  created_at: string;
};

export type ControlState = {
  node_id: string;
  control_mode: "manual" | "ml" | "esp32_fallback";
  relay1_on: boolean;
  relay2_on: boolean;
  updated_at?: string | null;
};

export type MlMetrics = {
  best_model: string;
  current_model: string;
  preferred_model: string;
  available_models: string[];
  model_version: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  all_results: Record<string, { accuracy: number; precision: number; recall: number; f1_score: number }>;
  confusion_matrix: { labels: string[]; matrix: number[][] };
  feature_importance: { features: string[]; importance: number[] };
};
