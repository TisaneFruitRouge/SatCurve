import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

export interface YieldDataPoint {
  maturity: string;
  apy: number;
}

const PLACEHOLDER_DATA: YieldDataPoint[] = [
  { maturity: "3M", apy: 3.2 },
  { maturity: "6M", apy: 4.1 },
  { maturity: "1Y", apy: 5.0 },
  { maturity: "2Y", apy: 5.8 },
];

interface YieldChartProps {
  data?: YieldDataPoint[];
  loading?: boolean;
}

export function YieldChart({ data, loading }: YieldChartProps) {
  const chartData = data ?? PLACEHOLDER_DATA;
  const isPlaceholder = !data;

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-text-muted">
          Implied APY by Maturity
          {isPlaceholder && (
            <span className="ml-2 text-xs text-text-faint">(placeholder)</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-60 w-full bg-secondary" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="maturity" stroke="#8c8c8c" tick={{ fontSize: 12 }} />
              <YAxis stroke="#8c8c8c" unit="%" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#121212",
                  border: "1px solid #262626",
                  borderRadius: "0.5rem",
                }}
                labelStyle={{ color: "#fafafa" }}
                itemStyle={{ color: "#f7931a" }}
              />
              <Line
                type="monotone"
                dataKey="apy"
                stroke="#f7931a"
                strokeWidth={2}
                dot={{ fill: "#f7931a", r: 4 }}
                activeDot={{ r: 6, fill: "#f7931a" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
