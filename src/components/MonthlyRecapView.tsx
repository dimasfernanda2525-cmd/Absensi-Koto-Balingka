import { useMemo, useState } from 'react';
import { BarChart3, Calendar, Check, Clock, Download, Printer } from 'lucide-react';
import {
  countSchoolDaysInMonth,
  formatIndonesianDate,
  formatIndonesianMonth,
  getTodayDateString,
} from '../lib/dateUtils';
import {
  AttendanceRecord,
  DistrictSettings,
  School,
  Teacher,
} from '../types/attendance';

interface MonthlyRecapViewProps {
  selectedMonth: string;
  onMonthChange: (monthKey: string) => void;
  schools: School[];
  teachers: Teacher[];
  monthlyRecords: AttendanceRecord[];
  loading: boolean;
  settings: DistrictSettings;
}

interface TeacherRecapRow {
  teacher: Teacher;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  totalRecorded: number;
  attendancePercent: number;
}

export function MonthlyRecapView({
  selectedMonth,
  onMonthChange,
  schools,
  teachers,
  monthlyRecords,
  loading,
  settings,
}: MonthlyRecapViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('semua');

  const schoolDays = useMemo(() => countSchoolDaysInMonth(selectedMonth), [selectedMonth]);

  const recapRows: TeacherRecapRow[] = useMemo(() => {
    const map = new Map<
      string,
      { hadir: number; terlambat: number; izin: number; sakit: number; alpa: number }
    >();

    for (const rec of monthlyRecords) {
      const current = map.get(rec.teacherId) ?? {
        hadir: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
      };
      current[rec.status] += 1;
      map.set(rec.teacherId, current);
    }

    return teachers
      .filter((t) => {
        if (t.status !== 'aktif') return false;
        if (schoolFilter !== 'semua' && t.schoolId !== schoolFilter) return false;
        return true;
      })
      .map((teacher) => {
        const counts = map.get(teacher.id) ?? {
          hadir: 0,
          terlambat: 0,
          izin: 0,
          sakit: 0,
          alpa: 0,
        };
        const totalRecorded =
          counts.hadir + counts.terlambat + counts.izin + counts.sakit + counts.alpa;
        const denominator = Math.max(totalRecorded, 1);
        const attendancePercent =
          totalRecorded > 0
            ? Math.round(((counts.hadir + counts.terlambat) / denominator) * 100)
            : 0;

        return {
          teacher,
          ...counts,
          totalRecorded,
          attendancePercent,
        };
      });
  }, [teachers, monthlyRecords, schoolFilter]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recapRows;
    return recapRows.filter(
      (r) =>
        r.teacher.fullName.toLowerCase().includes(q) ||
        r.teacher.nip.toLowerCase().includes(q) ||
        r.teacher.schoolName.toLowerCase().includes(q)
    );
  }, [recapRows, searchQuery]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.hadir += r.hadir;
        acc.terlambat += r.terlambat;
        acc.izin += r.izin;
        acc.sakit += r.sakit;
        acc.alpa += r.alpa;
        acc.total += r.totalRecorded;
        return acc;
      },
      { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, total: 0 }
    );
  }, [filteredRows]);

  const overallPresencePct =
    totals.total > 0 ? Math.round(((totals.hadir + totals.terlambat) / totals.total) * 100) : 0;

  const selectedSchoolName =
    schoolFilter === 'semua'
      ? 'Semua Sekolah'
      : schools.find((s) => s.id === schoolFilter)?.schoolName || 'Unit Sekolah';

  function handleExportCsv() {
    const header = [
      'No',
      'Nama Guru',
      'Username',
      'NIP / NUPTK',
      'Unit Sekolah',
      'Jabatan',
      'Hadir',
      'Terlambat',
      'Izin',
      'Sakit',
      'Alpa',
      'Total Tercatat',
      'Persentase Kehadiran (%)',
    ];

    const lines = filteredRows.map((r, i) => [
      i + 1,
      `"${r.teacher.fullName.replace(/"/g, '""')}"`,
      r.teacher.username,
      `"${r.teacher.nip || '-'}"`,
      `"${r.teacher.schoolName.replace(/"/g, '""')}"`,
      `"${r.teacher.roleTitle.replace(/"/g, '""')}"`,
      r.hadir,
      r.terlambat,
      r.izin,
      r.sakit,
      r.alpa,
      r.totalRecorded,
      `${r.attendancePercent}%`,
    ]);

    const csvContent = '\uFEFF' + [header.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekap-absensi-guru-${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Official District Letterhead (Visible on Print) */}
      <div className="hidden print:block border-b-2 border-black pb-3 mb-4">
        <div className="flex items-center justify-center gap-4 text-center">
          <img
            src="/assets/aistudio/Lambang-Kabupaten-Pasaman-Barat-Sumatera-Barat_128__1__77a567ea.png"
            alt="Lambang Kabupaten Pasaman Barat"
            className="w-14 h-16 object-contain shrink-0"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">
              Pemerintah {settings.regencyName} · Dinas Pendidikan
            </p>
            <h1 className="text-lg font-bold uppercase mt-0.5">
              Koordinator Wilayah Pendidikan {settings.districtName}
            </h1>
            <p className="text-xs mt-0.5">Unit Kerja: {selectedSchoolName}</p>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-400 text-center">
          <h2 className="text-sm font-bold uppercase">
            Rekapitulasi Kehadiran Guru — Bulan {formatIndonesianMonth(selectedMonth)}
          </h2>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 text-white border border-emerald-800/60 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-sm print:hidden">
        <div>
          <p className="text-xs font-medium text-amber-300">
            {settings.districtName} · Estimasi {schoolDays} hari kerja efektif
          </p>
          <h2 className="font-display text-xl font-bold text-white mt-1">
            Rekap Bulan {formatIndonesianMonth(selectedMonth)}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              if (e.target.value) onMonthChange(e.target.value);
            }}
            aria-label="Pilih bulan rekap"
            className="px-3 py-2 text-xs font-mono tabular-nums bg-white border border-emerald-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-400"
          />

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-white/10 border border-white/25 hover:bg-white/20 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Unduh CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
        <div className="bg-gradient-to-br from-slate-50 via-white to-slate-100/70 border border-slate-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-600">Total Catatan Bulan Ini</p>
            <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {totals.total}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Tingkat hadir: {overallPresencePct}%
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0 print:hidden">
            <BarChart3 className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 border border-emerald-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-emerald-800">Hadir Tepat Waktu</p>
            <p className="font-display text-2xl font-bold text-emerald-800 tabular-nums mt-1">
              {totals.hadir}
            </p>
            <p className="text-xs text-emerald-700 mt-1">{selectedSchoolName}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 print:hidden">
            <Check className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 via-white to-orange-50/70 border border-amber-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-amber-800">Terlambat</p>
            <p className="font-display text-2xl font-bold text-amber-700 tabular-nums mt-1">
              {totals.terlambat}
            </p>
            <p className="text-xs text-amber-700/90 mt-1">Melewati batas toleransi</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 print:hidden">
            <Clock className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-sky-50 via-white to-indigo-50/70 border border-sky-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-sky-900">Izin / Sakit / Alpa</p>
            <p className="font-display text-2xl font-bold text-sky-900 tabular-nums mt-1">
              {totals.izin + totals.sakit + totals.alpa}
            </p>
            <p className="text-xs text-sky-700 mt-1 tabular-nums">
              Izin {totals.izin} · Sakit {totals.sakit} · Alpa {totals.alpa}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 print:hidden">
            <Calendar className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Recap Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              aria-label="Filter sekolah pada rekap"
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-emerald-700"
            >
              <option value="semua">Semua Sekolah</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.schoolName}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">{filteredRows.length} guru aktif</span>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter nama guru atau sekolah..."
            className="w-full sm:w-64 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-700"
          />
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            Belum ada data guru atau catatan absensi untuk filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-teal-50/60 text-xs font-semibold text-emerald-950">
                  <th className="py-3 px-4 w-10">No</th>
                  <th className="py-3 px-4">Nama Guru &amp; NIP</th>
                  <th className="py-3 px-4">Unit Sekolah</th>
                  <th className="py-3 px-3 text-right">Hadir</th>
                  <th className="py-3 px-3 text-right">Terlambat</th>
                  <th className="py-3 px-3 text-right">Izin</th>
                  <th className="py-3 px-3 text-right">Sakit</th>
                  <th className="py-3 px-3 text-right">Alpa</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-4 text-right w-36">Persentase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRows.map((row, idx) => (
                  <tr key={row.teacher.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-slate-900">{row.teacher.fullName}</p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {row.teacher.nip && row.teacher.nip !== '-'
                          ? row.teacher.nip
                          : row.teacher.employmentType}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs font-medium text-slate-800">{row.teacher.schoolName}</p>
                      <p className="text-xs text-slate-500">{row.teacher.roleTitle}</p>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums font-medium text-emerald-700">
                      {row.hadir}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums font-medium text-amber-700">
                      {row.terlambat}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-sky-700">
                      {row.izin}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-indigo-700">
                      {row.sakit}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-rose-700">
                      {row.alpa}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs tabular-nums font-semibold text-slate-900">
                      {row.totalRecorded}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden print:hidden">
                          <div
                            className="h-full bg-emerald-700"
                            style={{ width: `${row.attendancePercent}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs tabular-nums font-medium text-slate-800 w-9 text-right">
                          {row.attendancePercent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print Signature Block */}
      <div className="hidden print:flex justify-end mt-10 pt-6 text-xs">
        <div className="w-72 text-left">
          <p>
            {settings.districtName}, {formatIndonesianDate(getTodayDateString()).replace(/^[^,]+,\s*/, '')}
          </p>
          <p className="mt-1">Mengetahui,</p>
          <p className="font-semibold">Koordinator Wilayah {settings.districtName}</p>
          <div className="h-16" />
          <p className="font-bold underline">{settings.coordinatorName}</p>
          <p className="font-mono">NIP. {settings.coordinatorNip || '-'}</p>
        </div>
      </div>
    </div>
  );
}
