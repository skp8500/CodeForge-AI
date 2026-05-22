interface Props {
  difficulty: 'easy' | 'medium' | 'hard';
}

const STYLES = {
  easy: 'bg-green-500/20 text-green-400 border border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  hard: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

export function DifficultyBadge({ difficulty }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STYLES[difficulty]}`}
    >
      {difficulty}
    </span>
  );
}
