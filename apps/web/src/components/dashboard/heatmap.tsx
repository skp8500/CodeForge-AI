'use client';
import type { HeatmapEntry } from '@/lib/api';

interface Props {
  data: HeatmapEntry[];
}

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;
const LEFT = 28;
const TOP = 22;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cellColor(count: number): string {
  if (count === 0) return '#1e293b';
  if (count <= 2) return '#1e3a8a';
  if (count <= 4) return '#1d4ed8';
  if (count <= 7) return '#2563eb';
  return '#3b82f6';
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

type Cell = { date: Date; count: number; future: boolean };

export function SubmissionHeatmap({ data }: Props) {
  const dataMap = new Map(data.map((e) => [e.date, e.count]));

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay()); // align to Sunday

  const weeks: Cell[][] = [];
  let week: Cell[] = [];
  const cursor = new Date(start);

  while (cursor <= today || week.length > 0) {
    const future = cursor > today;
    week.push({ date: new Date(cursor), count: dataMap.get(isoDate(cursor)) ?? 0, future });
    cursor.setDate(cursor.getDate() + 1);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    if (cursor > today && week.length === 0) break;
  }
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ date: new Date(cursor), count: 0, future: true });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  const monthLabels: { x: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, wi) => {
    const m = w[0]!.date.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ x: LEFT + wi * STEP, label: MONTHS[m]! });
      lastMonth = m;
    }
  });

  const W = LEFT + weeks.length * STEP;
  const H = TOP + 7 * STEP;

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {monthLabels.map((ml, i) => (
          <text key={i} x={ml.x} y={14} fill="#6b7280" fontSize="10">
            {ml.label}
          </text>
        ))}

        {[1, 3, 5].map((di) => (
          <text
            key={di}
            x={LEFT - 4}
            y={TOP + di * STEP + CELL - 1}
            fill="#6b7280"
            fontSize="10"
            textAnchor="end"
          >
            {['Mon', 'Wed', 'Fri'][di === 1 ? 0 : di === 3 ? 1 : 2]}
          </text>
        ))}

        {weeks.map((w, wi) =>
          w.map((cell, di) => (
            <rect
              key={`${wi}-${di}`}
              x={LEFT + wi * STEP}
              y={TOP + di * STEP}
              width={CELL}
              height={CELL}
              rx="2"
              fill={cell.future ? 'transparent' : cellColor(cell.count)}
            >
              <title>
                {isoDate(cell.date)}: {cell.count} submission{cell.count !== 1 ? 's' : ''}
              </title>
            </rect>
          ))
        )}
      </svg>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-gray-500">
        <span>Less</span>
        {[0, 2, 4, 6, 8].map((n) => (
          <span
            key={n}
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: cellColor(n) }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
