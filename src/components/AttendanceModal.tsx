import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { formatIndonesianDate, getCurrentTimeHHMM } from '../lib/dateUtils';
import { AttendanceRecord, AttendanceStatus, FIELD_LIMITS, Teacher } from '../types/attendance';

interface AttendanceModalProps {
  isOpen: boolean;
  date: string;
  teacher: Teacher | null;
  existingRecord?: AttendanceRecord;
  defaultCheckIn: string;
  defaultCheckOut: string;
  onClose: () => void;
  onSave: (payload: {
    teacher: Teacher;
    status: AttendanceStatus;
    checkInTime: string;
    checkOutTime: string;
    notes: string;
    existingRecord?: AttendanceRecord;
  }) => Promise<void>;
  onDelete?: (attendanceId: string) => Promise<void>;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'hadir', label: 'Hadir Tepat Waktu' },
  { value: 'terlambat', label: 'Terlambat' },
  { value: 'izin', label: 'Izin' },
  { value: 'sakit', label: 'Sakit' },
  { value: 'alpa', label: 'Tanpa Keterangan (Alpa)' },
];

export function AttendanceModal({
  isOpen,
  date,
  teacher,
  existingRecord,
  defaultCheckIn,
  defaultCheckOut,
  onClose,
  onSave,
  onDelete,
}: AttendanceModalProps) {
  const [status, setStatus] = useState<AttendanceStatus>('hadir');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !teacher) return;
    if (existingRecord) {
      setStatus(existingRecord.status);
      setCheckInTime(existingRecord.checkInTime || '');
      setCheckOutTime(existingRecord.checkOutTime || '');
      setNotes(existingRecord.notes || '');
    } else {
      setStatus('hadir');
      setCheckInTime(getCurrentTimeHHMM() || defaultCheckIn);
      setCheckOutTime('');
      setNotes('');
    }
    setError(null);
  }, [isOpen, teacher, existingRecord, defaultCheckIn]);

  if (!isOpen || !teacher) return null;

  const needsTime = status === 'hadir' || status === 'terlambat';

  function handleStatusChange(next: AttendanceStatus) {
    setStatus(next);
    if (next === 'izin' || next === 'sakit' || next === 'alpa') {
      setCheckInTime('');
      setCheckOutTime('');
    } else if (!checkInTime) {
      setCheckInTime(getCurrentTimeHHMM() || defaultCheckIn);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teacher) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        teacher,
        status,
        checkInTime: needsTime ? checkInTime : '',
        checkOutTime: needsTime ? checkOutTime : '',
        notes,
        existingRecord,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan presensi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClick() {
    if (!existingRecord || !onDelete) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(existingRecord.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus catatan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="attendance-modal-title" className="font-display text-base font-semibold text-slate-900">
              Catat / Koreksi Kehadiran Guru
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{formatIndonesianDate(date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Tutup jendela"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="pb-4 border-b border-slate-100 space-y-1.5">
            <p className="text-sm font-semibold text-slate-900">{teacher.fullName}</p>
            <p className="text-xs text-slate-500">
              {teacher.schoolName} · {teacher.roleTitle} · NIP{' '}
              <span className="font-mono tabular-nums">{teacher.nip || '-'}</span>
            </p>
            {existingRecord && existingRecord.submittedByRole === 'teacher' && (
              <p className="text-[11px] text-emerald-800 font-medium">
                Verifikasi mandiri:{' '}
                {existingRecord.locationStatus === 'verified'
                  ? `Radius OK (${existingRecord.distanceMeters} m)`
                  : existingRecord.locationStatus}
                {' · '}
                {existingRecord.faceStatus === 'photo_verified'
                  ? 'Foto langsung terverifikasi'
                  : existingRecord.faceStatus === 'liveness_verified'
                  ? `Kedip & Senyum OK (${existingRecord.faceConfidence}%)`
                  : existingRecord.faceStatus === 'liveness_failed'
                  ? 'Verifikasi Foto Gagal'
                  : existingRecord.faceStatus === 'matched'
                  ? `Wajah Cocok (${existingRecord.faceConfidence}%)`
                  : existingRecord.faceStatus === 'no_reference'
                  ? 'Foto kamera tersimpan'
                  : existingRecord.faceStatus}
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Status Kehadiran</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStatusChange(opt.value)}
                  className={`px-3 py-2.5 text-left text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    status === opt.value
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {needsTime && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="checkInInput" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Jam Masuk
                </label>
                <div className="flex gap-2">
                  <input
                    id="checkInInput"
                    type="time"
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => setCheckInTime(getCurrentTimeHHMM())}
                    className="px-2.5 py-2 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Kini
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="checkOutInput" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Jam Pulang (Opsional)
                </label>
                <div className="flex gap-2">
                  <input
                    id="checkOutInput"
                    type="time"
                    value={checkOutTime}
                    onChange={(e) => setCheckOutTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => setCheckOutTime(defaultCheckOut)}
                    className="px-2.5 py-2 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Std
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="notesInput" className="block text-xs font-medium text-slate-700 mb-1.5">
              Keterangan / Catatan
            </label>
            <textarea
              id="notesInput"
              rows={2}
              maxLength={FIELD_LIMITS.notesMax}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Rapat dinas kecamatan, surat dokter terlampir..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700 resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1 text-right tabular-nums">
              {notes.length}/{FIELD_LIMITS.notesMax}
            </p>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div>
              {existingRecord && onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={saving}
                  className="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  Hapus Catatan
                </button>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {saving ? 'Menyimpan...' : 'Simpan Kehadiran'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
