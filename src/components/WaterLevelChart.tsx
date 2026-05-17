import React, { useId, useLayoutEffect, useRef, useState } from 'react';

const CHART_HEIGHT_PX = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 8 };

function buildPath(
  points: { x: number; y: number }[],
  closeToBottom: number
): string {
  if (points.length === 0) return '';
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x} ${closeToBottom} L ${first.x} ${closeToBottom} Z`;
}

export default function WaterLevelChart({ data }: { data: { name: string; level: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const gradientId = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };

    updateWidth();
    const rafId = requestAnimationFrame(() => requestAnimationFrame(updateWidth));
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT_PX - PAD.top - PAD.bottom;
  const canRender = width > 0 && data.length > 0;

  let areaPath = '';
  let linePath = '';
  let minLevel = 0;
  let maxLevel = 0;
  let ticks: { x: number; label: string }[] = [];

  if (canRender) {
    const levels = data.map((d) => d.level);
    minLevel = Math.min(...levels);
    maxLevel = Math.max(...levels);
    const span = maxLevel - minLevel || 1;

    const pts = data.map((d, i) => {
      const x = PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
      const y = PAD.top + plotH - ((d.level - minLevel) / span) * plotH;
      return { x, y, label: d.name };
    });

    const baseline = PAD.top + plotH;
    areaPath = buildPath(pts, baseline);
    linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    ticks = pts.map((p) => ({ x: p.x, label: p.label }));
  }

  return (
    <div
      ref={containerRef}
      className="w-full min-w-0"
      style={{ height: CHART_HEIGHT_PX, minHeight: CHART_HEIGHT_PX }}
      role="img"
      aria-label="График уровней воды за 10 дней"
    >
      {!canRender ? (
        <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">
          {data.length === 0 ? 'Нет данных для графика' : null}
        </div>
      ) : (
        <svg width={width} height={CHART_HEIGHT_PX} className="block">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + plotH * t}
              y2={PAD.top + plotH * t}
              stroke="#f1f5f9"
              strokeDasharray="3 3"
            />
          ))}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          {ticks.map((t) => (
            <text
              key={t.label}
              x={t.x}
              y={CHART_HEIGHT_PX - 6}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={10}
              fontWeight={700}
            >
              {t.label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
