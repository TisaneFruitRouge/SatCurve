import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

interface StatsCardProps {
  label: string;
  value: string | null;
  unit?: string;
  loading?: boolean;
}

export function StatsCard({ label, value, unit, loading }: StatsCardProps) {
  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-text-muted uppercase tracking-wider">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-32 bg-secondary" />
        ) : (
          <p className="text-2xl font-semibold font-mono text-text">
            {value ?? "—"}
            {unit && (
              <span className="text-base font-normal text-text-muted ml-1">
                {unit}
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
