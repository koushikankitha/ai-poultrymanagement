import type { NodeSummary } from "../types";
import { StatusBadge } from "./StatusBadge";

type NodeSidebarProps = {
  nodes: NodeSummary[];
  activeNode: string | null;
  onSelect: (nodeId: string) => void;
};

export function NodeSidebar({ nodes, activeNode, onSelect }: NodeSidebarProps) {
  return (
    <aside className="panel sidebar">
      <div className="panel__header">
        <h2>Sensor Nodes</h2>
        <span>{nodes.length} online</span>
      </div>
      <div className="node-list">
        {nodes.map((node) => (
          <button
            key={node.node_id}
            type="button"
            className={`node-list__item ${activeNode === node.node_id ? "active" : ""}`}
            onClick={() => onSelect(node.node_id)}
          >
            <div>
              <strong>{node.node_id.replace("N", "Node ")}</strong>
              <p>{new Date(node.latest_reading.created_at).toLocaleTimeString()}</p>
            </div>
            <StatusBadge
              label={node.status === "safe" ? "Safe" : "Critical"}
              tone={node.status}
            />
          </button>
        ))}
      </div>
    </aside>
  );
}
