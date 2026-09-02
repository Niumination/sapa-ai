'use client';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: string;
  color?: 'green' | 'amber' | 'red' | 'blue';
}

const COLORS = {
  green: 'bg-green-50 border-green-200 text-green-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
};

const CHANGE_COLORS = {
  green: 'text-green-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
  blue: 'text-blue-600',
};

export default function MetricCard({
  label,
  value,
  change,
  changeLabel,
  icon,
  color = 'blue',
}: MetricCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${COLORS[color]}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium opacity-80">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {(change !== undefined || changeLabel) && (
        <p className={`text-xs mt-1 ${CHANGE_COLORS[color]}`}>
          {change !== undefined && `${change > 0 ? '+' : ''}${change}%`}
          {changeLabel && ` ${changeLabel}`}
        </p>
      )}
    </div>
  );
}
