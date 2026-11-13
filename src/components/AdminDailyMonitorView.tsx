import { useEffect, useMemo, useState } from 'react';
import { Calendar, Camera, Check, Clock, Edit3, MapPin, Search, Users, X } from 'lucide-react';
import {
  computeCheckInStatus,
  formatIndonesianDate,
  getCurrentTimeHHMM,
  getCurrentTimeWithSeconds,
  getInitials,
  getTodayDateString,
} from '../lib/dateUtils';
import { playChime, speakVoice, unlockVoiceAudio } from '../lib/voiceGuide';
import {
  deleteAttendanceRecord,
  markRemainingTeachersPresent,
  saveAttendanceRecord,
  seedSampleDistrictData,
} from '../services/attendanceService';
import {
  AttendanceRecord,
  AttendanceStatus,
  DistrictSettings,
  School,
  SessionAccount,
  Teacher,
} from '../types/attendance';
import { AttendanceModal } from './AttendanceModal';
import { StatusIndicator } from './StatusIndicator';

interface AdminDailyMonitorViewProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  schools: School[];
  teachers: Teacher[];
  teachersLoading: boolean;
  attendanceRecords: AttendanceRecord[];
  attendanceLoading: boolean;
  settings: DistrictSettings;
  adminSession: SessionAccount;
  onNavigateToRegistry: () => void;
  onViewTeacherProfile?: (teacher: Teacher) => void;
}

type StatusFilter = 'semua' | 'belum' | 'hadir' | 'terlambat' | 'izin_sakit_alpa';

export function AdminDailyMonitorView({
  selectedDate,
  onDateChange,
  schools,
  teachers,
  teachersLoading,
  attendanceRecords,
  attendanceLoading,
  settings,
  adminSession,
  onNavigateToRegistry,
  onViewTeacherProfile,
}: AdminDailyMonitorViewProps) {
  const [nowClock, setNowClock] = useState(() => getCurrentTimeWithSeconds());
  const [searchQuery, setSearchQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('semua');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua');
  const [modalTeacher, setModalTeacher] = useState<Teacher | null>(null);
  const [photoPreviewRecord, setPhotoPreviewRecord] = useState<AttendanceRecord | null>(null);
  const [busyTeacherId, setBusyTeacherId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowClock(getCurrentTimeWithSeconds());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeTeachers = useMemo(() => {
    return teachers.filter((t) => {
      if (t.status !== 'aktif') return false;
      if (schoolFilter !== 'semua' && t.schoolId !== schoolFilter) return false;
      return true;
    });
  }, [teachers, schoolFilter]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const rec of attendanceRecords) {
      map.set(rec.teacherId, rec);
    }
    return map;
  }, [attendanceRecords]);

  const stats = useMemo(() => {
    let hadir = 0;
    let terlambat = 0;
    let tidakHadir = 0;
    let belum = 0;

    for (const t of activeTeachers) {
      const rec = attendanceMap.get(t.id);
      if (!rec) {
        belum += 1;
      } else if (rec.status === 'hadir') {
        hadir += 1;
      } else if (rec.status === 'terlambat') {
        terlambat += 1;
      } else {
        tidakHadir += 1;
      }
    }

    const total = activeTeachers.length;
    const rate = total > 0 ? Math.round(((hadir + terlambat) / total) * 100) : 0;
    return { total, hadir, terlambat, tidakHadir, belum, rate };
  }, [activeTeachers, attendanceMap]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeTeachers.filter((t) => {
      const rec = attendanceMap.get(t.id);
      const matchesSearch =
        !q ||
        t.fullName.toLowerCase().includes(q) ||
        t.nip.toLowerCase().includes(q) ||
        t.schoolName.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (statusFilter === 'semua') return true;
      if (statusFilter === 'belum') return !rec;
      if (statusFilter === 'hadir') return rec?.status === 'hadir';
      if (statusFilter === 'terlambat') return rec?.status === 'terlambat';
      if (statusFilter === 'izin_sakit_alpa') {
        return rec?.status === 'izin' || rec?.status === 'sakit' || rec?.status === 'alpa';
      }
      return true;
    });
  }, [activeTeachers, attendanceMap, searchQuery, statusFilter]);

  const isToday = selectedDate === getTodayDateString();

  async function handleQuickMark(teacher: Teacher, forcedStatus?: AttendanceStatus) {
    unlockVoiceAudio();
    setBusyTeacherId(teacher.id);
    setActionMessage(null);
    const existing = attendanceMap.get(teacher.id);
    const nowHHMM = getCurrentTimeHHMM();
    const nextStatus =
      forcedStatus ??
      computeCheckInStatus(nowHHMM, settings.checkInStart, settings.lateToleranceMinutes);
    const needsTime = nextStatus === 'hadir' || nextStatus === 'terlambat';

    try {
      await saveAttendanceRecord({
        date: selectedDate,
        teacher,
        status: nextStatus,
        checkInTime: needsTime ? existing?.checkInTime || nowHHMM : '',
        checkOutTime: needsTime ? existing?.checkOutTime || '' : '',
        notes: existing?.notes || 'Dicatat oleh Administrator',
        submittedByRole: 'admin',
        recordedByUsername: adminSession.username,
        recordedByName: adminSession.displayName,
        existingRecord: existing,
      });
      setActionMessage({
        type: 'ok',
        text: `Kehadiran ${teacher.fullName} berhasil dicatat (${nextStatus.toUpperCase()}).`,
      });
      playChime('step_ok');
      speakVoice(`Kehadiran ${teacher.fullName} berhasil dicatat.`);
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan kehadiran.',
      });
      playChime('error');
    } finally {
      setBusyTeacherId(null);
    }
  }

  async function handleQuickCheckOut(teacher: Teacher, existing: AttendanceRecord) {
    unlockVoiceAudio();
    setBusyTeacherId(teacher.id);
    setActionMessage(null);
    const nowHHMM = getCurrentTimeHHMM();
    try {
      await saveAttendanceRecord({
        date: selectedDate,
        teacher,
        status: existing.status,
        checkInTime: existing.checkInTime,
        checkOutTime: nowHHMM,
        notes: existing.notes,
        submittedByRole: 'admin',
        recordedByUsername: adminSession.username,
        recordedByName: adminSession.displayName,
        existingRecord: existing,
      });
      setActionMessage({
        type: 'ok',
        text: `Jam pulang ${teacher.fullName} dicatat pukul ${nowHHMM}.`,
      });
      playChime('step_ok');
      speakVoice(`Jam pulang ${teacher.fullName} berhasil dicatat.`);
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mencatat jam pulang.',
      });
      playChime('error');
    } finally {
      setBusyTeacherId(null);
    }
  }

  async function handleBulkPresent() {
    unlockVoiceAudio();
    setBulkBusy(true);
    setActionMessage(null);
    try {
      const count = await markRemainingTeachersPresent(
        selectedDate,
        activeTeachers,
        attendanceMap,
        settings.checkInStart,
        adminSession.username,
        adminSession.displayName
      );
      setActionMessage({
        type: 'ok',
        text:
          count > 0
            ? `${count} guru yang belum absen ditandai Hadir pada pukul ${settings.checkInStart}.`
            : 'Semua guru aktif pada filter ini sudah tercatat.',
      });
      playChime('step_ok');
      speakVoice(
        count > 0
          ? `${count} guru berhasil ditandai hadir.`
          : 'Semua guru pada filter ini sudah tercatat.'
      );
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mencatat serentak.',
      });
      playChime('error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleSeedSample() {
    unlockVoiceAudio();
    setSeeding(true);
    setActionMessage(null);
    try {
      await seedSampleDistrictData(adminSession.username);
      setActionMessage({
        type: 'ok',
        text: '3 sekolah dan 6 akun guru contoh berhasil dimuat (PIN contoh: 112233, username mis. hendra, sari, budi).',
      });
      playChime('step_ok');
      speakVoice('Data contoh sekolah dan guru berhasil dimuat.');
    } catch (err) {
      setActionMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memuat data contoh kecamatan.',
      });
      playChime('error');
    } finally {
      setSeeding(false);
    }
  }

  const loading = teachersLoading || attendanceLoading;

  const hadirPct = stats.total > 0 ? (stats.hadir / stats.total) * 100 : 0;
  const terlambatPct = stats.total > 0 ? (stats.terlambat / stats.total) * 100 : 0;
  const tidakHadirPct = stats.total > 0 ? (stats.tidakHadir / stats.total) * 100 : 0;
  const belumPct = stats.total > 0 ? (stats.belum / stats.total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 text-white border border-emerald-800/60 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-sm">
        <div>
          <p className="text-xs font-medium text-amber-300">
            Pemantauan Kehadiran Langsung · {settings.districtName} · Masuk {settings.checkInStart} (+
            {settings.lateToleranceMinutes}m)
          </p>
          <h2 className="font-display text-xl font-bold text-white mt-1">
            {formatIndonesianDate(selectedDate)}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 rounded-lg bg-white/10 border border-white/20 text-xs text-white font-mono tabular-nums flex items-center gap-2 backdrop-blur-xs">
            <Clock className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
            <span>{nowClock} WIB</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Calendar
                className="w-4 h-4 text-emerald-700 absolute left-3 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) onDateChange(e.target.value);
                }}
                aria-label="Pilih tanggal pemantauan"
                className="pl-9 pr-3 py-2 text-xs font-mono tabular-nums bg-white border border-emerald-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-400"
              />
            </div>
            {!isToday && (
              <button
                type="button"
                onClick={() => onDateChange(getTodayDateString())}
                className="px-3 py-2 text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer whitespace-nowrap"
              >
                Hari Ini
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4-Column Colorful KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-slate-50 via-white to-slate-100/70 border border-slate-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-600">Total Guru Aktif</p>
            <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {stats.total}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Belum absen: {stats.belum} orang
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 border border-emerald-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-emerald-800">Hadir Tepat Waktu</p>
            <p className="font-display text-2xl font-bold text-emerald-800 tabular-nums mt-1">
              {stats.hadir}
            </p>
            <p className="text-xs text-emerald-700 mt-1 tabular-nums">Tingkat hadir: {stats.rate}%</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 via-white to-orange-50/70 border border-amber-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-amber-800">Terlambat</p>
            <p className="font-display text-2xl font-bold text-amber-700 tabular-nums mt-1">
              {stats.terlambat}
            </p>
            <p className="text-xs text-amber-700/90 mt-1 tabular-nums">
              Lewat {settings.checkInStart} +{settings.lateToleranceMinutes}m
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-sky-50 via-white to-indigo-50/70 border border-sky-200 rounded-xl p-4 shadow-xs flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-sky-900">Izin / Sakit / Alpa</p>
            <p className="font-display text-2xl font-bold text-sky-900 tabular-nums mt-1">
              {stats.tidakHadir}
            </p>
            <p className="text-xs text-sky-700 mt-1">Tidak hadir di sekolah</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Stacked Attendance Distribution Bar */}
      <div className="bg-white border border-emerald-200/70 rounded-xl p-4 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-display font-semibold text-slate-900">
            Komposisi Kehadiran Tanggal Terpilih
          </span>
          <span className="font-mono font-semibold text-emerald-800 tabular-nums">
            {stats.hadir + stats.terlambat} / {stats.total} Guru Tercatat Hadir ({stats.rate}%)
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
          {hadirPct > 0 && (
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${hadirPct}%` }}
              title={`Hadir tepat waktu: ${stats.hadir}`}
            />
          )}
          {terlambatPct > 0 && (
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${terlambatPct}%` }}
              title={`Terlambat: ${stats.terlambat}`}
            />
          )}
          {tidakHadirPct > 0 && (
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${tidakHadirPct}%` }}
              title={`Izin/Sakit/Alpa: ${stats.tidakHadir}`}
            />
          )}
          {belumPct > 0 && (
            <div
              className="h-full bg-slate-300 transition-all duration-300"
              style={{ width: `${belumPct}%` }}
              title={`Belum absen: ${stats.belum}`}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
            Hadir ({stats.hadir})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
            Terlambat ({stats.terlambat})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-500" />
            Izin/Sakit/Alpa ({stats.tidakHadir})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-300" />
            Belum Absen ({stats.belum})
          </span>
        </div>
      </div>

      {actionMessage && (
        <div
          role="status"
          className={`px-4 py-3 rounded-lg border text-xs flex items-center justify-between ${
            actionMessage.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="font-medium underline ml-4 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Monitoring Roster Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1">
            <div className="relative w-full md:w-64">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari guru, username, NIP..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-700"
              />
            </div>

            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              aria-label="Filter sekolah"
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-emerald-700"
            >
              <option value="semua">Semua Sekolah ({schools.length})</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.schoolName}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(
                [
                  ['semua', 'Semua'],
                  ['belum', 'Belum Absen'],
                  ['hadir', 'Hadir'],
                  ['terlambat', 'Terlambat'],
                  ['izin_sakit_alpa', 'Izin/Sakit/Alpa'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {stats.belum > 0 && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleBulkPresent}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{bulkBusy ? 'Memproses...' : `Tandai ${stats.belum} Guru Hadir`}</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-11 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-10 text-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Belum Ada Sekolah &amp; Guru Terdaftar
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Daftarkan sekolah dan akun Username &amp; PIN guru terlebih dahulu, atau muat data
              contoh kecamatan (3 sekolah &amp; 6 guru dengan PIN <span className="font-mono">112233</span>) untuk langsung menguji sistem.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedSample}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {seeding ? 'Memuat Data...' : 'Muat Data Contoh Kecamatan'}
              </button>
              <button
                type="button"
                onClick={onNavigateToRegistry}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
              >
                Registrasi Guru &amp; PIN
              </button>
            </div>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            Tidak ada guru yang cocok dengan filter pencarian saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-teal-50/60 text-xs font-semibold text-emerald-950">
                  <th className="py-3 px-4 w-10">No</th>
                  <th className="py-3 px-4">Nama Guru &amp; Username</th>
                  <th className="py-3 px-4">Unit Sekolah</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Masuk</th>
                  <th className="py-3 px-4 text-right">Pulang</th>
                  <th className="py-3 px-4">Verifikasi</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-right">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredTeachers.map((teacher, idx) => {
                  const rec = attendanceMap.get(teacher.id);
                  const isBusy = busyTeacherId === teacher.id;

                  return (
                    <tr key={teacher.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => onViewTeacherProfile?.(teacher)}
                            className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-emerald-600"
                            title={`Lihat profil ${teacher.fullName}`}
                          >
                            {teacher.avatarPhotoUrl ? (
                              <img
                                src={teacher.avatarPhotoUrl}
                                alt={teacher.fullName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{getInitials(teacher.fullName)}</span>
                            )}
                          </button>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onViewTeacherProfile?.(teacher)}
                              className="text-sm font-medium text-slate-900 hover:text-emerald-800 hover:underline truncate block text-left cursor-pointer"
                            >
                              {teacher.fullName}
                            </button>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              @{teacher.username} · {teacher.nip && teacher.nip !== '-' ? teacher.nip : teacher.employmentType}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs font-medium text-slate-800">{teacher.schoolName}</p>
                        <p className="text-xs text-slate-500">{teacher.roleTitle}</p>
                      </td>
                      <td className="py-3 px-4">
                        <StatusIndicator status={rec?.status ?? 'belum'} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {rec?.checkInTime || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {rec?.checkOutTime || '—'}
                      </td>
                      <td className="py-3 px-4">
                        {!rec ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <div className="space-y-0.5 text-[11px]">
                            <div className="flex items-center gap-1 text-slate-700">
                              <MapPin className="w-3 h-3 text-emerald-700 shrink-0" aria-hidden="true" />
                              <span className="tabular-nums">
                                {rec.locationStatus === 'verified'
                                  ? `${rec.distanceMeters} m`
                                  : rec.locationStatus === 'unconfigured'
                                  ? 'GPS Belum Diatur'
                                  : rec.locationStatus === 'outside_radius'
                                  ? `Luar Radius (${rec.distanceMeters} m)`
                                  : 'Manual'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Camera className="w-3 h-3 text-emerald-700 shrink-0" aria-hidden="true" />
                              {rec.checkInPhotoUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setPhotoPreviewRecord(rec)}
                                  className="text-emerald-800 hover:underline font-medium cursor-pointer text-left"
                                >
                                  {rec.faceStatus === 'photo_verified'
                                    ? 'Foto Terverifikasi · Lihat Foto'
                                    : rec.faceStatus === 'liveness_verified'
                                    ? `Kedip & Senyum ${rec.faceConfidence}% · Lihat Foto`
                                    : rec.faceStatus === 'matched'
                                    ? `Cocok ${rec.faceConfidence}% · Lihat Foto`
                                    : 'Lihat Foto'}
                                </button>
                              ) : (
                                <span className="text-slate-500">
                                  {rec.faceStatus === 'photo_verified'
                                    ? 'Foto Terverifikasi'
                                    : rec.faceStatus === 'liveness_verified'
                                    ? `Kedip & Senyum ${rec.faceConfidence}%`
                                    : rec.faceStatus === 'matched'
                                    ? `Cocok ${rec.faceConfidence}%`
                                    : 'Tanpa Foto'}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-[190px]">
                        <p className="text-xs text-slate-600 truncate" title={rec?.notes || ''}>
                          {rec?.notes || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {!rec && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickMark(teacher, 'hadir')}
                                className="px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer whitespace-nowrap disabled:opacity-50"
                              >
                                Hadir
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickMark(teacher, 'izin')}
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap disabled:opacity-50"
                              >
                                Izin
                              </button>
                            </>
                          )}
                          {rec &&
                            (rec.status === 'hadir' || rec.status === 'terlambat') &&
                            !rec.checkOutTime && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleQuickCheckOut(teacher, rec)}
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md cursor-pointer whitespace-nowrap disabled:opacity-50"
                              >
                                Pulang
                              </button>
                            )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setModalTeacher(teacher)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                            aria-label={`Ubah kehadiran ${teacher.fullName}`}
                            title="Ubah / Catat Detail"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AttendanceModal
        isOpen={Boolean(modalTeacher)}
        date={selectedDate}
        teacher={modalTeacher}
        existingRecord={modalTeacher ? attendanceMap.get(modalTeacher.id) : undefined}
        defaultCheckIn={settings.checkInStart}
        defaultCheckOut={settings.checkOutStart}
        onClose={() => setModalTeacher(null)}
        onSave={async (payload) => {
          unlockVoiceAudio();
          await saveAttendanceRecord({
            date: selectedDate,
            ...payload,
            submittedByRole: 'admin',
            recordedByUsername: adminSession.username,
            recordedByName: adminSession.displayName,
          });
          setActionMessage({
            type: 'ok',
            text: `Catatan kehadiran ${payload.teacher.fullName} berhasil disimpan.`,
          });
          playChime('step_ok');
          speakVoice(`Catatan kehadiran ${payload.teacher.fullName} berhasil disimpan.`);
        }}
        onDelete={async (attendanceId) => {
          unlockVoiceAudio();
          await deleteAttendanceRecord(attendanceId);
          setActionMessage({
            type: 'ok',
            text: 'Catatan kehadiran berhasil dihapus.',
          });
          playChime('step_ok');
          speakVoice('Catatan kehadiran berhasil dihapus.');
        }}
      />

      {/* Check-in Selfie Preview Modal */}
      {photoPreviewRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Bukti Foto &amp; Lokasi Presensi
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {photoPreviewRecord.teacherName} · {photoPreviewRecord.checkInTime || '—'} WIB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhotoPreviewRecord(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup foto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {photoPreviewRecord.checkInPhotoUrl && (
                <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-950">
                  <img
                    src={photoPreviewRecord.checkInPhotoUrl}
                    alt={`Foto kehadiran ${photoPreviewRecord.teacherName}`}
                    className="w-full max-h-72 object-contain mx-auto"
                  />
                </div>
              )}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <p>
                  <strong>Lokasi:</strong>{' '}
                  {photoPreviewRecord.locationStatus === 'verified'
                    ? `Terverifikasi dalam radius (${photoPreviewRecord.distanceMeters} m)`
                    : photoPreviewRecord.locationStatus === 'unconfigured'
                    ? 'GPS Sekolah belum diatur'
                    : photoPreviewRecord.locationStatus}
                  {photoPreviewRecord.latitude !== 0 && (
                    <span className="font-mono text-[11px] text-slate-500 ml-1.5">
                      ({photoPreviewRecord.latitude}, {photoPreviewRecord.longitude})
                    </span>
                  )}
                </p>
                <p>
                  <strong>Verifikasi Foto:</strong>{' '}
                  {photoPreviewRecord.faceStatus === 'photo_verified'
                    ? 'Foto kehadiran langsung terverifikasi'
                    : photoPreviewRecord.faceStatus === 'liveness_verified'
                    ? `Kedip & Senyum Terverifikasi (${photoPreviewRecord.faceConfidence}%)`
                    : photoPreviewRecord.faceStatus === 'liveness_failed'
                    ? 'Verifikasi Foto Gagal'
                    : photoPreviewRecord.faceStatus === 'matched'
                    ? `Cocok (${photoPreviewRecord.faceConfidence}%)`
                    : photoPreviewRecord.faceStatus === 'no_reference'
                    ? 'Foto kehadiran tersimpan'
                    : photoPreviewRecord.faceStatus}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
