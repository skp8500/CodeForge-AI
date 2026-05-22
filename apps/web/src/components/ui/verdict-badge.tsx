const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  AC: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Accepted' },
  WA: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Wrong Answer' },
  TLE: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Time Limit Exceeded' },
  MLE: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Memory Limit Exceeded' },
  RE: { bg: 'bg-pink-500/20', text: 'text-pink-400', label: 'Runtime Error' },
  CE: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Compilation Error' },
  OLE: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Output Limit Exceeded' },
  IE: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Internal Error' },
  ERROR: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Error' },
};

interface Props {
  verdict: string;
  short?: boolean;
}

export function VerdictBadge({ verdict, short = false }: Props) {
  const style = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.IE!;
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {short ? verdict : style.label}
    </span>
  );
}

export function verdictLabel(verdict: string): string {
  return VERDICT_STYLES[verdict]?.label ?? verdict;
}

export function verdictColor(verdict: string): string {
  return VERDICT_STYLES[verdict]?.text ?? 'text-gray-400';
}
