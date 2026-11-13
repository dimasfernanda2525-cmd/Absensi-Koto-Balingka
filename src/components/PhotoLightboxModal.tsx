import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface PhotoLightboxModalProps {
  isOpen: boolean;
  imageUrl: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function PhotoLightboxModal({
  isOpen,
  imageUrl,
  title,
  subtitle,
  onClose,
}: PhotoLightboxModalProps) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setZoomed(false);
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, imageUrl, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold text-white truncate">{title}</h3>
            {subtitle && (
              <p className="text-xs text-slate-400 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer"
            >
              {zoomed ? (
                <>
                  <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Normal</span>
                </>
              ) : (
                <>
                  <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Perbesar</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              aria-label="Tutup tampilan foto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-4">
          <img
            src={imageUrl}
            alt={title}
            onClick={() => setZoomed((z) => !z)}
            className={`rounded-lg transition-transform duration-200 cursor-pointer select-none ${
              zoomed
                ? 'max-w-none w-[140%] sm:w-[125%] object-contain'
                : 'max-h-[74vh] max-w-full object-contain'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
