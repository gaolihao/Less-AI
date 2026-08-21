export default function Gauge({ value, size = 'md' }) {
  const hasValue = value !== null;
  const percent = hasValue ? Math.min(100, Math.max(0, value)) : 0;
  const radius = 70;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const center = 100;

  return (
    <div className={`gauge gauge-${size}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        {hasValue && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            className="gauge-fill"
          />
        )}
      </svg>
      <span className="gauge-value">{hasValue ? `${percent}%` : '—%'}</span>
    </div>
  );
}
