import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { setAuthToken } from "../api/client";
import {
  fetchControlStates,
  fetchHistory,
  fetchLatestData,
  fetchMlMetrics,
  login,
  predictSprinkler,
  retrainModel,
  retrainModelWithDataset,
  sendManualControl,
  updatePreferredModel,
  updateControlMode
} from "../api/sprinklerApi";
import { MetricCard } from "../components/MetricCard";
import { NodeSidebar } from "../components/NodeSidebar";
import { StatusBadge } from "../components/StatusBadge";
import { TrendChart } from "../components/TrendChart";
import { simulationReadings } from "../data/simulationData";
import { usePolling } from "../hooks/usePolling";
import type { ControlState, MlMetrics, NodeSummary, PredictionResponse, Reading } from "../types";

const TOKEN_KEY = "sprinkler-admin-token";
const MODE_KEY = "sprinkler-dashboard-mode";
const THEME_KEY = "sprinkler-dashboard-theme";
const HARDWARE_FRESHNESS_MS = 2 * 60 * 1000;

type DashboardMode = "simulation" | "hardware";
type PageSection = "dashboard" | "analytics" | "history" | "reports" | "info";
type ThemeMode = "dark" | "light";
type ControlMode = "manual" | "ml" | "esp32_fallback";

type SimulationBundle = {
  latestNodes: NodeSummary[];
  historyByNode: Record<string, Reading[]>;
  allHistory: Reading[];
  controlStates: Record<string, ControlState>;
};

const sectionContent: Record<PageSection, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Live Poultry Shed Dashboard",
    subtitle: "Real-time node visibility for climate, sprinkler state, and relay status."
  },
  analytics: {
    title: "Machine Learning Analytics",
    subtitle: "Manual-versus-ML relay control, model quality, and decision visibility."
  },
  history: {
    title: "Historical Sensor Records",
    subtitle: "Review past readings and compare node behavior over time."
  },
  reports: {
    title: "Operational Reports",
    subtitle: "Quick summaries of node conditions, critical events, and control usage."
  },
  info: {
    title: "System Information",
    subtitle: "Project overview, payload format, and deployment architecture."
  }
};

const simulationMetrics: MlMetrics = {
  best_model: "Random Forest",
  current_model: "Random Forest",
  preferred_model: "Auto",
  available_models: ["Auto", "Random Forest", "Gradient Boosting", "Decision Tree", "Logistic Regression"],
  model_version: "simulation-v1",
  accuracy: 0.968,
  precision: 0.962,
  recall: 0.971,
  f1_score: 0.966,
  all_results: {
    "Random Forest": { accuracy: 0.968, precision: 0.962, recall: 0.971, f1_score: 0.966 },
    "Gradient Boosting": { accuracy: 0.955, precision: 0.951, recall: 0.958, f1_score: 0.954 },
    "Decision Tree": { accuracy: 0.928, precision: 0.934, recall: 0.918, f1_score: 0.926 },
    "Logistic Regression": { accuracy: 0.914, precision: 0.902, recall: 0.925, f1_score: 0.913 }
  },
  confusion_matrix: {
    labels: ["OFF", "ON"],
    matrix: [
      [46, 3],
      [2, 49]
    ]
  },
  feature_importance: {
    features: ["temperature", "humidity"],
    importance: [0.63, 0.37]
  }
};

function buildSimulationBundle(): SimulationBundle {
  const sorted = [...simulationReadings].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const historyByNode = sorted.reduce<Record<string, Reading[]>>((acc, reading) => {
    const list = acc[reading.node_id] ?? [];
    list.push(reading);
    acc[reading.node_id] = list;
    return acc;
  }, {});

  const latestNodes = Object.entries(historyByNode).map(([nodeId, items]) => {
    const latestReading = items[items.length - 1];
    const status = latestReading.temperature >= 35 || latestReading.humidity <= 50 ? "critical" : "safe";
    return { node_id: nodeId, latest_reading: latestReading, status } satisfies NodeSummary;
  });

  latestNodes.sort((a, b) => a.node_id.localeCompare(b.node_id));

  const controlStates = latestNodes.reduce<Record<string, ControlState>>((acc, node) => {
    acc[node.node_id] = {
      node_id: node.node_id,
      control_mode: "ml",
      relay1_on: node.latest_reading.ai_decision,
      relay2_on: false,
      updated_at: node.latest_reading.created_at
    };
    return acc;
  }, {});

  return { latestNodes, historyByNode, allHistory: sorted, controlStates };
}

const simulationBundle = buildSimulationBundle();

function buildSimulationPrediction(reading: Reading): PredictionResponse {
  const sprinklerOn = reading.temperature >= 34 || reading.humidity <= 55;
  return {
    sprinkler_on: sprinklerOn,
    confidence: sprinklerOn ? 0.91 : 0.84,
    model_version: simulationMetrics.model_version,
    reason: sprinklerOn
      ? "Simulation AI predicts heat stress conditions and recommends turning relays on."
      : "Simulation AI predicts stable shed conditions, so relays remain off."
  };
}

function mergeNodeWithControl(node: NodeSummary, control?: ControlState, prediction?: PredictionResponse): NodeSummary {
  if (!control) {
    return node;
  }
  const relay1On =
    control.control_mode === "manual"
      ? control.relay1_on
      : control.control_mode === "ml"
        ? prediction?.sprinkler_on ?? node.latest_reading.ai_decision
        : node.latest_reading.relay1_on;
  const relay2On =
    control.control_mode === "manual"
      ? control.relay2_on
      : control.control_mode === "ml"
        ? false
        : node.latest_reading.relay2_on;
  return {
    ...node,
    latest_reading: {
      ...node.latest_reading,
      relay1_on: relay1On,
      relay2_on: relay2On,
      sprinkler_on: relay1On || relay2On
    }
  };
}

function isFreshReading(reading: Reading): boolean {
  const raw = reading.created_at;
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  return Date.now() - new Date(normalized).getTime() <= HARDWARE_FRESHNESS_MS;
}

export function DashboardPage() {
  const [mode, setMode] = useState<DashboardMode>(() => {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === "hardware" ? "hardware" : "simulation";
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" ? "light" : "dark";
  });
  const [section, setSection] = useState<PageSection>("dashboard");
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [history, setHistory] = useState<Reading[]>([]);
  const [allHistory, setAllHistory] = useState<Reading[]>([]);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [metrics, setMetrics] = useState<MlMetrics>(simulationMetrics);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [message, setMessage] = useState<string>("Preparing dashboard...");
  const [controlStates, setControlStates] = useState<Record<string, ControlState>>(simulationBundle.controlStates);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  function loadSimulationDashboard() {
    const selectedNode = activeNodeId ?? simulationBundle.latestNodes[0]?.node_id ?? null;
    const selectedHistory = selectedNode ? simulationBundle.historyByNode[selectedNode] ?? [] : [];
    const simulatedPrediction = selectedHistory.length
      ? buildSimulationPrediction(selectedHistory[selectedHistory.length - 1])
      : null;

    const mergedNodes = simulationBundle.latestNodes.map((node) =>
      mergeNodeWithControl(node, controlStates[node.node_id] ?? simulationBundle.controlStates[node.node_id], simulatedPrediction ?? undefined)
    );

    setNodes(mergedNodes);
    setActiveNodeId(selectedNode);
    setAllHistory(simulationBundle.allHistory);
    setHistory(selectedHistory);
    setPrediction(simulatedPrediction);
    setMetrics(simulationMetrics);
    setMessage("Simulation mode uses built-in demo data only.");
  }

  async function loadHardwareDashboard() {
    try {
      const [latest, controlProfiles, metricsResponse, allHistoryResponse] = await Promise.all([
        fetchLatestData("hardware"),
        fetchControlStates(),
        fetchMlMetrics(),
        fetchHistory(undefined, 200, "hardware")
      ]);
      const freshLatest = latest.filter((node) => isFreshReading(node.latest_reading));
      const freshHistory = allHistoryResponse.items.filter(isFreshReading);
      const controlMap = controlProfiles.reduce<Record<string, ControlState>>((acc, profile) => {
        acc[profile.node_id] = profile;
        return acc;
      }, {});
      setControlStates(controlMap);
      setMetrics(metricsResponse);
      if (!freshLatest.length) {
        setNodes([]);
        setHistory([]);
        setAllHistory([]);
        setPrediction(null);
        setMessage("Hardware mode is waiting for real-time ESP32 sensor data. No fresh hardware readings were found in the last 2 minutes.");
        return;
      }
      const selectedNode = activeNodeId ?? freshLatest[0]?.node_id ?? null;
      setActiveNodeId(selectedNode);
      const selected = selectedNode ? freshLatest.find((node) => node.node_id === selectedNode) ?? freshLatest[0] : null;
      const historyResponse = selected ? await fetchHistory(selected.node_id, 48, "hardware") : { items: [], count: 0, node_id: null };
      const selectedHistory = historyResponse.items.filter(isFreshReading);
      const ai = selected
        ? await predictSprinkler(selected.latest_reading.temperature, selected.latest_reading.humidity)
        : null;
      const mergedNodes = freshLatest.map((node) => mergeNodeWithControl(node, controlMap[node.node_id], ai ?? undefined));
      setNodes(mergedNodes);
      setHistory(selectedHistory);
      setAllHistory(freshHistory);
      setPrediction(ai);
      setMessage(selected
        ? `Hardware mode is showing fresh ESP32-fed sensor data for ${selected.node_id.replace("N", "Node ")}.`
        : "Hardware mode is active.");
    } catch {
      setNodes([]);
      setHistory([]);
      setAllHistory([]);
      setPrediction(null);
      setMessage("Hardware mode could not reach the backend. Make sure the API is running and CORS includes your frontend URL.");
    }
  }

  async function loadDashboard() {
    if (mode === "simulation") {
      loadSimulationDashboard();
      return;
    }
    await loadHardwareDashboard();
  }

  usePolling(() => {
    if (mode === "hardware") {
      return loadHardwareDashboard();
    }
  }, 10000);

  useEffect(() => {
    void loadDashboard();
  }, [activeNodeId, mode]);

  const activeNode = useMemo(
    () => nodes.find((node) => node.node_id === activeNodeId) ?? null,
    [activeNodeId, nodes]
  );
  const activeControl = activeNode ? controlStates[activeNode.node_id] : null;
  const controlMode = activeControl?.control_mode ?? "ml";
  const temperatureAccent = activeNode && activeNode.latest_reading.temperature >= 35 ? "critical" : "safe";
  const humidityAccent = activeNode && activeNode.latest_reading.humidity <= 50 ? "critical" : "safe";

  const reportSummary = useMemo(() => {
    if (!allHistory.length) {
      return { avgTemp: 0, avgHumidity: 0, criticalCount: 0 };
    }
    const avgTemp = allHistory.reduce((sum, item) => sum + item.temperature, 0) / allHistory.length;
    const avgHumidity = allHistory.reduce((sum, item) => sum + item.humidity, 0) / allHistory.length;
    const criticalCount = allHistory.filter((item) => item.temperature >= 35 || item.humidity <= 50).length;
    return { avgTemp, avgHumidity, criticalCount };
  }, [allHistory]);

  async function handleLogin(username: string, password: string) {
    if (mode === "simulation") {
      setToken("simulation-token");
      setMessage("Simulation admin access enabled for relay mode testing.");
      return;
    }
    const result = await login(username, password);
    localStorage.setItem(TOKEN_KEY, result.access_token);
    setToken(result.access_token);
    setMessage("Admin access enabled for relay mode and manual control.");
  }

  async function handleSetControlMode(nextMode: ControlMode) {
    if (!activeNode) {
      return;
    }
    if (!token) {
      setMessage("Please log in as admin before changing relay control mode.");
      return;
    }
    if (mode === "simulation") {
      setControlStates((current) => ({
        ...current,
        [activeNode.node_id]: {
          ...(current[activeNode.node_id] ?? simulationBundle.controlStates[activeNode.node_id]),
          control_mode: nextMode,
          updated_at: new Date().toISOString()
        }
      }));
      setMessage(`${activeNode.node_id.replace("N", "Node ")} switched to ${nextMode.replace("_", " ").toUpperCase()} control in simulation.`);
      return;
    }
    const updated = await updateControlMode(activeNode.node_id, nextMode);
    setControlStates((current) => ({ ...current, [updated.node_id]: updated }));
    setMessage(`${activeNode.node_id.replace("N", "Node ")} switched to ${nextMode.replace("_", " ").toUpperCase()} control.`);
    await loadHardwareDashboard();
  }

  async function handleManualRelay(relay: "relay1_on" | "relay2_on", value: boolean) {
    if (!activeNode) {
      return;
    }
    if (!token) {
      setMessage("Please log in as admin before changing relays.");
      return;
    }
    const current = controlStates[activeNode.node_id] ?? simulationBundle.controlStates[activeNode.node_id];
    const nextState = {
      relay1_on: relay === "relay1_on" ? value : current.relay1_on,
      relay2_on: relay === "relay2_on" ? value : current.relay2_on
    };
    if (mode === "simulation") {
      setControlStates((states) => ({
        ...states,
        [activeNode.node_id]: {
          ...(states[activeNode.node_id] ?? current),
          control_mode: "manual",
          ...nextState,
          updated_at: new Date().toISOString()
        }
      }));
      setMessage(`Simulation manual relay update saved for ${activeNode.node_id.replace("N", "Node ")}.`);
      return;
    }
    const result = await sendManualControl(activeNode.node_id, nextState.relay1_on, nextState.relay2_on);
    setMessage(`Manual relay command ${result.command} saved for ${activeNode.node_id.replace("N", "Node ")}.`);
    await loadHardwareDashboard();
  }

  async function handleRetrain() {
    if (mode === "simulation") {
      setMessage("Simulation mode uses demo analytics, so retraining is disabled.");
      return;
    }
    const result = await retrainModel();
    setMessage(`Model retrained with ${result.current_model} on ${result.trained_samples} samples and ${(result.accuracy * 100).toFixed(1)}% accuracy.`);
    await loadHardwareDashboard();
  }

  async function handleDatasetRetrain() {
    if (mode === "simulation") {
      setMessage("Switch to hardware mode to train the backend model with your own dataset.");
      return;
    }
    if (!datasetFile) {
      setMessage("Choose a CSV dataset before starting model training.");
      return;
    }

    setDatasetBusy(true);
    try {
      const result = await retrainModelWithDataset(datasetFile);
      setMessage(
        `Dataset training completed with ${result.current_model} on ${result.trained_samples} rows from ${result.source}. Accuracy: ${(result.accuracy * 100).toFixed(1)}%.`
      );
      setDatasetFile(null);
      await loadHardwareDashboard();
    } catch (error) {
      const detail =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === "string"
          ? ((error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Dataset training failed. Check the CSV columns and values, then try again.")
          : "Dataset training failed. Check the CSV columns and values, then try again.";
      setMessage(detail);
    } finally {
      setDatasetBusy(false);
    }
  }

  async function handlePreferredModelChange(nextModel: string) {
    setModelBusy(true);
    try {
      const updated = await updatePreferredModel(nextModel);
      setMetrics(updated);
      setMessage(
        nextModel === "Auto"
          ? "Model selection set to Auto. Future training will save the best-performing model."
          : `Model selection set to ${nextModel}. Future training will save that model.`
      );
    } catch {
      setMessage("Could not update the model selection right now.");
    } finally {
      setModelBusy(false);
    }
  }

  function triggerCsvDownload(filename: string, rows: Array<Array<string | number>>) {
    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadCurrentDataCsv() {
    const rows = [
      ["node_id", "temperature", "humidity", "ammonia", "soil_moisture", "relay1_on", "relay2_on", "sprinkler_on", "ai_decision", "reading_source", "created_at"],
      ...allHistory.map((item) => [
        item.node_id,
        item.temperature,
        item.humidity,
        item.ammonia ?? "",
        item.soil_moisture ?? "",
        item.relay1_on ? 1 : 0,
        item.relay2_on ? 1 : 0,
        item.sprinkler_on ? 1 : 0,
        item.ai_decision ? 1 : 0,
        item.reading_source,
        item.created_at
      ])
    ];
    triggerCsvDownload("current-sprinkler-data.csv", rows);
  }

  function handleDownloadTrainingCsv() {
    const rows = [
      ["temperature", "humidity", "sprinkler_on"],
      ...allHistory.map((item) => [
        item.temperature,
        item.humidity,
        item.sprinkler_on ? 1 : 0
      ])
    ];
    triggerCsvDownload("ml-training-template.csv", rows);
  }

  const comparisonRows = Object.entries(metrics.all_results ?? {});
  const featureData = metrics.feature_importance?.features.map((feature, index) => ({
    feature,
    importance: Number((metrics.feature_importance.importance[index] ?? 0).toFixed(3))
  })) ?? [];
  const confusionRows = metrics.confusion_matrix?.matrix.map((row, rowIndex) => ({
    actual: metrics.confusion_matrix.labels[rowIndex],
    predictedOff: row[0],
    predictedOn: row[1]
  })) ?? [];
  const chartAxisColor = "var(--chart-axis)";
  const chartGridColor = "var(--chart-grid)";
  const chartTooltipStyle = {
    backgroundColor: "var(--tooltip-bg)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    color: "var(--text)"
  };

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-mark">
          <div className="brand-mark__icon">SS</div>
          <div>
            <strong>Smart Sprinkler</strong>
            <p>Poultry Heat Control</p>
          </div>
        </div>
        <nav className="section-nav">
          {[
            ["dashboard", "Dashboard"],
            ["analytics", "ML Analytics"],
            ["history", "History"],
            ["reports", "Reports"],
            ["info", "Info"]
          ].map(([value, label]) => (
            <button key={value} type="button" className={section === value ? "active" : ""} onClick={() => setSection(value as PageSection)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="topbar__actions">
          <div className="theme-switch" role="tablist" aria-label="Theme selection">
            <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>Dark</button>
            <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>Light</button>
          </div>
          <StatusBadge label={mode === "simulation" ? "Simulation" : "Hardware"} tone={mode === "simulation" ? "neutral" : nodes.length ? "safe" : "critical"} />
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Smart Sprinkler Management System for Poultry Heat Control</p>
          <h1>{sectionContent[section].title}</h1>
          <p className="hero__copy">{sectionContent[section].subtitle}</p>
          <div className="mode-switch" role="tablist" aria-label="Data source mode">
            <button type="button" className={mode === "simulation" ? "active" : ""} onClick={() => setMode("simulation")}>Simulation</button>
            <button type="button" className={mode === "hardware" ? "active" : ""} onClick={() => setMode("hardware")}>Hardware</button>
          </div>
        </div>
        <div className="hero__meta">
          <StatusBadge
            label={mode === "hardware" && !nodes.length ? "Hardware Offline" : activeNode?.status === "critical" ? "Critical Environment" : "System Ready"}
            tone={mode === "hardware" && !nodes.length ? "critical" : activeNode?.status ?? "neutral"}
          />
          <p>{message}</p>
          {activeNode ? <small>Active node: {activeNode.node_id.replace("N", "Node ")}</small> : null}
        </div>
      </section>

      {section === "dashboard" ? (
        <section className="dashboard-grid">
          <NodeSidebar nodes={nodes} activeNode={activeNodeId} onSelect={(nodeId) => setActiveNodeId(nodeId)} />
          <section className="content-grid">
            <div className="metric-grid">
              <MetricCard title="Temperature" value={`${activeNode?.latest_reading.temperature?.toFixed(1) ?? "--"} C`} helper="Keep shed temperature under 35 C where possible." accent={temperatureAccent} />
              <MetricCard title="Humidity" value={`${activeNode?.latest_reading.humidity?.toFixed(0) ?? "--"} %`} helper="Low humidity increases poultry heat stress risk." accent={humidityAccent} />
              <MetricCard title="Ammonia" value={`${activeNode?.latest_reading.ammonia?.toFixed(0) ?? "--"} ppm`} helper="Optional gas metric from each node." accent={(activeNode?.latest_reading.ammonia ?? 0) > 25 ? "critical" : "neutral"} />
              <MetricCard title="Soil Moisture" value={`${activeNode?.latest_reading.soil_moisture?.toFixed(0) ?? "--"} %`} helper="Optional field probe linked to the sprinkler line." accent="neutral" />
            </div>

            <div className="panel panel--dark summary-panel">
              <div className="panel__header">
                <h2>Operational Snapshot</h2>
                <span>{activeNode ? activeNode.node_id.replace("N", "Node ") : "No node"}</span>
              </div>
              <div className="summary-panel__body">
                <div><p>Control Mode</p><strong>{activeNode ? controlMode.toUpperCase() : "--"}</strong></div>
                <div><p>Sprinkler</p><strong>{activeNode ? (activeNode.latest_reading.sprinkler_on ? "ON" : "OFF") : "--"}</strong></div>
                <div><p>Relay 1</p><strong>{activeNode ? (activeNode.latest_reading.relay1_on ? "ON" : "OFF") : "--"}</strong></div>
                <div><p>Relay 2</p><strong>{activeNode ? (activeNode.latest_reading.relay2_on ? "ON" : "OFF") : "--"}</strong></div>
              </div>
              <p className="summary-panel__reason">{prediction?.reason ?? (mode === "hardware" ? "Waiting for fresh hardware readings to generate AI insight." : "Select a node to inspect AI reasoning and relay status.")}</p>
            </div>

            <TrendChart data={history} />
          </section>
        </section>
      ) : null}

      {section === "analytics" ? (
        <section className="analytics-grid">
          <div className="panel panel--dark analytics-control">
            <div className="panel__header">
              <h2>Relay Control</h2>
              <span>{activeNode ? activeNode.node_id.replace("N", "Node ") : "Choose a node"}</span>
            </div>
            <p className="section-copy">Switch between manual control, cloud ML control, and ESP32 local fallback logic.</p>
            <div className="mode-switch mode-switch--compact">
              <button type="button" className={controlMode === "manual" ? "active" : ""} onClick={() => void handleSetControlMode("manual")} disabled={!activeNode}>Manual</button>
              <button type="button" className={controlMode === "ml" ? "active" : ""} onClick={() => void handleSetControlMode("ml")} disabled={!activeNode}>ML</button>
              <button type="button" className={controlMode === "esp32_fallback" ? "active" : ""} onClick={() => void handleSetControlMode("esp32_fallback")} disabled={!activeNode}>ESP32 Fallback</button>
            </div>
            <div className="login-inline">
              {!token ? (
                <button type="button" onClick={() => void handleLogin("admin", "admin123")}>Quick Admin Login</button>
              ) : (
                <span>Admin session active</span>
              )}
            </div>
            <div className="relay-grid">
              <div className="relay-card">
                <p>Relay 1</p>
                <strong>{activeNode ? (activeNode.latest_reading.relay1_on ? "ON" : "OFF") : "--"}</strong>
                <div className="relay-actions">
                  <button type="button" disabled={controlMode !== "manual" || !activeNode} onClick={() => void handleManualRelay("relay1_on", true)}>ON</button>
                  <button type="button" disabled={controlMode !== "manual" || !activeNode} onClick={() => void handleManualRelay("relay1_on", false)}>OFF</button>
                </div>
              </div>
              <div className="relay-card">
                <p>Relay 2</p>
                <strong>{activeNode ? (activeNode.latest_reading.relay2_on ? "ON" : "OFF") : "--"}</strong>
                <div className="relay-actions">
                  <button type="button" disabled={controlMode !== "manual" || !activeNode} onClick={() => void handleManualRelay("relay2_on", true)}>ON</button>
                  <button type="button" disabled={controlMode !== "manual" || !activeNode} onClick={() => void handleManualRelay("relay2_on", false)}>OFF</button>
                </div>
              </div>
            </div>
            <p className="summary-panel__reason">
              {!activeNode
                ? "No node selected yet."
                : controlMode === "manual"
                  ? "Manual mode gives the operator direct relay control."
                  : controlMode === "esp32_fallback"
                    ? "ESP32 fallback mode tells the board to apply its own local threshold logic when cloud ML is unavailable or intentionally bypassed."
                    : "ML mode gives the AI model control over relay decisions based on current climate data."}
            </p>
          </div>

          <div className="panel panel--dark ai-insight">
            <div className="panel__header">
              <h2>AI Insight</h2>
              <span>{metrics.current_model}</span>
            </div>
            <div className="ai-insight__metrics">
              <div><p>Prediction</p><strong>{prediction ? (prediction.sprinkler_on ? "TURN ON" : "KEEP OFF") : "--"}</strong></div>
              <div><p>Confidence</p><strong>{prediction ? `${(prediction.confidence * 100).toFixed(1)}%` : "--"}</strong></div>
              <div><p>Model</p><strong>{metrics.model_version}</strong></div>
              <div><p>Source</p><strong>{mode === "simulation" ? "SIM" : "HARDWARE"}</strong></div>
            </div>
            <p className="summary-panel__reason">{prediction?.reason ?? "AI prediction will appear when compatible node data is available."}</p>
            <div className="dataset-trainer">
              <strong>Model Selection</strong>
              <p className="section-copy">Choose Auto to save the best-performing model, or lock training to one specific algorithm.</p>
              <div className="model-picker">
                <select value={metrics.preferred_model ?? "Auto"} onChange={(event) => void handlePreferredModelChange(event.target.value)} disabled={modelBusy}>
                  {(metrics.available_models ?? ["Auto"]).map((modelName) => (
                    <option key={modelName} value={modelName}>{modelName}</option>
                  ))}
                </select>
                <span>Current: {metrics.current_model}</span>
              </div>
            </div>
            <button type="button" className="ghost-button" onClick={() => void handleRetrain()}>Retrain Model</button>
            <div className="dataset-trainer">
              <strong>Train With Your Dataset</strong>
              <p className="section-copy">Upload a CSV with `temperature`, `humidity`, and `sprinkler_on` columns to retrain the backend model.</p>
              <label className="file-input">
                <span>{datasetFile ? datasetFile.name : "Choose CSV dataset"}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <button type="button" className="ghost-button" onClick={() => void handleDatasetRetrain()} disabled={datasetBusy}>
                {datasetBusy ? "Training..." : "Train Using Dataset"}
              </button>
              <button type="button" className="ghost-button" onClick={handleDownloadTrainingCsv} disabled={!allHistory.length}>
                Download Training CSV
              </button>
              <p className="summary-panel__reason">Supported values for `sprinkler_on`: 0/1, true/false, or on/off.</p>
            </div>
          </div>

          <div className="metric-grid metric-grid--analytics">
            <MetricCard title="Accuracy" value={`${(metrics.accuracy * 100).toFixed(1)}%`} helper="Overall correctness of sprinkler decisions." accent="safe" />
            <MetricCard title="Precision" value={`${(metrics.precision * 100).toFixed(1)}%`} helper="How often ON predictions are truly needed." accent="neutral" />
            <MetricCard title="Recall" value={`${(metrics.recall * 100).toFixed(1)}%`} helper="How often true heat stress is caught." accent="critical" />
            <MetricCard title="F1 Score" value={`${(metrics.f1_score * 100).toFixed(1)}%`} helper="Balanced overall classification score." accent="neutral" />
          </div>

          <div className="panel panel--dark table-panel">
            <div className="panel__header">
              <h2>Model Comparison</h2>
              <span>Best: {metrics.best_model}</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Accuracy</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([name, row]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{(row.accuracy * 100).toFixed(1)}%</td>
                    <td>{(row.precision * 100).toFixed(1)}%</td>
                    <td>{(row.recall * 100).toFixed(1)}%</td>
                    <td>{(row.f1_score * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="chart-row">
            <div className="panel chart-panel-alt">
              <div className="panel__header">
                <h2>Feature Importance</h2>
                <span>Model drivers</span>
              </div>
              <div className="chart-wrap chart-wrap--small">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={featureData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="feature" stroke={chartAxisColor} />
                    <YAxis stroke={chartAxisColor} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="importance" fill="var(--accent-strong)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel chart-panel-alt">
              <div className="panel__header">
                <h2>Confusion Matrix</h2>
                <span>Prediction quality</span>
              </div>
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>Actual</th>
                    <th>Pred OFF</th>
                    <th>Pred ON</th>
                  </tr>
                </thead>
                <tbody>
                  {confusionRows.map((row) => (
                    <tr key={row.actual}>
                      <td>{row.actual}</td>
                      <td>{row.predictedOff}</td>
                      <td>{row.predictedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {section === "history" ? (
        <section className="panel panel--dark table-panel">
          <div className="panel__header">
            <h2>History</h2>
            <div className="panel__header-actions">
              <span>{allHistory.length} records</span>
              <button type="button" className="ghost-button ghost-button--compact" onClick={handleDownloadCurrentDataCsv} disabled={!allHistory.length}>
                Download CSV
              </button>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Node</th>
                <th>Source</th>
                <th>Temp</th>
                <th>Humidity</th>
                <th>Ammonia</th>
                <th>Relay 1</th>
                <th>Relay 2</th>
                <th>AI</th>
              </tr>
            </thead>
            <tbody>
              {[...allHistory].reverse().slice(0, 40).map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td>{item.node_id}</td>
                  <td>{item.reading_source}</td>
                  <td>{item.temperature.toFixed(1)} C</td>
                  <td>{item.humidity.toFixed(0)}%</td>
                  <td>{item.ammonia ?? "--"}</td>
                  <td>{item.relay1_on ? "ON" : "OFF"}</td>
                  <td>{item.relay2_on ? "ON" : "OFF"}</td>
                  <td>{item.ai_decision ? "ON" : "OFF"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {section === "reports" ? (
        <section className="reports-grid">
          <div className="metric-grid metric-grid--analytics">
            <MetricCard title="Average Temperature" value={`${reportSummary.avgTemp.toFixed(1)} C`} helper="Average across the loaded history window." accent="neutral" />
            <MetricCard title="Average Humidity" value={`${reportSummary.avgHumidity.toFixed(1)} %`} helper="Average humidity across recent records." accent="safe" />
            <MetricCard title="Critical Readings" value={`${reportSummary.criticalCount}`} helper="Readings above 35 C or below 50% humidity." accent="critical" />
            <MetricCard title="Active Nodes" value={`${nodes.length}`} helper="Nodes currently represented in the selected mode." accent="neutral" />
          </div>
          <div className="panel panel--dark table-panel">
            <div className="panel__header">
              <h2>Node Report</h2>
              <span>Current operational snapshot</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Status</th>
                  <th>Control</th>
                  <th>Sprinkler</th>
                  <th>Temperature</th>
                  <th>Humidity</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => (
                  <tr key={node.node_id}>
                    <td>{node.node_id.replace("N", "Node ")}</td>
                    <td>{node.status}</td>
                    <td>{(controlStates[node.node_id]?.control_mode ?? "ml").replace("_", " ").toUpperCase()}</td>
                    <td>{node.latest_reading.sprinkler_on ? "ON" : "OFF"}</td>
                    <td>{node.latest_reading.temperature.toFixed(1)} C</td>
                    <td>{node.latest_reading.humidity.toFixed(0)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "info" ? (
        <section className="info-grid">
          <div className="panel panel--dark">
            <div className="panel__header">
              <h2>System Info</h2>
              <span>Project overview</span>
            </div>
            <p className="section-copy">This platform receives ESP32 master readings gathered from LoRa sensor nodes and combines monitoring, ML prediction, and relay control in one poultry heat-control dashboard.</p>
            <ul className="info-list">
              <li>Frontend: React + Vite + Recharts</li>
              <li>Backend: FastAPI + SQLAlchemy + scikit-learn</li>
              <li>Deployment: Render-friendly backend and static frontend</li>
              <li>Control: Manual mode, ML mode, or ESP32 fallback mode</li>
            </ul>
          </div>
          <div className="panel panel--dark">
            <div className="panel__header">
              <h2>ESP32 Payload</h2>
              <span>Expected format</span>
            </div>
            <pre className="code-block">N1, T35.6, H56, A99, S48, R10, R20</pre>
            <ul className="info-list">
              <li>`N1` = node id</li>
              <li>`T35.6` = temperature in Celsius</li>
              <li>`H56` = humidity percentage</li>
              <li>`A99` = ammonia ppm</li>
              <li>`R10` / `R11` = relay 1 off/on</li>
              <li>`R20` / `R21` = relay 2 off/on</li>
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
