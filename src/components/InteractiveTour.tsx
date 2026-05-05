import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';

export interface TourStep {
  targetSelector: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface InteractiveTourProps {
  steps: TourStep[];
  isActive: boolean;
  onFinish: () => void;
}

const TOOLTIP_W = 320;
const TOOLTIP_H_EST = 190;
const ARROW_GAP = 20;
const PAD = 8;

/**
 * Compute a bezier arrow path from tooltip edge to target edge.
 */
function getArrow(
  tRect: DOMRect,
  tPos: { top: number; left: number },
  pos: string
) {
  const tCx = tRect.left + tRect.width / 2;
  const tCy = tRect.top + tRect.height / 2;

  let tx: number, ty: number; // point on target
  let sx: number, sy: number; // point on tooltip

  if (pos === 'bottom') {
    tx = tCx;
    ty = tRect.bottom + PAD;
    sx = tPos.left + TOOLTIP_W / 2;
    sy = tPos.top;
  } else if (pos === 'top') {
    tx = tCx;
    ty = tRect.top - PAD;
    sx = tPos.left + TOOLTIP_W / 2;
    sy = tPos.top + TOOLTIP_H_EST;
  } else if (pos === 'left') {
    tx = tRect.left - PAD;
    ty = tCy;
    sx = tPos.left + TOOLTIP_W;
    sy = tPos.top + TOOLTIP_H_EST / 2;
  } else {
    tx = tRect.right + PAD;
    ty = tCy;
    sx = tPos.left;
    sy = tPos.top + TOOLTIP_H_EST / 2;
  }

  // Bezier control
  const isVert = pos === 'bottom' || pos === 'top';
  const mx = (tx + sx) / 2;
  const my = (ty + sy) / 2;
  const cx1 = isVert ? tx : mx;
  const cy1 = isVert ? my : ty;
  const cx2 = isVert ? sx : mx;
  const cy2 = isVert ? my : sy;

  const path = `M ${sx} ${sy} C ${cx2} ${cy2}, ${cx1} ${cy1}, ${tx} ${ty}`;

  // Arrowhead
  const angle = Math.atan2(ty - cy1, tx - cx1);
  const aLen = 10;
  const aAng = Math.PI / 6;
  const a1x = tx - aLen * Math.cos(angle - aAng);
  const a1y = ty - aLen * Math.sin(angle - aAng);
  const a2x = tx - aLen * Math.cos(angle + aAng);
  const a2y = ty - aLen * Math.sin(angle + aAng);

  return { path, head: `M ${a1x} ${a1y} L ${tx} ${ty} L ${a2x} ${a2y}`, sx, sy };
}

export default function InteractiveTour({ steps, isActive, onFinish }: InteractiveTourProps) {
  const [cur, setCur] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tip, setTip] = useState({ top: 0, left: 0 });
  const timer = useRef<number | null>(null);

  const step = steps[cur];
  const pos = step?.position || 'bottom';

  const refresh = useCallback(() => {
    if (!step || !isActive) return;
    const el = document.querySelector(step.targetSelector);
    if (!el) { setRect(null); return; }

    const r = el.getBoundingClientRect();
    setRect(r);

    let t = 0, l = 0;
    const p = step.position || 'bottom';

    if (p === 'bottom') {
      t = r.bottom + ARROW_GAP;
      l = r.left + r.width / 2 - TOOLTIP_W / 2;
    } else if (p === 'top') {
      t = r.top - TOOLTIP_H_EST - ARROW_GAP;
      l = r.left + r.width / 2 - TOOLTIP_W / 2;
    } else if (p === 'left') {
      t = r.top + r.height / 2 - TOOLTIP_H_EST / 2;
      l = r.left - TOOLTIP_W - ARROW_GAP;
    } else {
      t = r.top + r.height / 2 - TOOLTIP_H_EST / 2;
      l = r.right + ARROW_GAP;
    }

    // Clamp inside viewport with margin
    const m = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    l = Math.max(m, Math.min(l, vw - TOOLTIP_W - m));
    t = Math.max(m, Math.min(t, vh - TOOLTIP_H_EST - m));

    setTip({ top: t, left: l });
  }, [step, isActive]);

  useEffect(() => {
    if (!isActive) { setCur(0); return; }
    refresh();
    const onResize = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(refresh, 80) as unknown as number;
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', refresh, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [isActive, cur, refresh]);

  useEffect(() => {
    if (!isActive) return;
    const iv = setInterval(refresh, 350);
    return () => clearInterval(iv);
  }, [isActive, refresh]);

  const next = () => cur < steps.length - 1 ? setCur(c => c + 1) : finish();
  const prev = () => cur > 0 && setCur(c => c - 1);
  const finish = () => { setCur(0); onFinish(); };

  if (!isActive || !step) return null;

  const arrow = rect ? getArrow(rect, tip, pos) : null;

  return createPortal(
    <AnimatePresence mode="wait">
      <motion.div
        key="tour-root"
        className="fixed inset-0"
        style={{ zIndex: 99999 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* ── Dark overlay with spotlight cutout ── */}
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }}>
          <defs>
            <mask id="tour-spotlight">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.left - PAD}
                  y={rect.top - PAD}
                  width={rect.width + PAD * 2}
                  height={rect.height + PAD * 2}
                  rx="14"
                  ry="14"
                  fill="black"
                />
              )}
            </mask>
            {/* Soft radial for spotlight glow */}
            {rect && (
              <radialGradient id="spot-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(59,130,246,0.12)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0)" />
              </radialGradient>
            )}
          </defs>
          {/* Dark backdrop */}
          <rect
            x="0" y="0"
            width="100%"
            height="100%"
            fill="rgba(2, 6, 23, 0.82)"
            mask="url(#tour-spotlight)"
          />
          {/* Soft glow around spotlight */}
          {rect && (
            <rect
              x={rect.left - 40}
              y={rect.top - 40}
              width={rect.width + 80}
              height={rect.height + 80}
              rx="30"
              fill="url(#spot-glow)"
            />
          )}
        </svg>

        {/* ── Highlight ring ── */}
        {rect && (
          <motion.div
            key={`ring-${cur}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute pointer-events-none rounded-2xl"
            style={{
              left: rect.left - PAD,
              top: rect.top - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              zIndex: 2,
              border: '2px solid rgba(99, 102, 241, 0.7)',
              boxShadow:
                '0 0 0 3px rgba(99, 102, 241, 0.15), ' +
                '0 0 20px 4px rgba(99, 102, 241, 0.18), ' +
                'inset 0 0 12px rgba(99, 102, 241, 0.06)',
            }}
          />
        )}

        {/* ── Animated SVG arrow ── */}
        {arrow && rect && (
          <motion.svg
            key={`arr-${cur}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 4 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            {/* Glow */}
            <motion.path
              d={arrow.path}
              fill="none"
              stroke="rgba(129, 140, 248, 0.25)"
              strokeWidth="5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.2, ease: 'easeOut' }}
            />
            {/* Dashed line */}
            <motion.path
              d={arrow.path}
              fill="none"
              stroke="rgb(129, 140, 248)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="5 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.2, ease: 'easeOut' }}
            />
            {/* Arrowhead */}
            <motion.path
              d={arrow.head}
              fill="none"
              stroke="rgb(129, 140, 248)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.55 }}
            />
            {/* Pulsing dot at source */}
            <motion.circle
              cx={arrow.sx}
              cy={arrow.sy}
              r="3.5"
              fill="rgb(129, 140, 248)"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.3, 0.9] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: 0.6 }}
            />
          </motion.svg>
        )}

        {/* ── Tooltip card ── */}
        <motion.div
          key={`tip-${cur}`}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          className="absolute"
          style={{
            top: tip.top,
            left: tip.left,
            width: TOOLTIP_W,
            zIndex: 5,
          }}
        >
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.04)] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-white/70" />
                <span className="text-white/80 text-[11px] font-bold uppercase tracking-widest">
                  {cur + 1} / {steps.length}
                </span>
              </div>
              <button
                onClick={finish}
                className="p-1 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pt-4 pb-3">
              <h3 className="text-sm font-bold text-slate-800 mb-1.5 leading-snug">{step.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{step.description}</p>
            </div>

            {/* Footer */}
            <div className="px-5 pb-3.5 flex items-center justify-between">
              {/* Progress dots */}
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === cur
                        ? 'bg-indigo-500 w-4'
                        : i < cur
                        ? 'bg-indigo-300 w-1.5'
                        : 'bg-slate-200 w-1.5'
                    }`}
                  />
                ))}
              </div>

              <div className="flex gap-1.5">
                {cur > 0 && (
                  <button
                    onClick={prev}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Назад
                  </button>
                )}
                <button
                  onClick={next}
                  className="px-3 py-1 text-[11px] font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-0.5 shadow-sm cursor-pointer"
                >
                  {cur < steps.length - 1 ? (
                    <>Далее <ChevronRight className="w-3 h-3" /></>
                  ) : (
                    'Готово ✓'
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
