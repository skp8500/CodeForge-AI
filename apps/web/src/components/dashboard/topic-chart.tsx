'use client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TopicProgress } from '@/lib/api';

interface Props {
  data: TopicProgress[];
}

export function TopicChart({ data }: Props) {
  const chartData = [...data]
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, 10)
    .map((item) => ({
      tag: item.tag.length > 13 ? item.tag.slice(0, 12) + '…' : item.tag,
      Attempted: item.attempted,
      Solved: item.solved,
    }));

  if (chartData.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-gray-500">
        No topic data yet — start solving problems!
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 52 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="tag"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#f3f4f6', fontWeight: 600 }}
          itemStyle={{ color: '#d1d5db' }}
        />
        <Legend
          wrapperStyle={{ color: '#9ca3af', fontSize: '12px', paddingTop: '8px' }}
        />
        <Bar dataKey="Attempted" fill="#2563eb" radius={[2, 2, 0, 0]} maxBarSize={18} />
        <Bar dataKey="Solved" fill="#22c55e" radius={[2, 2, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
