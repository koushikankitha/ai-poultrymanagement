import { useState } from "react";

type ControlPanelProps = {
  activeNode: string;
  aiDecision: boolean;
  sprinklerOn: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
  onManualControl: (sprinklerOn: boolean) => Promise<void>;
  onRetrain: () => Promise<void>;
  isAuthenticated: boolean;
};

export function ControlPanel({
  activeNode,
  aiDecision,
  sprinklerOn,
  onLogin,
  onManualControl,
  onRetrain,
  isAuthenticated
}: ControlPanelProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setBusy(true);
    try {
      await onLogin(username, password);
    } finally {
      setBusy(false);
    }
  }

  async function handleManual(value: boolean) {
    setBusy(true);
    try {
      await onManualControl(value);
    } finally {
      setBusy(false);
    }
  }

  async function handleRetrain() {
    setBusy(true);
    try {
      await onRetrain();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel control-panel">
      <div className="panel__header">
        <h2>Control Center</h2>
        <span>{activeNode.replace("N", "Node ")}</span>
      </div>

      <div className="control-panel__decision">
        <p>AI Decision</p>
        <strong className={aiDecision ? "text-critical" : "text-safe"}>
          {aiDecision ? "Sprinkler ON" : "Sprinkler OFF"}
        </strong>
        <small>Manual mode can override the current prediction.</small>
      </div>

      {!isAuthenticated ? (
        <div className="login-box">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
          />
          <button type="button" onClick={handleLogin} disabled={busy}>
            Admin Login
          </button>
        </div>
      ) : (
        <div className="manual-buttons">
          <button type="button" onClick={() => handleManual(true)} disabled={busy}>
            Force ON
          </button>
          <button type="button" onClick={() => handleManual(false)} disabled={busy}>
            Force OFF
          </button>
          <button type="button" onClick={handleRetrain} disabled={busy}>
            Retrain Model
          </button>
        </div>
      )}

      <div className="control-panel__status">
        <span>Current sprinkler state</span>
        <strong className={sprinklerOn ? "text-critical" : "text-safe"}>
          {sprinklerOn ? "Running" : "Idle"}
        </strong>
      </div>
    </section>
  );
}
