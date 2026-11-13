import { useEffect, useMemo, useState } from 'react';
import {
  CalendarOff,
  Camera,
  Clock,
  CopyCheck,
  Edit3,
  KeyRound,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  School as SchoolIcon,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { formatIndonesianDate, getTodayDateString } from '../lib/dateUtils';
import { getCurrentGpsPosition } from '../lib/geoAndImage';
import { playChime, speakVoice, unlockVoiceAudio } from '../lib/voiceGuide';
import {
  addSchoolHoliday,
  changeAdminPin,
  deleteSchool,
  deleteSchoolHoliday,
  normalizeUsername,
  registerAdditionalAdmin,
  saveDistrictSettings,
  saveSchoolWeeklySchedule,
  subscribeSchoolHolidays,
  syncSchoolCheckOutSchedule,
  upsertSchool,
} from '../services/attendanceService';
import {
  DayOfWeekKey,
  DEFAULT_WEEKLY_SCHEDULE,
  DistrictSettings,
  EntityStatus,
  FIELD_LIMITS,
  PATTERNS,
  School,
  SchoolHoliday,
  SessionAccount,
  WEEKDAY_ORDER,
  WeeklySchedule,
} from '../types/attendance';

interface AdminDistrictSettingsViewProps {
  settings: DistrictSettings;
  schools: School[];
  adminSession: SessionAccount;
}

export function AdminDistrictSettingsView({
  settings,
  schools,
  adminSession,
}: AdminDistrictSettingsViewProps) {
  const [form, setForm] = useState<DistrictSettings>(settings);
  const [savingSettings, setSavingSettings] = useState(false);

  // School modal state
  const [schoolModalOpen, setSchoolModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [npsn, setNpsn] = useState('');
  const [address, setAddress] = useState('');
  const [hasLocation, setHasLocation] = useState(false);
  const [latitude, setLatitude] = useState('0');
  const [longitude, setLongitude] = useState('0');
  const [radiusMeters, setRadiusMeters] = useState(150);
  const [gpsFetching, setGpsFetching] = useState(false);
  const [schoolFormError, setSchoolFormError] = useState<string | null>(null);
  const [schoolStatus, setSchoolStatus] = useState<EntityStatus>('aktif');
  const [schoolBusy, setSchoolBusy] = useState(false);

  // Admin PIN change state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  // New Operator Admin state
  const [opUsername, setOpUsername] = useState('');
  const [opName, setOpName] = useState('');
  const [opPin, setOpPin] = useState('');
  const [opBusy, setOpBusy] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Per-school Senin-Sabtu Schedule Editor state
  const [scheduleSchoolId, setScheduleSchoolId] = useState('');
  const [scheduleDraft, setScheduleDraft] = useState<WeeklySchedule>(() => ({
    ...DEFAULT_WEEKLY_SCHEDULE,
  }));
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Sync Jam Pulang Sekolah A -> Sekolah B state
  const [syncSourceSchoolId, setSyncSourceSchoolId] = useState('');
  const [syncTargetSchoolId, setSyncTargetSchoolId] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Per-school Hari Cuti / Libur state
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  const [holidaySchoolId, setHolidaySchoolId] = useState('');
  const [holidayDate, setHolidayDate] = useState(() => getTodayDateString());
  const [holidayReason, setHolidayReason] = useState('');
  const [holidayFilterSchoolId, setHolidayFilterSchoolId] = useState('semua');
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [holidayMsg, setHolidayMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    const unsub = subscribeSchoolHolidays(
      (list) => setHolidays(list),
      (err) => setStatusMsg({ type: 'err', text: err.message })
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (schools.length === 0) return;
    if (!scheduleSchoolId || !schools.some((s) => s.id === scheduleSchoolId)) {
      setScheduleSchoolId(schools[0].id);
    }
    if (!holidaySchoolId || !schools.some((s) => s.id === holidaySchoolId)) {
      setHolidaySchoolId(schools[0].id);
    }
    if (!syncSourceSchoolId || !schools.some((s) => s.id === syncSourceSchoolId)) {
      setSyncSourceSchoolId(schools[0].id);
    }
    if (
      schools.length >= 2 &&
      (!syncTargetSchoolId ||
        (syncTargetSchoolId !== '__all__' &&
          (!schools.some((s) => s.id === syncTargetSchoolId) ||
            syncTargetSchoolId === syncSourceSchoolId)))
    ) {
      const second = schools.find((s) => s.id !== (syncSourceSchoolId || schools[0].id));
      if (second) setSyncTargetSchoolId(second.id);
    }
  }, [schools, scheduleSchoolId, holidaySchoolId, syncSourceSchoolId, syncTargetSchoolId]);

  const selectedScheduleSchool = useMemo(
    () => schools.find((s) => s.id === scheduleSchoolId) ?? schools[0] ?? null,
    [schools, scheduleSchoolId]
  );

  const selectedScheduleFingerprint = selectedScheduleSchool
    ? `${selectedScheduleSchool.id}:${JSON.stringify(selectedScheduleSchool.weeklySchedule ?? {})}`
    : '';

  useEffect(() => {
    if (!selectedScheduleSchool) return;
    const next = {} as WeeklySchedule;
    for (const { key } of WEEKDAY_ORDER) {
      next[key] = {
        ...(selectedScheduleSchool.weeklySchedule?.[key] ?? DEFAULT_WEEKLY_SCHEDULE[key]),
      };
    }
    setScheduleDraft(next);
  }, [selectedScheduleSchool, selectedScheduleFingerprint]);

  const filteredHolidays = useMemo(() => {
    if (holidayFilterSchoolId === 'semua') return holidays;
    return holidays.filter((h) => h.schoolId === holidayFilterSchoolId);
  }, [holidays, holidayFilterSchoolId]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    setSettingsMsg(null);
    setStatusMsg(null);

    if (form.districtName.trim().length < 3) {
      setSettingsMsg({ type: 'err', text: 'Nama kecamatan minimal 3 karakter.' });
      playChime('error');
      return;
    }
    if (
      !PATTERNS.timeHHMM.test(form.checkInStart.slice(0, 5)) ||
      !PATTERNS.timeHHMM.test(form.checkOutStart.slice(0, 5))
    ) {
      setSettingsMsg({
        type: 'err',
        text: 'Jam masuk dan jam pulang standar wajib diisi dengan format jam yang valid.',
      });
      playChime('error');
      return;
    }

    setSavingSettings(true);
    try {
      await saveDistrictSettings(form, adminSession.username);
      const okText = 'Pengaturan kecamatan dan jadwal kerja berhasil disimpan.';
      setSettingsMsg({ type: 'ok', text: okText });
      setStatusMsg({ type: 'ok', text: okText });
      playChime('step_ok');
      speakVoice('Pengaturan kecamatan berhasil disimpan.');
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.';
      setSettingsMsg({ type: 'err', text: errText });
      setStatusMsg({ type: 'err', text: errText });
      playChime('error');
    } finally {
      setSavingSettings(false);
    }
  }

  function openNewSchoolModal() {
    setEditingSchool(null);
    setSchoolName('');
    setNpsn('');
    setAddress('');
    setHasLocation(false);
    setLatitude('0');
    setLongitude('0');
    setRadiusMeters(150);
    setSchoolFormError(null);
    setSchoolStatus('aktif');
    setSchoolModalOpen(true);
  }

  function openEditSchoolModal(s: School) {
    setEditingSchool(s);
    setSchoolName(s.schoolName);
    setNpsn(s.npsn);
    setAddress(s.address);
    setHasLocation(Boolean(s.hasLocation));
    setLatitude(String(s.latitude ?? 0));
    setLongitude(String(s.longitude ?? 0));
    setRadiusMeters(s.radiusMeters || 150);
    setSchoolFormError(null);
    setSchoolStatus(s.status);
    setSchoolModalOpen(true);
  }

  async function handleFetchSchoolGps() {
    setGpsFetching(true);
    setSchoolFormError(null);
    try {
      const pos = await getCurrentGpsPosition(15000);
      setHasLocation(true);
      setLatitude(String(pos.latitude));
      setLongitude(String(pos.longitude));
    } catch (err) {
      setSchoolFormError(err instanceof Error ? err.message : 'Gagal mengambil titik GPS.');
    } finally {
      setGpsFetching(false);
    }
  }

  async function handleSaveSchool(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    setSchoolBusy(true);
    setStatusMsg(null);
    setSchoolFormError(null);
    const parsedLat = Number(latitude);
    const parsedLng = Number(longitude);
    if (
      hasLocation &&
      (!Number.isFinite(parsedLat) ||
        !Number.isFinite(parsedLng) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLng < -180 ||
        parsedLng > 180 ||
        (parsedLat === 0 && parsedLng === 0))
    ) {
      setSchoolFormError('Masukkan koordinat Latitude dan Longitude sekolah yang valid.');
      setSchoolBusy(false);
      playChime('error');
      return;
    }

    try {
      await upsertSchool(
        {
          id: editingSchool?.id,
          schoolName,
          npsn,
          address,
          hasLocation,
          latitude: hasLocation ? parsedLat : 0,
          longitude: hasLocation ? parsedLng : 0,
          radiusMeters,
          weeklySchedule: editingSchool?.weeklySchedule,
          status: schoolStatus,
          createdAt: editingSchool?.createdAt,
        },
        adminSession.username
      );
      setSchoolModalOpen(false);
      setStatusMsg({
        type: 'ok',
        text: editingSchool
          ? `Sekolah ${schoolName} berhasil diperbarui.`
          : `Sekolah ${schoolName} berhasil ditambahkan ke kecamatan.`,
      });
      playChime('step_ok');
      speakVoice(
        editingSchool
          ? `Data sekolah ${schoolName} berhasil diperbarui.`
          : `Sekolah ${schoolName} berhasil ditambahkan.`
      );
    } catch (err) {
      setSchoolFormError(err instanceof Error ? err.message : 'Gagal menyimpan data sekolah.');
      playChime('error');
    } finally {
      setSchoolBusy(false);
    }
  }

  async function handleDeleteSchool(s: School) {
    unlockVoiceAudio();
    setSchoolBusy(true);
    setStatusMsg(null);
    try {
      await deleteSchool(s.id);
      setStatusMsg({
        type: 'ok',
        text: `Sekolah ${s.schoolName} telah dihapus dari daftar.`,
      });
      playChime('step_ok');
      speakVoice(`Sekolah ${s.schoolName} berhasil dihapus.`);
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menghapus sekolah.',
      });
      playChime('error');
    } finally {
      setSchoolBusy(false);
    }
  }

  async function handleChangeAdminPin(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    setPinBusy(true);
    setStatusMsg(null);
    try {
      await changeAdminPin(adminSession.username, currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setStatusMsg({
        type: 'ok',
        text: `PIN untuk akun administrator @${adminSession.username} berhasil diperbarui.`,
      });
      playChime('step_ok');
      speakVoice('PIN administrator berhasil diperbarui.');
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengubah PIN administrator.',
      });
      playChime('error');
    } finally {
      setPinBusy(false);
    }
  }

  async function handleAddOperatorAdmin(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    setOpBusy(true);
    setStatusMsg(null);
    try {
      await registerAdditionalAdmin(opUsername, opName, opPin, adminSession.username);
      setStatusMsg({
        type: 'ok',
        text: `Akun Administrator tambahan @${normalizeUsername(opUsername)} berhasil dibuat.`,
      });
      playChime('step_ok');
      speakVoice('Akun administrator tambahan berhasil dibuat.');
      setOpUsername('');
      setOpName('');
      setOpPin('');
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menambahkan akun administrator.',
      });
      playChime('error');
    } finally {
      setOpBusy(false);
    }
  }

  function updateScheduleDay(
    dayKey: DayOfWeekKey,
    patch: Partial<{ checkInStart: string; checkOutStart: string; enabled: boolean }>
  ) {
    setScheduleMsg(null);
    setScheduleDraft((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        ...patch,
      },
    }));
  }

  async function handleSaveSchoolSchedule(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    if (!selectedScheduleSchool || scheduleBusy) return;

    for (const { key, label } of WEEKDAY_ORDER) {
      const row = scheduleDraft[key];
      if (!row || !row.enabled) continue;
      const cleanIn = (row.checkInStart || '').trim().slice(0, 5);
      const cleanOut = (row.checkOutStart || '').trim().slice(0, 5);
      if (!PATTERNS.timeHHMM.test(cleanIn) || !PATTERNS.timeHHMM.test(cleanOut)) {
        setScheduleMsg({
          type: 'err',
          text: `Mohon lengkapi Jam Masuk dan Jam Pulang hari ${label} terlebih dahulu.`,
        });
        playChime('error');
        return;
      }
    }

    setScheduleBusy(true);
    setScheduleMsg(null);
    setStatusMsg(null);
    try {
      await saveSchoolWeeklySchedule(selectedScheduleSchool, scheduleDraft, adminSession.username);
      const okText = `Jadwal Senin–Sabtu untuk ${selectedScheduleSchool.schoolName} berhasil disimpan.`;
      setScheduleMsg({ type: 'ok', text: okText });
      setStatusMsg({ type: 'ok', text: okText });
      playChime('step_ok');
      speakVoice(`Jadwal sekolah ${selectedScheduleSchool.schoolName} berhasil disimpan.`);
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Gagal menyimpan jadwal sekolah.';
      setScheduleMsg({ type: 'err', text: errText });
      setStatusMsg({ type: 'err', text: errText });
      playChime('error');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function handleSyncCheckOutAtoB() {
    unlockVoiceAudio();
    const source = schools.find((s) => s.id === syncSourceSchoolId);
    if (!source) return;
    const targets =
      syncTargetSchoolId === '__all__'
        ? schools.filter((s) => s.id !== source.id)
        : schools.filter((s) => s.id === syncTargetSchoolId && s.id !== source.id);

    if (targets.length === 0) {
      const errText = 'Pilih minimal satu sekolah tujuan (Sekolah B) yang berbeda dari Sekolah A.';
      setSyncMsg({ type: 'err', text: errText });
      setStatusMsg({ type: 'err', text: errText });
      playChime('error');
      return;
    }

    setSyncBusy(true);
    setSyncMsg(null);
    setStatusMsg(null);
    try {
      const updatedCount = await syncSchoolCheckOutSchedule(
        source,
        targets,
        adminSession.username
      );
      const targetDesc =
        syncTargetSchoolId === '__all__'
          ? `${updatedCount} sekolah lainnya`
          : targets[0].schoolName;
      const okText = `Jam pulang Senin–Sabtu dari ${source.schoolName} berhasil disamakan ke ${targetDesc}.`;
      setSyncMsg({ type: 'ok', text: okText });
      setStatusMsg({ type: 'ok', text: okText });
      playChime('step_ok');
      speakVoice(`Jam pulang berhasil disamakan ke ${targetDesc}.`);
    } catch (err) {
      const errText =
        err instanceof Error ? err.message : 'Gagal menyamakan jam pulang antar sekolah.';
      setSyncMsg({ type: 'err', text: errText });
      setStatusMsg({ type: 'err', text: errText });
      playChime('error');
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    const targetSchool = schools.find((s) => s.id === holidaySchoolId);
    if (!targetSchool || holidayBusy) return;
    if (!PATTERNS.dateYMD.test(holidayDate)) {
      setHolidayMsg({ type: 'err', text: 'Pilih tanggal cuti/libur yang valid.' });
      playChime('error');
      return;
    }
    if (holidayReason.trim().length < 2) {
      setHolidayMsg({ type: 'err', text: 'Keterangan hari cuti minimal 2 karakter.' });
      playChime('error');
      return;
    }

    setHolidayBusy(true);
    setHolidayMsg(null);
    setStatusMsg(null);
    try {
      await addSchoolHoliday(
        {
          school: targetSchool,
          date: holidayDate,
          reason: holidayReason,
        },
        adminSession.username
      );
      setHolidayReason('');
      const okText = `Hari cuti/libur ${formatIndonesianDate(holidayDate)} untuk ${targetSchool.schoolName} berhasil ditambahkan.`;
      setHolidayMsg({ type: 'ok', text: okText });
      setStatusMsg({ type: 'ok', text: okText });
      playChime('step_ok');
      speakVoice(`Hari libur untuk ${targetSchool.schoolName} berhasil ditambahkan.`);
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Gagal menambahkan hari cuti sekolah.';
      setHolidayMsg({ type: 'err', text: errText });
      setStatusMsg({ type: 'err', text: errText });
      playChime('error');
    } finally {
      setHolidayBusy(false);
    }
  }

  async function handleDeleteHoliday(h: SchoolHoliday) {
    unlockVoiceAudio();
    setHolidayBusy(true);
    setHolidayMsg(null);
    setStatusMsg(null);
    try {
      await deleteSchoolHoliday(h.id);
      const okText = `Hari cuti ${formatIndonesianDate(h.date)} (${h.schoolName}) dihapus.`;
      setHolidayMsg({ type: 'ok', text: okText });
      setStatusMsg({ type: 'ok', text: okText });
      playChime('step_ok');
      speakVoice('Hari cuti berhasil dihapus.');
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Gagal menghapus hari cuti.';
      setHolidayMsg({ type: 'err', text: errText });
      setStatusMsg({ type: 'err', text: errText });
      playChime('error');
    } finally {
      setHolidayBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 text-white border border-emerald-800/60 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-medium text-amber-300">Manajemen Wilayah &amp; Keamanan</p>
        <h2 className="font-display text-xl font-bold text-white mt-1">
          Daftar Sekolah &amp; Pengaturan Kecamatan
        </h2>
        <p className="text-xs text-emerald-100 mt-1">
          Kelola daftar unit sekolah, koordinat GPS, jadwal kerja Senin–Sabtu, hari cuti khusus, serta akses administrator.
        </p>
      </div>

      {statusMsg && (
        <div
          role="status"
          className={`px-4 py-3 rounded-lg border text-xs flex items-center justify-between ${
            statusMsg.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="font-medium underline ml-4 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 1. Schools Management inside District */}
      <div className="bg-white border border-emerald-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 mt-0.5">
              <SchoolIcon className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Daftar Sekolah di {form.districtName} ({schools.length})
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Tambahkan atau atur daftar sekolah yang berada di bawah naungan kecamatan ini.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openNewSchoolModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Tambah Sekolah</span>
          </button>
        </div>

        {schools.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Belum ada sekolah terdaftar. Klik <strong>Tambah Sekolah</strong> untuk mulai membuat daftar
            unit sekolah.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-emerald-100 bg-emerald-50/40 text-xs font-semibold text-emerald-950">
                  <th className="py-3 px-4">Nama Sekolah</th>
                  <th className="py-3 px-4">NPSN</th>
                  <th className="py-3 px-4">Alamat</th>
                  <th className="py-3 px-4">Titik GPS &amp; Radius</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {schools.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-medium text-slate-900 flex items-center gap-2.5">
                      <SchoolIcon className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                      <span>{s.schoolName}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-600">
                      {s.npsn || '-'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{s.address || '—'}</td>
                    <td className="py-3 px-4 text-xs">
                      {s.hasLocation ? (
                        <div>
                          <p className="font-mono tabular-nums text-emerald-800 font-medium">
                            {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            Radius {s.radiusMeters} meter
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400">Belum diatur</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-medium ${
                          s.status === 'aktif' ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {s.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditSchoolModal(s)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          aria-label={`Edit ${s.schoolName}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={schoolBusy}
                          onClick={() => handleDeleteSchool(s)}
                          className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                          aria-label={`Hapus ${s.schoolName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1B. Jadwal Jam Masuk & Jam Pulang Tiap Sekolah (Senin - Sabtu) + Samakan Jam Pulang A & B */}
      <div className="bg-white border border-teal-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-teal-100 bg-gradient-to-r from-teal-50/80 via-emerald-50/40 to-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Atur Jam Masuk &amp; Jam Pulang Tiap Sekolah (Senin – Sabtu)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Setiap sekolah dapat memiliki jadwal jam masuk dan pulang tersendiri dari Senin sampai Sabtu.
              </p>
            </div>
          </div>
          {schools.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="sch-schedule-select" className="text-xs font-medium text-slate-600">
                Pilih Sekolah:
              </label>
              <select
                id="sch-schedule-select"
                value={scheduleSchoolId}
                onChange={(e) => setScheduleSchoolId(e.target.value)}
                className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-emerald-700"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.schoolName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {schools.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Tambahkan sekolah terlebih dahulu untuk mengatur jadwal Senin–Sabtu.
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <form onSubmit={handleSaveSchoolSchedule} noValidate className="space-y-4">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                      <th className="py-2.5 px-4">Hari</th>
                      <th className="py-2.5 px-4">Status Hari Kerja</th>
                      <th className="py-2.5 px-4">Jam Masuk</th>
                      <th className="py-2.5 px-4">Jam Pulang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {WEEKDAY_ORDER.map(({ key, label }) => {
                      const row = scheduleDraft[key] ?? DEFAULT_WEEKLY_SCHEDULE[key];
                      return (
                        <tr key={key} className={!row.enabled ? 'bg-slate-50/70 text-slate-400' : ''}>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{label}</td>
                          <td className="py-2.5 px-4">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) => updateScheduleDay(key, { enabled: e.target.checked })}
                                className="w-4 h-4 accent-emerald-800 rounded"
                              />
                              <span className="text-slate-700">
                                {row.enabled ? 'Hari Aktif' : 'Libur Rutin'}
                              </span>
                            </label>
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              type="time"
                              disabled={!row.enabled}
                              value={row.checkInStart}
                              onChange={(e) =>
                                updateScheduleDay(key, { checkInStart: e.target.value })
                              }
                              aria-label={`Jam masuk hari ${label}`}
                              className="px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
                            />
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              type="time"
                              disabled={!row.enabled}
                              value={row.checkOutStart}
                              onChange={(e) =>
                                updateScheduleDay(key, { checkOutStart: e.target.value })
                              }
                              aria-label={`Jam pulang hari ${label}`}
                              className="px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {scheduleMsg && (
                <div
                  role="status"
                  className={`px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                    scheduleMsg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <span>{scheduleMsg.text}</span>
                  <button
                    type="button"
                    onClick={() => setScheduleMsg(null)}
                    className="font-medium underline shrink-0 cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={scheduleBusy || !selectedScheduleSchool}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {scheduleBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {scheduleBusy
                      ? 'Menyimpan...'
                      : `Simpan Jadwal ${selectedScheduleSchool?.schoolName || ''}`}
                  </span>
                </button>
              </div>
            </form>

            {/* Sync Check-Out Between School A & School B */}
            {schools.length >= 2 && (
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                <div className="flex items-start gap-2.5">
                  <CopyCheck className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      Samakan Jam Pulang Antar Sekolah (Sekolah A &amp; Sekolah B)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Salin jadwal jam pulang Senin–Sabtu dari Sekolah A ke Sekolah B secara langsung tanpa mengubah jam masuk masing-masing.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4">
                    <label htmlFor="sync-a" className="block text-[11px] font-medium text-slate-700 mb-1">
                      Sekolah A (Sumber Jam Pulang)
                    </label>
                    <select
                      id="sync-a"
                      value={syncSourceSchoolId}
                      onChange={(e) => setSyncSourceSchoolId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.schoolName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label htmlFor="sync-b" className="block text-[11px] font-medium text-slate-700 mb-1">
                      Sekolah B (Tujuan Disamakan)
                    </label>
                    <select
                      id="sync-b"
                      value={syncTargetSchoolId}
                      onChange={(e) => setSyncTargetSchoolId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      {schools
                        .filter((s) => s.id !== syncSourceSchoolId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.schoolName}
                          </option>
                        ))}
                      <option value="__all__">Semua Sekolah Lain ({schools.length - 1} Sekolah)</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <button
                      type="button"
                      disabled={syncBusy}
                      onClick={handleSyncCheckOutAtoB}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-60 cursor-pointer"
                    >
                      {syncBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <CopyCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{syncBusy ? 'Menyamakan...' : 'Samakan Jam Pulang A → B'}</span>
                    </button>
                  </div>
                </div>

                {syncMsg && (
                  <div
                    role="status"
                    className={`px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                      syncMsg.type === 'ok'
                        ? 'bg-emerald-100/80 border-emerald-300 text-emerald-950'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <span>{syncMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setSyncMsg(null)}
                      className="font-medium underline shrink-0 cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1C. Atur Hari Cuti / Libur Tiap Sekolah */}
      <div className="bg-white border border-amber-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-amber-100 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <CalendarOff className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Atur Hari Cuti / Libur Tiap Sekolah
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Tetapkan tanggal libur khusus atau cuti per unit sekolah agar guru mendapat pemberitahuan pada tanggal tersebut.
              </p>
            </div>
          </div>
          {schools.length > 0 && (
            <select
              aria-label="Filter sekolah pada daftar cuti"
              value={holidayFilterSchoolId}
              onChange={(e) => setHolidayFilterSchoolId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            >
              <option value="semua">Semua Sekolah ({holidays.length})</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.schoolName}
                </option>
              ))}
            </select>
          )}
        </div>

        {schools.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Belum ada sekolah terdaftar untuk diatur hari cutinya.
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <form
              onSubmit={handleAddHoliday}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-xl bg-slate-50 border border-slate-200"
            >
              <div className="md:col-span-4">
                <label htmlFor="hol-sch" className="block text-xs font-medium text-slate-700 mb-1">
                  Sekolah
                </label>
                <select
                  id="hol-sch"
                  value={holidaySchoolId}
                  onChange={(e) => setHolidaySchoolId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.schoolName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label htmlFor="hol-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Cuti / Libur
                </label>
                <input
                  id="hol-date"
                  type="date"
                  required
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-3">
                <label htmlFor="hol-reason" className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Hari Cuti
                </label>
                <input
                  id="hol-reason"
                  type="text"
                  required
                  minLength={2}
                  maxLength={FIELD_LIMITS.holidayReasonMax}
                  value={holidayReason}
                  onChange={(e) => setHolidayReason(e.target.value)}
                  placeholder="Contoh: Cuti Bersama / HUT Sekolah"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={holidayBusy}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {holidayBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{holidayBusy ? 'Menyimpan...' : 'Tambah Cuti'}</span>
                </button>
              </div>
            </form>

            {holidayMsg && (
              <div
                role="status"
                className={`px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                  holidayMsg.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <span>{holidayMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setHolidayMsg(null)}
                  className="font-medium underline shrink-0 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            )}

            {filteredHolidays.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-4">
                Belum ada jadwal hari cuti/libur khusus untuk filter sekolah ini.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                      <th className="py-2.5 px-4">Tanggal</th>
                      <th className="py-2.5 px-4">Sekolah</th>
                      <th className="py-2.5 px-4">Keterangan Hari Cuti / Libur</th>
                      <th className="py-2.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredHolidays.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {formatIndonesianDate(h.date)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{h.schoolName}</td>
                        <td className="py-2.5 px-4 text-slate-600">{h.reason}</td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            disabled={holidayBusy}
                            onClick={() => handleDeleteHoliday(h)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Hapus</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. District Identity & Working Hours */}
      <form
        onSubmit={handleSaveSettings}
        noValidate
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
            Identitas Kecamatan &amp; Penandatangan Laporan
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label htmlFor="d-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nama Kecamatan *
              </label>
              <input
                id="d-name"
                type="text"
                required
                maxLength={FIELD_LIMITS.districtNameMax}
                value={form.districtName}
                onChange={(e) => setForm({ ...form, districtName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="d-regency" className="block text-xs font-medium text-slate-700 mb-1">
                Kabupaten / Kota
              </label>
              <input
                id="d-regency"
                type="text"
                maxLength={FIELD_LIMITS.regencyNameMax}
                value={form.regencyName}
                onChange={(e) => setForm({ ...form, regencyName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="d-coord" className="block text-xs font-medium text-slate-700 mb-1">
                Nama Koordinator Wilayah / Pengawas
              </label>
              <input
                id="d-coord"
                type="text"
                maxLength={FIELD_LIMITS.coordinatorNameMax}
                value={form.coordinatorName}
                onChange={(e) => setForm({ ...form, coordinatorName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="d-cnip" className="block text-xs font-medium text-slate-700 mb-1">
                NIP Koordinator
              </label>
              <input
                id="d-cnip"
                type="text"
                maxLength={FIELD_LIMITS.nipMax}
                value={form.coordinatorNip}
                onChange={(e) => setForm({ ...form, coordinatorNip: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
            Aturan Jam Kerja &amp; Toleransi Keterlambatan
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div>
              <label htmlFor="d-checkin" className="block text-xs font-medium text-slate-700 mb-1">
                Jam Masuk Standar
              </label>
              <input
                id="d-checkin"
                type="time"
                required
                value={form.checkInStart}
                onChange={(e) => setForm({ ...form, checkInStart: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="d-tol" className="block text-xs font-medium text-slate-700 mb-1">
                Toleransi Terlambat (Menit)
              </label>
              <input
                id="d-tol"
                type="number"
                min={0}
                max={120}
                required
                value={form.lateToleranceMinutes}
                onChange={(e) =>
                  setForm({ ...form, lateToleranceMinutes: Number(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="d-checkout" className="block text-xs font-medium text-slate-700 mb-1">
                Jam Pulang Standar
              </label>
              <input
                id="d-checkout"
                type="time"
                required
                value={form.checkOutStart}
                onChange={(e) => setForm({ ...form, checkOutStart: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
            Aturan Verifikasi Lokasi &amp; Wajah Guru
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requireLocationVerification}
                onChange={(e) =>
                  setForm({ ...form, requireLocationVerification: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 accent-emerald-800 rounded"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-800" aria-hidden="true" />
                  <span>Wajibkan Verifikasi Lokasi (Radius Sekolah)</span>
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Guru wajib berada dalam jarak radius GPS sekolah saat mengambil absen masuk dan pulang.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requireFaceVerification}
                onChange={(e) => setForm({ ...form, requireFaceVerification: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-emerald-800 rounded"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-800" aria-hidden="true" />
                  <span>Wajibkan Foto Kehadiran Langsung (+ Panduan Suara)</span>
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Guru cukup mengambil foto kehadiran langsung dengan panduan suara singkat saat absen masuk dan pulang.
                </p>
              </div>
            </label>
          </div>
        </div>

        {settingsMsg && (
          <div
            role="status"
            className={`px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
              settingsMsg.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span>{settingsMsg.text}</span>
            <button
              type="button"
              onClick={() => setSettingsMsg(null)}
              className="font-medium underline shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 flex justify-end">
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
          >
            {savingSettings ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Kecamatan'}</span>
          </button>
        </div>
      </form>

      {/* 3. Admin Security: Change Admin PIN & Add Operator Admin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleChangeAdminPin}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-emerald-800" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Ubah PIN Administrator (@{adminSession.username})
            </h3>
          </div>
          <div>
            <label htmlFor="cur-pin" className="block text-xs font-medium text-slate-700 mb-1">
              PIN Saat Ini (6 Digit)
            </label>
            <input
              id="cur-pin"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="new-admin-pin" className="block text-xs font-medium text-slate-700 mb-1">
              PIN Baru (6 Digit)
            </label>
            <input
              id="new-admin-pin"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={pinBusy}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-60 cursor-pointer"
          >
            {pinBusy ? 'Menyimpan...' : 'Perbarui PIN Admin'}
          </button>
        </form>

        <form
          onSubmit={handleAddOperatorAdmin}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-4 h-4 text-emerald-800" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Tambah Akun Administrator Tambahan
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="op-user" className="block text-xs font-medium text-slate-700 mb-1">
                Username Baru
              </label>
              <input
                id="op-user"
                type="text"
                required
                minLength={3}
                maxLength={FIELD_LIMITS.usernameMax}
                value={opUsername}
                onChange={(e) => setOpUsername(normalizeUsername(e.target.value))}
                placeholder="operator_kec"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="op-pin" className="block text-xs font-medium text-slate-700 mb-1">
                PIN (6 Digit)
              </label>
              <input
                id="op-pin"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={opPin}
                onChange={(e) => setOpPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="654321"
                className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label htmlFor="op-name" className="block text-xs font-medium text-slate-700 mb-1">
              Nama Lengkap Operator
            </label>
            <input
              id="op-name"
              type="text"
              required
              minLength={2}
              value={opName}
              onChange={(e) => setOpName(e.target.value)}
              placeholder="Staf Operator Korwil"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={opBusy}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
          >
            {opBusy ? 'Mendaftarkan...' : 'Buat Akun Administrator'}
          </button>
        </form>
      </div>

      {/* Add / Edit School Modal */}
      {schoolModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingSchool ? 'Ubah Data Sekolah' : 'Tambah Sekolah di Kecamatan'}
              </h3>
              <button
                type="button"
                onClick={() => setSchoolModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSchool} className="p-6 space-y-4 overflow-y-auto">
              {schoolFormError && (
                <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                  {schoolFormError}
                </div>
              )}

              <div>
                <label htmlFor="sch-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Sekolah *
                </label>
                <input
                  id="sch-name"
                  type="text"
                  required
                  minLength={3}
                  maxLength={FIELD_LIMITS.schoolNameMax}
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Contoh: SDN 11 Koto Balingka"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sch-npsn" className="block text-xs font-medium text-slate-700 mb-1">
                    NPSN
                  </label>
                  <input
                    id="sch-npsn"
                    type="text"
                    maxLength={FIELD_LIMITS.npsnMax}
                    value={npsn}
                    onChange={(e) => setNpsn(e.target.value)}
                    placeholder="10304511"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label htmlFor="sch-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Status Operasional
                  </label>
                  <select
                    id="sch-status"
                    value={schoolStatus}
                    onChange={(e) => setSchoolStatus(e.target.value as EntityStatus)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="sch-addr" className="block text-xs font-medium text-slate-700 mb-1">
                  Alamat / Nagari / Desa
                </label>
                <input
                  id="sch-addr"
                  type="text"
                  maxLength={FIELD_LIMITS.addressMax}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Alamat sekolah..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>

              {/* School GPS & Geofence Section */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasLocation}
                      onChange={(e) => setHasLocation(e.target.checked)}
                      className="w-4 h-4 accent-emerald-800 rounded"
                    />
                    <span>Aktifkan Titik Koordinat &amp; Radius Sekolah</span>
                  </label>
                  <button
                    type="button"
                    disabled={gpsFetching}
                    onClick={handleFetchSchoolGps}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${gpsFetching ? 'animate-spin' : ''}`} />
                    <span>{gpsFetching ? 'Mengambil GPS...' : 'Ambil Titik GPS Saat Ini'}</span>
                  </button>
                </div>

                {hasLocation && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div>
                      <label htmlFor="sch-lat" className="block text-[11px] font-medium text-slate-600 mb-1">
                        Latitude
                      </label>
                      <input
                        id="sch-lat"
                        type="number"
                        step="any"
                        min={-90}
                        max={90}
                        required={hasLocation}
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="sch-lng" className="block text-[11px] font-medium text-slate-600 mb-1">
                        Longitude
                      </label>
                      <input
                        id="sch-lng"
                        type="number"
                        step="any"
                        min={-180}
                        max={180}
                        required={hasLocation}
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="sch-rad" className="block text-[11px] font-medium text-slate-600 mb-1">
                        Radius (Meter)
                      </label>
                      <input
                        id="sch-rad"
                        type="number"
                        min={FIELD_LIMITS.minRadiusMeters}
                        max={FIELD_LIMITS.maxRadiusMeters}
                        required={hasLocation}
                        value={radiusMeters}
                        onChange={(e) => setRadiusMeters(Number(e.target.value) || 150)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSchoolModalOpen(false)}
                  disabled={schoolBusy}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={schoolBusy}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {schoolBusy ? 'Menyimpan...' : 'Simpan Sekolah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
