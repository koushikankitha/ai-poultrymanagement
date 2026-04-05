export type SimulationReading = {
  id: number;
  node_id: string;
  temperature: number;
  humidity: number;
  ammonia: number | null;
  soil_moisture: number | null;
  relay1_on: boolean;
  relay2_on: boolean;
  sprinkler_on: boolean;
  ai_decision: boolean;
  reading_source: string;
  created_at: string;
};

const base = "2026-03-22T09:";

export const simulationReadings: SimulationReading[] = [
  { id: 1, node_id: "N1", temperature: 32.4, humidity: 64, ammonia: 10, soil_moisture: 48, relay1_on: false, relay2_on: false, sprinkler_on: false, ai_decision: false, reading_source: "simulation", created_at: `${base}00:00` },
  { id: 2, node_id: "N1", temperature: 33.2, humidity: 61, ammonia: 11, soil_moisture: 46, relay1_on: false, relay2_on: false, sprinkler_on: false, ai_decision: false, reading_source: "simulation", created_at: `${base}10:00` },
  { id: 3, node_id: "N1", temperature: 34.1, humidity: 58, ammonia: 12, soil_moisture: 44, relay1_on: false, relay2_on: false, sprinkler_on: false, ai_decision: true, reading_source: "simulation", created_at: `${base}20:00` },
  { id: 4, node_id: "N1", temperature: 35.3, humidity: 54, ammonia: 14, soil_moisture: 42, relay1_on: true, relay2_on: false, sprinkler_on: true, ai_decision: true, reading_source: "simulation", created_at: `${base}30:00` },
  { id: 5, node_id: "N2", temperature: 31.8, humidity: 68, ammonia: 9, soil_moisture: 52, relay1_on: false, relay2_on: false, sprinkler_on: false, ai_decision: false, reading_source: "simulation", created_at: `${base}00:00` },
  { id: 6, node_id: "N2", temperature: 32.7, humidity: 65, ammonia: 10, soil_moisture: 50, relay1_on: false, relay2_on: false, sprinkler_on: false, ai_decision: false, reading_source: "simulation", created_at: `${base}10:00` },
  { id: 7, node_id: "N2", temperature: 34.8, humidity: 56, ammonia: 13, soil_moisture: 45, relay1_on: true, relay2_on: false, sprinkler_on: true, ai_decision: true, reading_source: "simulation", created_at: `${base}20:00` },
  { id: 8, node_id: "N2", temperature: 35.6, humidity: 52, ammonia: 15, soil_moisture: 40, relay1_on: true, relay2_on: false, sprinkler_on: true, ai_decision: true, reading_source: "simulation", created_at: `${base}30:00` },
  { id: 9, node_id: "N3", temperature: 33.1, humidity: 60, ammonia: 16, soil_moisture: 43, relay1_on: false, relay2_on: false, sprinkler_on: false, ai_decision: false, reading_source: "simulation", created_at: `${base}00:00` },
  { id: 10, node_id: "N3", temperature: 34.6, humidity: 55, ammonia: 18, soil_moisture: 40, relay1_on: true, relay2_on: false, sprinkler_on: true, ai_decision: true, reading_source: "simulation", created_at: `${base}10:00` },
  { id: 11, node_id: "N3", temperature: 36.3, humidity: 50, ammonia: 19, soil_moisture: 37, relay1_on: true, relay2_on: true, sprinkler_on: true, ai_decision: true, reading_source: "simulation", created_at: `${base}20:00` },
  { id: 12, node_id: "N3", temperature: 37.1, humidity: 47, ammonia: 22, soil_moisture: 34, relay1_on: true, relay2_on: true, sprinkler_on: true, ai_decision: true, reading_source: "simulation", created_at: `${base}30:00` }
];
