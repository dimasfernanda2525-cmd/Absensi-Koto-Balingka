import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop, Loader2, Move, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface CroppedPhotoResult {
  dataUrl: string;
  width: number;
  height: number;
}

interface PhotoCropModalProps {
  isOpen: boolean;
  file: File | null;
  mode: 'avatar' | 'cover';
  maxBytesLength: number;
  onCancel: () => void;
  onConfirm: (result: CroppedPhotoResult) => void;
}

const FRAME_DIMS = {
  avatar: { width: 280, height: 280, label: 'Kotak Foto Profil (1:1)' },
  cover: { width: 450, height: 150, label: 'Kotak Foto Sampul (3:1)' },
} as const;

export function PhotoCropModal({
  isOpen,
  file,
  mode,
  maxBytesLength,
  onCancel,
  onConfirm,
}: PhotoCropModalProps) {
  const frame = FRAME_DIMS[mode];

  const [imageSrc, setImageSrc] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(
    null
  );
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(frame.width);

  useEffect(() => {
    setMeasuredWidth(frame.width);
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setMeasuredWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [frame.width, isOpen, imageSrc]);

  const activeFrameW = measuredWidth || frame.width;
  const activeFrameH = activeFrameW * (frame.height / frame.width);

  useEffect(() => {
    if (!isOpen || !file) {
      setImageSrc('');
      setNaturalSize(null);
      setErrorMsg(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    if (!file.type.startsWith('image/')) {
      setErrorMsg('File harus berupa gambar (JPG, PNG, atau WebP).');
      return;
    }

    setLoadingFile(true);
    setErrorMsg(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const reader = new FileReader();
    reader.onerror = () => {
      setLoadingFile(false);
      setErrorMsg('Gagal membaca file gambar.');
    };
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const probe = new Image();
      probe.onerror = () => {
        setLoadingFile(false);
        setErrorMsg('Format gambar tidak dapat dimuat.');
      };
      probe.onload = () => {
        const w = probe.naturalWidth || probe.width;
        const h = probe.naturalHeight || probe.height;
        if (!w || !h) {
          setLoadingFile(false);
          setErrorMsg('Dimensi gambar tidak valid.');
          return;
        }
        setNaturalSize({ width: w, height: h });
        setImageSrc(dataUrl);
        setLoadingFile(false);
      };
      probe.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [isOpen, file]);

  const baseScale = useMemo(() => {
    if (!naturalSize) return 1;
    return Math.max(activeFrameW / naturalSize.width, activeFrameH / naturalSize.height);
  }, [naturalSize, activeFrameW, activeFrameH]);

  const effectiveScale = baseScale * zoom;

  const renderedWidth = naturalSize ? naturalSize.width * effectiveScale : activeFrameW;
  const renderedHeight = naturalSize ? naturalSize.height * effectiveScale : activeFrameH;

  const maxOffsetX = Math.max(0, (renderedWidth - activeFrameW) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - activeFrameH) / 2);

  function clampOffset(nextX: number, nextY: number, z = zoom) {
    if (!naturalSize) return { x: 0, y: 0 };
    const eff = baseScale * z;
    const rw = naturalSize.width * eff;
    const rh = naturalSize.height * eff;
    const mx = Math.max(0, (rw - activeFrameW) / 2);
    const my = Math.max(0, (rh - activeFrameH) / 2);
    return {
      x: Math.min(mx, Math.max(-mx, nextX)),
      y: Math.min(my, Math.max(-my, nextY)),
    };
  }

  function handleZoomChange(nextZoom: number) {
    const clampedZoom = Math.min(3, Math.max(1, Number(nextZoom.toFixed(2))));
    setZoom(clampedZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, clampedZoom));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!naturalSize || applying) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: offset.x,
      startY: offset.y,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;
    setOffset(clampOffset(dragStartRef.current.startX + dx, dragStartRef.current.startY + dy));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
    }
    setDragging(false);
    dragStartRef.current = null;
  }

  const outputDimensions = useMemo(() => {
    if (!naturalSize) return null;
    const sw = Math.min(naturalSize.width, Math.max(1, Math.round(activeFrameW / effectiveScale)));
    const sh = Math.min(naturalSize.height, Math.max(1, Math.round(activeFrameH / effectiveScale)));
    return { width: sw, height: sh };
  }, [naturalSize, activeFrameW, activeFrameH, effectiveScale]);

  async function handleConfirmCrop() {
    if (!imgRef.current || !naturalSize || applying) return;
    setApplying(true);
    setErrorMsg(null);

    try {
      // Compute exact source pixel rectangle in natural coordinates
      const imgLeftInFrame = (activeFrameW - renderedWidth) / 2 + offset.x;
      const imgTopInFrame = (activeFrameH - renderedHeight) / 2 + offset.y;

      const sx = Math.max(0, Math.min(naturalSize.width - 1, -imgLeftInFrame / effectiveScale));
      const sy = Math.max(0, Math.min(naturalSize.height - 1, -imgTopInFrame / effectiveScale));
      const sw = Math.min(naturalSize.width - sx, activeFrameW / effectiveScale);
      const sh = Math.min(naturalSize.height - sy, activeFrameH / effectiveScale);

      const targetW = Math.max(1, Math.round(sw));
      const targetH = Math.max(1, Math.round(sh));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Tidak dapat memproses pemotongan foto di peramban.');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, targetW, targetH);

      // Encode at full cropped pixel resolution; adjust JPEG quality only if exceeding DB byte limit
      const qualities = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5, 0.4, 0.32, 0.25];
      let chosenDataUrl: string | null = null;
      for (const q of qualities) {
        const candidate = canvas.toDataURL('image/jpeg', q);
        if (candidate.length <= maxBytesLength) {
          chosenDataUrl = candidate;
          break;
        }
      }

      if (!chosenDataUrl) {
        throw new Error(
          `Hasil potongan (${targetW}×${targetH} px) melebihi kapasitas database (~340 KB). Coba perbesar zoom agar area potong lebih ringkas.`
        );
      }

      onConfirm({
        dataUrl: chosenDataUrl,
        width: targetW,
        height: targetH,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memotong foto.');
    } finally {
      setApplying(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-crop-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-800 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Crop className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="photo-crop-title" className="font-display text-sm font-semibold truncate">
                Potong &amp; Sesuaikan {mode === 'avatar' ? 'Foto Profil' : 'Foto Sampul'}
              </h2>
              <p className="text-[11px] text-emerald-100/90 truncate">
                {frame.label} · Geser dan atur zoom hingga pas dengan kotak
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer disabled:opacity-50"
            aria-label="Tutup jendela potong foto"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 bg-slate-50/70">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800"
            >
              {errorMsg}
            </div>
          )}

          {/* Interactive Crop Viewport */}
          <div className="flex flex-col items-center justify-center bg-slate-900 rounded-xl p-5 border border-slate-800">
            {loadingFile ? (
              <div className="h-56 flex flex-col items-center justify-center gap-2 text-slate-200">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" aria-hidden="true" />
                <span className="text-xs">Memuat foto ke area pemotongan...</span>
              </div>
            ) : imageSrc && naturalSize ? (
              <div className="space-y-3 flex flex-col items-center w-full">
                <div
                  ref={frameRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  style={{
                    width: `min(100%, ${frame.width}px)`,
                    aspectRatio: `${frame.width} / ${frame.height}`,
                  }}
                  className={`relative overflow-hidden select-none touch-none border-2 border-amber-400 shadow-lg bg-slate-950 ${
                    mode === 'avatar' ? 'rounded-2xl' : 'rounded-xl'
                  } ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt="Area pemotongan foto"
                    draggable={false}
                    style={{
                      width: `${renderedWidth}px`,
                      height: `${renderedHeight}px`,
                      maxWidth: 'none',
                      transform: `translate3d(${(activeFrameW - renderedWidth) / 2 + offset.x}px, ${
                        (activeFrameH - renderedHeight) / 2 + offset.y
                      }px, 0)`,
                    }}
                    className="pointer-events-none select-none will-change-transform"
                  />

                  {/* Subtle rule-of-thirds guide grid */}
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }).map((_, idx) => (
                      <div key={idx} className="border border-white/15" />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <Move className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Seret foto untuk mengatur posisi</span>
                  </span>
                  {outputDimensions && (
                    <span className="font-mono tabular-nums text-amber-300">
                      · Hasil: {outputDimensions.width}×{outputDimensions.height} px
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                Tidak ada foto untuk dipotong.
              </div>
            )}
          </div>

          {/* Zoom & Reset Controls */}
          {imageSrc && naturalSize && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-700">
                  Perbesaran (Zoom): <span className="font-mono tabular-nums">{zoom.toFixed(2)}×</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                  disabled={zoom === 1 && offset.x === 0 && offset.y === 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md disabled:opacity-40 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Reset Posisi</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleZoomChange(zoom - 0.15)}
                  disabled={zoom <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="Perkecil zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  aria-label="Atur zoom pemotongan foto"
                  className="flex-1 accent-emerald-800 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleZoomChange(zoom + 0.15)}
                  disabled={zoom >= 3}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="Perbesar zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
              {maxOffsetX === 0 && maxOffsetY === 0 && zoom === 1 && (
                <p className="text-[11px] text-slate-500">
                  Tip: Perbesar zoom jika ingin menggeser posisi lebih bebas agar pas di dalam kotak.
                </p>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-60 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={!imageSrc || !naturalSize || loadingFile || applying}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {applying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{applying ? 'Memproses Potongan...' : 'Terapkan Potongan ke Pratinjau'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
