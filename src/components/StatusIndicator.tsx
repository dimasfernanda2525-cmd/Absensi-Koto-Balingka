import { CheckCircle2, Clock, FileText, HeartPulse, Minus, XCircle } from 'lucide-react';
import { AttendanceStatus } from '../types/attendance';

interface StatusIndicatorProps {
  status: AttendanceStatus | 'belum';
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  switch (status) {
    case 'hadir':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Hadir</span>
        </span>
      );
    case 'terlambat':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Terlambat</span>
        </span>
      );
    case 'izin':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 whitespace-nowrap">
          <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Izin</span>
        </span>
      );
    case 'sakit':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 whitespace-nowrap">
          <HeartPulse className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sakit</span>
        </span>
      );
    case 'alpa':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Alpa</span>
        </span>
      );
    case 'belum':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Belum Absen</span>
        </span>
      );
  }
}
