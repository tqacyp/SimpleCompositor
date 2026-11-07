import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface HelpTipProps {
  /** 无障碍名称，也是按钮的 title。 */
  label: string;
  children: ReactNode;
  align?: 'left' | 'right';
}

/**
 * 问号按钮 + 气泡说明。
 *
 * 刻意不做成常驻文字：说明文字放在界面上会一直占地方，
 * 用过一次之后就是噪音。默认收起，点一下才出现。
 */
export function HelpTip({ label, children, align = 'right' }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="help-tip" ref={rootRef}>
      <button
        type="button"
        className={`help-btn ${open ? 'is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>

      {open && (
        <div className={`help-pop is-${align}`} role="tooltip">
          {children}
        </div>
      )}
    </div>
  );
}
