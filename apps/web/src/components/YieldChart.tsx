import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Placeholder data — replace with live data from bond-factory contract
const PLACEHOLDER_DATA = [
  { maturity: "3M", apy: 3.2 },
  { maturity: "6M", apy: 4.1 },
  { maturity: "1Y", apy: 5.0 },
  { maturity: "2Y", apy: 5.8 },
  { maturity: "3Y", apy: 6.3 },
];

export function YieldChart() {
  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
      <p className="text-sm text-white/40 mb-4">
        Implied APY by Maturity (placeholder)
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={PLACEHOLDER_DATA}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
          />
          <XAxis dataKey="maturity" stroke="#ffffff60" />
          <YAxis stroke="#ffffff60" unit="%" />
          <Tooltip
            contentStyle={{ backgroundColor: "#111", border: "none" }}
            labelStyle={{ color: "#fff" }}
          />
          <Line
            type="monotone"
            dataKey="apy"
            stroke="#f7931a"
            strokeWidth={2}
            dot={{ fill: "#f7931a" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
