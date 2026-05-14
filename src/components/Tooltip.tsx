import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  maxWidth?: number;
  key?: React.Key;
}

export default function Tooltip({ 
  text, 
  children, 
  position = 'top', 
  delay = 300,
  className = '',
  maxWidth = 220
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let x = rect.left + rect.width / 2;
    let y = rect.top;

    const offset = 10;

    if (position === 'bottom') {
      y = rect.bottom + offset;
    } else if (position === 'left') {
      x = rect.left - offset;
      y = rect.top + rect.height / 2;
    } else if (position === 'right') {
      x = rect.right + offset;
      y = rect.top + rect.height / 2;
    } else {
      y = rect.top - offset;
    }

    // CLAMPING: Don't let tooltip go outside screen
    const padding = 12;
    const halfWidth = maxWidth / 2;

    if (x - halfWidth < padding) x = halfWidth + padding;
    if (x + halfWidth > viewportW - padding) x = viewportW - halfWidth - padding;
    
    if (y < padding) y = padding;
    if (y > viewportH - padding) y = viewportH - padding;

    setCoords({ x, y });
  };

  const show = () => {
    updateCoords();
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const tooltipStyles: React.CSSProperties = {
    position: 'fixed',
    top: coords.y,
    left: coords.x,
    transform: position === 'top' ? 'translate(-50%, -100%)' :
               position === 'bottom' ? 'translate(-50%, 0)' :
               position === 'left' ? 'translate(-100%, -50%)' :
               'translate(0, -50%)',
    zIndex: 999999,
    pointerEvents: 'none',
    maxWidth: maxWidth
  };

  if (!text) return <>{children}</>;

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              style={tooltipStyles}
              className="px-3 py-2 bg-slate-900/95 text-white text-[12px] font-bold rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.4)] whitespace-normal text-center leading-snug border border-white/10 backdrop-blur-md"
            >
              {text}
              <div 
                className={`absolute w-0 h-0 border-[5px] border-transparent ${
                  position === 'top' ? 'border-t-slate-900 -bottom-[10px] translate-x-[-50%] left-1/2' :
                  position === 'bottom' ? 'border-b-slate-900 -top-[10px] translate-x-[-50%] left-1/2' :
                  position === 'left' ? 'border-l-slate-900 -right-[10px] translate-y-[-50%] top-1/2' :
                  'border-r-slate-900 -left-[10px] translate-y-[-50%] top-1/2'
                }`}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
