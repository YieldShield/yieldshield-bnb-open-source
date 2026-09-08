import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

/** Green area chart (line #1F8A5B, green→transparent gradient fill). Area charts only, per design. */
export function GreenAreaChart({
  data,
  xKey,
  yKey,
  height = 180,
  showAxis = false,
  formatY,
  formatX,
}: {
  data: Array<Record<string, number>>;
  xKey: string;
  yKey: string;
  height?: number;
  showAxis?: boolean;
  formatY?: (v: number) => string;
  formatX?: (v: number) => string;
}) {
  const gradId = `grad-${yKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F8A5B" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#1F8A5B" stopOpacity={0} />
          </linearGradient>
        </defs>
        {showAxis ? (
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#A6ADB6", fontSize: 11 }}
            tickFormatter={formatX}
            minTickGap={28}
          />
        ) : (
          <XAxis dataKey={xKey} hide />
        )}
        {showAxis ? (
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "#A6ADB6", fontSize: 11 }}
            tickFormatter={formatY}
          />
        ) : (
          <YAxis hide domain={["dataMin", "dataMax"]} />
        )}
        <Area
          type="monotone"
          dataKey={yKey}
          stroke="#1F8A5B"
          strokeWidth={2.5}
          strokeLinejoin="round"
          fill={`url(#${gradId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
