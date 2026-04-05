import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { Reading } from "../types";

type TrendChartProps = {
  data: Reading[];
};

export function TrendChart({ data }: TrendChartProps) {
  const chartData = data.map((item) => ({
    time: new Date(item.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    }),
    temperature: item.temperature,
    humidity: item.humidity,
    ammonia: item.ammonia ?? 0,
    soil: item.soil_moisture ?? 0
  }));

  return (
    <div className="panel chart-panel">
      <div className="panel__header">
        <h2>Historical Trends</h2>
        <span>Last {data.length} readings</span>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(113, 128, 150, 0.16)" />
            <XAxis dataKey="time" stroke="#5f6f86" />
            <YAxis stroke="#5f6f86" />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="temperature" stroke="#e05b3d" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="humidity" stroke="#1f8a70" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="ammonia" stroke="#b76e12" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="soil" stroke="#3d5a80" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
