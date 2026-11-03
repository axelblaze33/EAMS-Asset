"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/depreciation";

// Mark specs: thin bars, 4px rounded data-end, recessive grid, tooltips on every
// mark. Colors come from --series-1/2 (validated for CVD + contrast, light & dark).
// Each chart also renders a visually hidden table for screen readers.

type Datum = { label: string; value: number };

function SrTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ranked horizontal bars for "how many per X" (single series, so no legend). */
export function RankedBars({ data, label, unit = "assets" }: { data: Datum[]; label: string; unit?: string }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No data for these filters.</p>;
  const config = { value: { label, color: "var(--series-1)" } } satisfies ChartConfig;
  const height = Math.max(160, data.length * 34 + 16);
  return (
    <>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }} aria-hidden>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tickMargin={6} />
          <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideLabel={false} indicator="dot" />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList dataKey="value" position="right" offset={8} className="fill-muted-foreground" fontSize={12} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <SrTable caption={label} headers={["", unit]} rows={data.map((d) => [d.label, d.value])} />
    </>
  );
}

type Trend = { month: string; assignments: number; returns: number; purchased: number; spend: number };

/** Assignments vs returns per month: one measure (count), two series, one axis. */
export function MovementChart({ data }: { data: Trend[] }) {
  const config = {
    assignments: { label: "Assignments", color: "var(--series-1)" },
    returns: { label: "Returns", color: "var(--series-2)" },
  } satisfies ChartConfig;
  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden>
        <BarChart data={data} margin={{ left: -16, right: 4, top: 8 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
          <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent indicator="dot" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="assignments" fill="var(--color-assignments)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="returns" fill="var(--color-returns)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ChartContainer>
      <SrTable caption="Assignments and returns per month" headers={["Month", "Assignments", "Returns"]} rows={data.map((d) => [d.month, d.assignments, d.returns])} />
    </>
  );
}

/** Procurement spend per month; the asset count is in the tooltip. */
export function ProcurementChart({ data }: { data: Trend[] }) {
  const config = { spend: { label: "Spend", color: "var(--series-1)" } } satisfies ChartConfig;
  const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden>
        <BarChart data={data} margin={{ left: 0, right: 4, top: 8 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `₹${compact.format(v)}`} />
          <ChartTooltip
            cursor={{ fillOpacity: 0.4 }}
            content={
              <ChartTooltipContent
                indicator="dot"
                formatter={(value, _name, item) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{(item.payload as Trend).purchased} assets</span>
                    <span className="font-medium tabular-nums">{formatMoney(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="spend" fill="var(--color-spend)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartContainer>
      <SrTable
        caption="Procurement per month"
        headers={["Month", "Assets purchased", "Spend"]}
        rows={data.map((d) => [d.month, d.purchased, formatMoney(d.spend)])}
      />
    </>
  );
}
