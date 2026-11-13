import React, { useEffect, useRef, useState } from 'react';

type Props = {
  trigger: () => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  label: string;
  /** 覆盖 aria-label（读屏用）；默认用 label */
  ariaLabel?: string;
  className?: string;
  placement?: 'up' | 'down';
  align?: 'left' | 'right';
};

export default function PopoverMenu({ trigger, children, label, ariaLabel, className = '', placement = 'up', align = 'left' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const panelPosition = placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2';
  const panelAlign = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        onClick={() => setOpen((v) => !v)}
        className="w-full"
      >
        {trigger()}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${panelPosition} ${panelAlign} w-56 rounded-xl border shadow-xl z-[100] overflow-hidden bg-white border-gray-200 dark:bg-[#2c2c2c] dark:border-[#383838]`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}