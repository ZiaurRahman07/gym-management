type Point = { label: string; value: number };

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * power;
}

function subset<T>(items: T[], max: number): number[] {
  if (items.length <= max) return items.map((_, index) => index);
  const step = Math.ceil(items.length / max);
  const indexes: number[] = [];
  for (let i = 0; i < items.length; i += step) indexes.push(i);
  if (indexes[indexes.length - 1] !== items.length - 1) indexes.push(items.length - 1);
  return indexes;
}

export function AreaChart({
  data,
  height = 240,
  formatValue = (value) => value.toLocaleString(),
  formatLabel = (label) => label,
}: {
  data: Point[];
  height?: number;
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
}) {
  if (data.length === 0) return <div className="chart-empty">No data for this period.</div>;

  const width = 760;
  const padding = { top: 18, right: 14, bottom: 30, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(...data.map((point) => point.value)));
  const denominator = Math.max(1, data.length - 1);

  const coords = data.map((point, index) => ({
    x: padding.left + (index / denominator) * plotWidth,
    y: padding.top + plotHeight - (point.value / max) * plotHeight,
    ...point,
  }));

  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${padding.top + plotHeight} L${coords[0].x.toFixed(
    1,
  )},${padding.top + plotHeight} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const labelIndexes = subset(data, 7);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Revenue trend chart">
        {gridLines.map((ratio) => {
          const y = padding.top + plotHeight * ratio;
          const value = max * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid" />
              <text x={padding.left - 10} y={y + 4} className="chart-axis" textAnchor="end">
                {formatValue(value)}
              </text>
            </g>
          );
        })}
        <path d={area} className="chart-area" />
        <path d={line} className="chart-line" />
        {coords.map((point, index) =>
          data.length <= 16 ? (
            <g key={index}>
              <circle cx={point.x} cy={point.y} r="9" fill="transparent">
                <title>{`${formatLabel(point.label)}: ${formatValue(point.value)}`}</title>
              </circle>
              <circle cx={point.x} cy={point.y} r="3.2" className="chart-dot" />
            </g>
          ) : null,
        )}
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={coords[index].x}
            y={height - 8}
            className="chart-axis"
            textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
          >
            {formatLabel(data[index].label)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({
  data,
  height = 220,
  formatValue = (value) => value.toLocaleString(),
  formatLabel = (label) => label,
  color = '#145c4a',
}: {
  data: Point[];
  height?: number;
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  color?: string;
}) {
  if (data.length === 0) return <div className="chart-empty">No data for this period.</div>;

  const width = 760;
  const padding = { top: 18, right: 14, bottom: 30, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(...data.map((point) => point.value)));
  const slot = plotWidth / Math.max(1, data.length);
  const barWidth = Math.max(6, Math.min(46, slot * 0.55));
  const labelIndexes = subset(data, 8);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Bar chart">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid" />
              <text x={padding.left - 10} y={y + 4} className="chart-axis" textAnchor="end">
                {formatValue(max * (1 - ratio))}
              </text>
            </g>
          );
        })}
        {data.map((point, index) => {
          const barHeight = (point.value / max) * plotHeight;
          const x = padding.left + slot * index + (slot - barWidth) / 2;
          const y = padding.top + plotHeight - barHeight;
          return (
            <g key={index}>
              <rect x={x} y={y} width={barWidth} height={Math.max(1.5, barHeight)} rx="4" fill={color} opacity={0.9}>
                <title>{`${formatLabel(point.label)}: ${formatValue(point.value)}`}</title>
              </rect>
            </g>
          );
        })}
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={padding.left + slot * index + slot / 2}
            y={height - 8}
            className="chart-axis"
            textAnchor="middle"
          >
            {formatLabel(data[index].label)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function Donut({
  segments,
  centerLabel,
  centerValue,
  size = 168,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const stops = segments.map((segment) => {
    const start = total === 0 ? 0 : (cursor / total) * 360;
    cursor += segment.value;
    const end = total === 0 ? 0 : (cursor / total) * 360;
    return `${segment.color} ${start}deg ${end}deg`;
  });
  const background = total === 0 ? 'var(--surface-3)' : `conic-gradient(${stops.join(', ')})`;

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background, width: size, height: size }}>
        <div className="donut-hole">
          {centerValue && <strong>{centerValue}</strong>}
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      </div>
      <div className="donut-legend">
        {segments.map((segment) => (
          <div className="legend-row" key={segment.label}>
            <span className="legend-dot" style={{ background: segment.color }} />
            <span className="legend-label">{segment.label}</span>
            <span className="legend-value">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
