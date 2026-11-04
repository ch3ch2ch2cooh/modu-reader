import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** taller sheet for lists */
  tall?: boolean;
  /** shorter sheet so the middle of the screen still toggles it */
  compact?: boolean;
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, children, tall, compact, footer }: SheetProps) {
  const openedAt = useRef(0);
  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // The tap that opened the sheet also produces a click event; ignore clicks on
  // the fresh backdrop for a moment so the sheet does not close instantly.
  const closeFromBackdrop = () => {
    if (Date.now() - openedAt.current > 300) onClose();
  };

  return (
    <div className="sheet-root" role="dialog" aria-modal="true">
      <div className="sheet-backdrop" onClick={closeFromBackdrop} />
      <div
        className={`sheet-panel ${tall ? 'sheet-panel--tall' : ''} ${
          compact ? 'sheet-panel--compact' : ''
        }`}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
