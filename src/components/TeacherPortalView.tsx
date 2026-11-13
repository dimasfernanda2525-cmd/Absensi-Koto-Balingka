import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarOff,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  School as SchoolIcon,
  ShieldCheck,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  isVoiceEnabled,
  playChime,
  setVoiceEnabled as setGlobalVoiceEnabled,
  speakVoice,
  subscribeVoiceEnabled,
  unlockVoiceAudio,
} from '../lib/voiceGuide';
import {
  computeCheckInStatus,
  formatIndonesianDate,
  formatIndonesianMonth,
  getCurrentMonthKey,
  getCurrentTimeHHMM,
  getCurrentTimeWithSeconds,
  getEffectiveDaySchedule,
  getInitials,
  getTodayDateString,
} from '../lib/dateUtils';
import {
  AttendanceVerificationInput,
  authenticateWithUsernameAndPin,
  saveAttendanceRecord,
  subscribeSchoolHolidays,
  subscribeSchools,
  subscribeTeacherMessages,
  subscribeTeacherMonthlyAttendance,
  subscribeTeachers,
} from '../services/attendanceService';
import {
  AttendanceRecord,
  DistrictSettings,
  FIELD_LIMITS,
  School,
  SchoolHoliday,
  SessionAccount,
  Teacher,
  TeacherMessage,
  TeacherTab,
} from '../types/attendance';
import { StatusIndicator } from './StatusIndicator';
import { TeacherCommunityView } from './TeacherCommunityView';
import { TeacherProfileView } from './TeacherProfileView';
import { VerificationCheckInModal } from './VerificationCheckInModal';

interface TeacherPortalViewProps {
  districtSettings: DistrictSettings;
  session: SessionAccount | null;
  teacher: Teacher | null;
  teacherSchool: School | null;
  onLoginSuccess: (session: SessionAccount, teacher: Teacher) => void;
  onLogout: () => void;
  onSwitchToAdmin: () => void;
}

export function TeacherPortalView({
  districtSettings,
  session,
  teacher,
  teacherSchool,
  onLoginSuccess,
  onLogout,
  onSwitchToAdmin,
}: TeacherPortalViewProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TeacherTab>('absensi');
  const [selectedColleagueId, setSelectedColleagueId] = useState<string | null>(null);

  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [schoolHolidays, setSchoolHolidays] = useState<SchoolHoliday[]>([]);
  const [messages, setMessages] = useState<TeacherMessage[]>([]);

  const [nowClock, setNowClock] = useState(() => getCurrentTimeWithSeconds());
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKey());
  const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Verification modal state ('checkin' | 'checkout' | null)
  const [verifyMode, setVerifyMode] = useState<'checkin' | 'checkout' | null>(null);

  // Leave Request Modal (Izin / Sakit)
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<'izin' | 'sakit'>('izin');
  const [leaveNotes, setLeaveNotes] = useState('');

  const [bannerFailed, setBannerFailed] = useState(false);
  const [emblemFailed, setEmblemFailed] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => isVoiceEnabled());

  const todayStr = getTodayDateString();
  const currentMonthKey = getCurrentMonthKey();

  useEffect(() => {
    return subscribeVoiceEnabled((next) => setVoiceEnabled(next));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowClock(getCurrentTimeWithSeconds());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Subscribe to directory, schools, holidays, and direct messages when teacher is logged in
  useEffect(() => {
    if (!teacher) {
      setAllTeachers([]);
      setAllSchools([]);
      setSchoolHolidays([]);
      setMessages([]);
      setActiveTab('absensi');
      setSelectedColleagueId(null);
      return;
    }

    const unsubTeachers = subscribeTeachers(
      (list) => setAllTeachers(list),
      () => undefined
    );
    const unsubSchools = subscribeSchools(
      (list) => setAllSchools(list),
      () => undefined
    );
    const unsubHolidays = subscribeSchoolHolidays(
      (list) => setSchoolHolidays(list),
      () => undefined
    );
    const unsubMessages = subscribeTeacherMessages(
      teacher.id,
      (list) => setMessages(list),
      () => undefined
    );

    return () => {
      unsubTeachers();
      unsubSchools();
      unsubHolidays();
      unsubMessages();
    };
  }, [teacher?.id]);

  // Use freshest teacher & school snapshot when subscribed list arrives
  const currentTeacher = useMemo(() => {
    if (!teacher) return null;
    return allTeachers.find((t) => t.id === teacher.id) ?? teacher;
  }, [teacher, allTeachers]);

  const currentTeacherSchool = useMemo(() => {
    if (!currentTeacher) return teacherSchool;
    return allSchools.find((s) => s.id === currentTeacher.schoolId) ?? teacherSchool;
  }, [currentTeacher, allSchools, teacherSchool]);

  const unreadMessageCount = useMemo(() => {
    if (!currentTeacher) return 0;
    return messages.filter((m) => m.recipientId === currentTeacher.id && !m.isRead).length;
  }, [messages, currentTeacher]);

  const todayEffectiveSchedule = useMemo(
    () => getEffectiveDaySchedule(todayStr, currentTeacherSchool, districtSettings),
    [todayStr, currentTeacherSchool, districtSettings]
  );

  const todaySchoolHoliday = useMemo(() => {
    if (!currentTeacher) return null;
    return (
      schoolHolidays.find(
        (h) => h.schoolId === currentTeacher.schoolId && h.date === todayStr
      ) ?? null
    );
  }, [schoolHolidays, currentTeacher, todayStr]);

  useEffect(() => {
    if (!teacher) {
      setMonthlyRecords([]);
      return;
    }
    setHistoryLoading(true);
    const unsub = subscribeTeacherMonthlyAttendance(
      teacher.id,
      selectedMonth,
      (records) => {
        setMonthlyRecords(records);
        setHistoryLoading(false);
      },
      (err) => {
        setActionMsg({ type: 'err', text: err.message });
        setHistoryLoading(false);
      }
    );
    return () => unsub();
  }, [teacher, selectedMonth]);

  const [todayRecordFromCurrentMonth, setTodayRecordFromCurrentMonth] =
    useState<AttendanceRecord | null>(null);

  useEffect(() => {
    if (!teacher) {
      setTodayRecordFromCurrentMonth(null);
      return;
    }
    if (selectedMonth === currentMonthKey) {
      setTodayRecordFromCurrentMonth(
        monthlyRecords.find((r) => r.date === todayStr) ?? null
      );
      return;
    }
    const unsub = subscribeTeacherMonthlyAttendance(
      teacher.id,
      currentMonthKey,
      (records) => {
        setTodayRecordFromCurrentMonth(records.find((r) => r.date === todayStr) ?? null);
      },
      () => undefined
    );
    return () => unsub();
  }, [teacher, selectedMonth, currentMonthKey, todayStr, monthlyRecords]);

  const monthStats = useMemo(() => {
    return monthlyRecords.reduce(
      (acc, r) => {
        acc[r.status] += 1;
        return acc;
      },
      { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 }
    );
  }, [monthlyRecords]);

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await authenticateWithUsernameAndPin(username, pin, 'teacher');
      if (!res.teacher) throw new Error('Data guru tidak ditemukan.');
      setPin('');
      onLoginSuccess(res.session, res.teacher);
      playChime('step_ok');
      speakVoice(
        `Halo, selamat datang ${res.teacher.fullName}. Selamat bekerja dan semangat mengajar hari ini.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk ke portal guru.';
      setAuthError(msg);
      playChime('error');
      speakVoice('Maaf, gagal masuk ke portal guru. Silakan periksa kembali username dan PIN Anda.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function performCheckIn(verification?: AttendanceVerificationInput) {
    if (!currentTeacher || !session) return;
    setActionBusy(true);
    setActionMsg(null);
    const nowHHMM = getCurrentTimeHHMM();
    const effectiveCheckIn = todayEffectiveSchedule.schedule.checkInStart;
    const status = computeCheckInStatus(
      nowHHMM,
      effectiveCheckIn,
      districtSettings.lateToleranceMinutes
    );

    try {
      await saveAttendanceRecord({
        date: todayStr,
        teacher: currentTeacher,
        status,
        checkInTime: nowHHMM,
        checkOutTime: '',
        notes:
          status === 'terlambat'
            ? 'Absen masuk mandiri (melewati toleransi)'
            : 'Absen masuk mandiri',
        verification,
        submittedByRole: 'teacher',
        recordedByUsername: session.username,
        recordedByName: currentTeacher.fullName,
      });
      setActionMsg({
        type: 'ok',
        text: `Absen masuk tercatat pukul ${nowHHMM} WIB dengan status ${
          status === 'hadir' ? 'Hadir Tepat Waktu' : 'Terlambat'
        }.`,
      });
      playChime('step_ok');
      speakVoice(
        status === 'hadir'
          ? 'Absen masuk berhasil dicatat. Selamat bekerja dan semoga hari Anda lancar.'
          : 'Absen masuk berhasil dicatat dengan status terlambat. Selamat bekerja hari ini.'
      );
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mencatat absen masuk.',
      });
      playChime('error');
      throw err;
    } finally {
      setActionBusy(false);
    }
  }

  async function performCheckOut(verification?: AttendanceVerificationInput) {
    if (!currentTeacher || !session || !todayRecordFromCurrentMonth) return;
    setActionBusy(true);
    setActionMsg(null);
    const nowHHMM = getCurrentTimeHHMM();

    const verifParts: string[] = [];
    if (verification?.distanceMeters !== undefined && verification.distanceMeters >= 0) {
      verifParts.push(`${verification.distanceMeters}m`);
    }
    if (verification?.faceStatus === 'photo_verified') {
      verifParts.push('foto terverifikasi');
    } else if (verification?.faceStatus === 'liveness_verified') {
      verifParts.push(`kedip & senyum ${verification.faceConfidence ?? 0}%`);
    } else if (verification?.faceStatus === 'matched') {
      verifParts.push(`wajah ${verification.faceConfidence ?? 0}%`);
    }
    const baseNote = todayRecordFromCurrentMonth.notes || 'Absen masuk mandiri';
    const nextNotes =
      verifParts.length > 0
        ? `${baseNote} · Pulang (${verifParts.join(', ')})`.slice(0, FIELD_LIMITS.notesMax)
        : baseNote;

    try {
      await saveAttendanceRecord({
        date: todayStr,
        teacher: currentTeacher,
        status: todayRecordFromCurrentMonth.status,
        checkInTime: todayRecordFromCurrentMonth.checkInTime,
        checkOutTime: nowHHMM,
        notes: nextNotes,
        submittedByRole: 'teacher',
        recordedByUsername: session.username,
        recordedByName: currentTeacher.fullName,
        existingRecord: todayRecordFromCurrentMonth,
      });
      setActionMsg({
        type: 'ok',
        text: `Absen pulang berhasil dicatat pukul ${nowHHMM} WIB.`,
      });
      playChime('step_ok');
      speakVoice(
        'Absen pulang berhasil dicatat. Terima kasih atas pengabdian hari ini, hati-hati di jalan dan selamat beristirahat.'
      );
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mencatat absen pulang.',
      });
      playChime('error');
      throw err;
    } finally {
      setActionBusy(false);
    }
  }

  function handleCheckInClick() {
    unlockVoiceAudio();
    if (
      districtSettings.requireLocationVerification ||
      districtSettings.requireFaceVerification
    ) {
      setVerifyMode('checkin');
    } else {
      performCheckIn({
        latitude: 0,
        longitude: 0,
        distanceMeters: -1,
        locationStatus: 'not_required',
        faceStatus: 'not_required',
        faceConfidence: 0,
        checkInPhotoUrl: '',
      }).catch(() => undefined);
    }
  }

  function handleCheckOutClick() {
    unlockVoiceAudio();
    if (
      districtSettings.requireLocationVerification ||
      districtSettings.requireFaceVerification
    ) {
      setVerifyMode('checkout');
    } else {
      performCheckOut().catch(() => undefined);
    }
  }

  async function handleSubmitLeave(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    if (!currentTeacher || !session) return;
    const cleanReason = leaveNotes.trim();
    if (cleanReason.length < 4) {
      setActionMsg({ type: 'err', text: 'Mohon isi alasan izin atau sakit secara jelas.' });
      playChime('error');
      speakVoice('Mohon isi alasan izin atau sakit dengan jelas terlebih dahulu.');
      return;
    }

    setActionBusy(true);
    setActionMsg(null);
    try {
      await saveAttendanceRecord({
        date: todayStr,
        teacher: currentTeacher,
        status: leaveType,
        checkInTime: '',
        checkOutTime: '',
        notes: cleanReason,
        submittedByRole: 'teacher',
        recordedByUsername: session.username,
        recordedByName: currentTeacher.fullName,
      });
      setLeaveModalOpen(false);
      setLeaveNotes('');
      setActionMsg({
        type: 'ok',
        text: `Pengajuan ${leaveType === 'izin' ? 'Izin' : 'Sakit'} hari ini berhasil dikirim.`,
      });
      playChime('step_ok');
      speakVoice(
        leaveType === 'izin'
          ? 'Pengajuan izin hari ini berhasil dikirim. Semoga urusan Anda lancar.'
          : 'Pengajuan keterangan sakit hari ini berhasil dikirim. Semoga lekas sembuh dan selamat beristirahat.'
      );
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengirim pengajuan izin/sakit.',
      });
      playChime('error');
    } finally {
      setActionBusy(false);
    }
  }

  function handleToggleGlobalVoice() {
    unlockVoiceAudio();
    const next = !voiceEnabled;
    setGlobalVoiceEnabled(next);
    if (next) {
      playChime('step_ok', true);
      speakVoice('Suara panduan dan ucapan aplikasi telah diaktifkan.', true);
    }
  }

  function handleLogoutWithVoice() {
    unlockVoiceAudio();
    speakVoice('Anda telah keluar dari portal guru. Sampai jumpa kembali, hati-hati di jalan.');
    onLogout();
  }

  const teacherNavItems: Array<{
    id: TeacherTab;
    label: string;
    icon: typeof ClipboardCheck;
    badge?: number;
  }> = [
    { id: 'absensi', label: 'Absensi', icon: ClipboardCheck },
    { id: 'profil', label: 'Profil Saya', icon: User },
    { id: 'rekan', label: 'Rekan Guru', icon: Users },
    { id: 'pesan', label: 'Pesan', icon: MessageSquare, badge: unreadMessageCount },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white border-b-2 border-amber-400/80 shadow-sm px-4 md:px-8 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3 min-w-0">
          {!emblemFailed ? (
            <img
              src="/assets/aistudio/Lambang-Kabupaten-Pasaman-Barat-Sumatera-Barat_128__1__77a567ea.png"
              alt="Lambang Kabupaten Pasaman Barat"
              onError={() => setEmblemFailed(true)}
              className="h-10 w-auto object-contain shrink-0 drop-shadow-xs"
            />
          ) : (
            <SchoolIcon className="w-6 h-6 text-amber-300 shrink-0" aria-hidden="true" />
          )}
          <span className="font-display text-base font-bold text-white whitespace-nowrap shrink-0">
            Absensi Koto Balingka
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
          {!currentTeacher ? (
            <span className="whitespace-nowrap shrink-0 text-emerald-100/90 text-xs">
              {districtSettings.districtName} · {districtSettings.regencyName}
            </span>
          ) : (
            teacherNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id === 'rekan') {
                      setSelectedColleagueId(null);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white/15 text-white border border-white/25 shadow-xs'
                      : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-0.5 text-[11px] font-bold text-amber-300 tabular-nums">
                      ({item.badge})
                    </span>
                  )}
                </button>
              );
            })
          )}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleGlobalVoice}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              voiceEnabled
                ? 'bg-emerald-800/80 border-emerald-400/40 text-emerald-50 hover:bg-emerald-800'
                : 'bg-white/10 border-white/20 text-emerald-200/80 hover:bg-white/20'
            }`}
            title={voiceEnabled ? 'Matikan suara aplikasi' : 'Aktifkan suara aplikasi'}
            aria-label={voiceEnabled ? 'Matikan suara aplikasi' : 'Aktifkan suara aplikasi'}
          >
            {voiceEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span className="hidden xl:inline">{voiceEnabled ? 'Suara Aktif' : 'Suara Bisu'}</span>
          </button>

          {currentTeacher ? (
            <>
              <button
                type="button"
                onClick={onSwitchToAdmin}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-50 bg-white/10 border border-white/20 hover:bg-white/20 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                <span>Admin</span>
              </button>
              <button
                type="button"
                onClick={handleLogoutWithVoice}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSwitchToAdmin}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Masuk Admin</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Bar for Logged-in Teachers */}
      {currentTeacher && (
        <div className="md:hidden bg-emerald-900/95 border-b border-emerald-800 px-3 py-2 flex items-center gap-1 overflow-x-auto">
          {teacherNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'rekan') {
                    setSelectedColleagueId(null);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-emerald-100 hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="text-[11px] font-bold text-amber-300 tabular-nums">
                    ({item.badge})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <main
        className={`flex-1 w-full max-w-6xl mx-auto p-4 md:p-8 flex flex-col ${
          !currentTeacher ? 'justify-center gap-6' : ''
        }`}
      >
        {!currentTeacher ? (
          /* Teacher Login Screen (Default Main Landing View) */
          <div className="bg-white/95 border border-emerald-200/80 rounded-2xl shadow-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 relative min-h-[260px] lg:min-h-[500px] bg-emerald-950 overflow-hidden">
              {!bannerFailed ? (
                <img
                  src="/src/assets/images/sdn11_campus_courtyard_1794544233370.jpg"
                  alt="Halaman sekolah di kecamatan pada pagi hari"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerFailed(true)}
                  className="w-full h-full lg:h-full object-cover object-center"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-900 flex items-center justify-center">
                  <SchoolIcon className="w-20 h-20 text-emerald-300/30" aria-hidden="true" />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/95 via-slate-950/50 to-emerald-950/25 flex flex-col justify-between p-6 md:p-10 text-white">
                <div className="inline-flex items-center gap-2.5 self-start bg-slate-950/65 backdrop-blur-xs border border-amber-300/35 px-3.5 py-2 rounded-lg text-xs font-mono tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                  <span>{nowClock} WIB</span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-amber-300 mb-2">
                    {districtSettings.districtName} · {districtSettings.regencyName}
                  </p>
                  <h1 className="font-display text-2xl md:text-3xl font-semibold leading-tight text-balance">
                    Portal Pengambilan Absensi Guru Sekolah
                  </h1>
                  <p className="mt-3 text-sm text-emerald-50/90 max-w-lg leading-relaxed">
                    {formatIndonesianDate(todayStr)} · Jam masuk {districtSettings.checkInStart}{' '}
                    (toleransi {districtSettings.lateToleranceMinutes} menit) · Jam pulang{' '}
                    {districtSettings.checkOutStart}
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-8 md:p-10 flex flex-col justify-between bg-gradient-to-b from-emerald-50/60 via-white to-amber-50/30">
              <div>
                <div className="mb-7">
                  <p className="text-xs font-semibold text-emerald-800 mb-1">Portal Presensi Guru</p>
                  <h2 className="font-display text-2xl font-bold text-slate-900">
                    Masuk untuk Ambil Absen
                  </h2>
                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                    Masukkan Username dan PIN 6 digit yang telah didaftarkan oleh Administrator.
                  </p>
                </div>

                {authError && (
                  <div
                    role="alert"
                    className="mb-5 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 leading-relaxed"
                  >
                    {authError}
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="teacher-username"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Username Guru
                    </label>
                    <input
                      id="teacher-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      placeholder="Contoh: hendra"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="teacher-pin"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      PIN (6 Digit Angka)
                    </label>
                    <div className="relative">
                      <input
                        id="teacher-pin"
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        required
                        autoComplete="current-password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="••••••"
                        className="w-full px-3.5 py-2.5 pr-10 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" aria-hidden="true" />
                    <span>{authLoading ? 'Memverifikasi...' : 'Masuk & Ambil Absen'}</span>
                  </button>
                </form>
              </div>

              <div className="mt-8 pt-5 border-t border-slate-200 space-y-2 text-xs text-slate-500">
                <div className="flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="leading-relaxed">
                    Pendaftaran akun baru dan pengaturan ulang PIN hanya dapat dilakukan oleh
                    Administrator kecamatan.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'profil' ? (
          <TeacherProfileView
            profileTeacher={currentTeacher}
            viewerTeacher={currentTeacher}
            school={currentTeacherSchool}
            settings={districtSettings}
            schoolHolidays={schoolHolidays}
            messages={messages}
          />
        ) : activeTab === 'rekan' || activeTab === 'pesan' ? (
          <TeacherCommunityView
            mode={activeTab}
            viewerTeacher={currentTeacher}
            teachers={allTeachers}
            schools={allSchools}
            settings={districtSettings}
            schoolHolidays={schoolHolidays}
            messages={messages}
            selectedColleagueId={selectedColleagueId}
            onSelectColleagueId={setSelectedColleagueId}
            onOpenChatWithColleague={(colleague) => {
              setSelectedColleagueId(colleague.id);
              setActiveTab('pesan');
            }}
            onVisitColleagueProfile={(colleague) => {
              setSelectedColleagueId(colleague.id);
              setActiveTab('rekan');
            }}
          />
        ) : (
          /* Tab 1: Teacher Attendance Dashboard (Absensi) */
          <div className="space-y-6">
            {/* Teacher Identity & Today Check-in Hero Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 text-white border border-emerald-800 rounded-2xl p-6 md:p-7 shadow-md flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-start gap-4 relative z-10">
                <button
                  type="button"
                  onClick={() => setActiveTab('profil')}
                  className="w-16 h-16 rounded-2xl bg-white/15 border-2 border-amber-300/80 text-white font-display font-bold text-lg flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:scale-[1.03] transition-transform shadow-sm"
                  title="Buka Profil Saya"
                >
                  {currentTeacher.avatarPhotoUrl ? (
                    <img
                      src={currentTeacher.avatarPhotoUrl}
                      alt={currentTeacher.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{getInitials(currentTeacher.fullName)}</span>
                  )}
                </button>
                <div>
                  <p className="text-xs font-semibold text-amber-300">
                    {currentTeacher.schoolName} · @{currentTeacher.username}
                  </p>
                  <h1 className="font-display text-xl md:text-2xl font-bold text-white mt-0.5">
                    {currentTeacher.fullName}
                  </h1>
                  <p className="text-xs text-emerald-100/90 mt-1">
                    {currentTeacher.roleTitle} · {currentTeacher.employmentType} · NIP{' '}
                    <span className="font-mono tabular-nums">{currentTeacher.nip || '-'}</span>
                  </p>
                  <p className="text-[11px] text-emerald-200/90 mt-1.5 font-mono tabular-nums">
                    {todayEffectiveSchedule.dayKey && todayEffectiveSchedule.schedule.enabled
                      ? `Jadwal sekolah hari ini: Masuk ${todayEffectiveSchedule.schedule.checkInStart} · Pulang ${todayEffectiveSchedule.schedule.checkOutStart}`
                      : 'Hari ini jadwal rutin sekolah libur'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 relative z-10">
                <div className="px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15 text-xs">
                  <p className="text-emerald-100">{formatIndonesianDate(todayStr)}</p>
                  <p className="font-mono tabular-nums font-bold text-amber-300 text-base mt-0.5">
                    {nowClock} WIB
                  </p>
                </div>

                {!todayRecordFromCurrentMonth ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleCheckInClick}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl cursor-pointer whitespace-nowrap disabled:opacity-60 shadow-sm"
                    >
                      <UserCheck className="w-4 h-4" aria-hidden="true" />
                      <span>{actionBusy ? 'Menyimpan...' : 'Absen Masuk Sekarang'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => setLeaveModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-white bg-white/15 border border-white/25 hover:bg-white/25 rounded-xl cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      <FileText className="w-4 h-4" aria-hidden="true" />
                      <span>Ajukan Izin / Sakit</span>
                    </button>
                  </div>
                ) : (todayRecordFromCurrentMonth.status === 'hadir' ||
                    todayRecordFromCurrentMonth.status === 'terlambat') &&
                  !todayRecordFromCurrentMonth.checkOutTime ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleCheckOutClick}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl cursor-pointer whitespace-nowrap disabled:opacity-60 shadow-sm"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    <span>{actionBusy ? 'Menyimpan...' : 'Catat Absen Pulang'}</span>
                  </button>
                ) : (
                  <div className="px-4 py-3 rounded-xl border border-amber-300 bg-white/95 text-slate-900 shadow-sm">
                    <p className="text-[11px] text-slate-600 font-semibold">
                      Presensi Hari Ini Selesai
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusIndicator status={todayRecordFromCurrentMonth.status} />
                      {todayRecordFromCurrentMonth.checkInTime && (
                        <span className="text-xs font-mono font-semibold tabular-nums text-slate-800">
                          · {todayRecordFromCurrentMonth.checkInTime}–
                          {todayRecordFromCurrentMonth.checkOutTime || '...'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {todaySchoolHoliday && (
              <div className="px-4 py-3.5 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 text-xs text-amber-950 flex items-start gap-2.5 shadow-xs">
                <CalendarOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">
                    Hari Cuti / Libur Sekolah ({currentTeacher.schoolName})
                  </p>
                  <p className="mt-0.5">
                    Tanggal hari ini ditetapkan sebagai hari cuti/libur: <strong>{todaySchoolHoliday.reason}</strong>.
                  </p>
                </div>
              </div>
            )}

            {actionMsg && (
              <div
                role="status"
                className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between shadow-xs ${
                  actionMsg.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <span>{actionMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setActionMsg(null)}
                  className="font-medium underline ml-4 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Today Detail Status Strip */}
            {todayRecordFromCurrentMonth && (
              <div className="bg-white/95 border border-emerald-200/70 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-xs text-slate-500">Status Hari Ini</p>
                    <div className="mt-1">
                      <StatusIndicator status={todayRecordFromCurrentMonth.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Jam Masuk</p>
                    <p className="text-sm font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                      {todayRecordFromCurrentMonth.checkInTime || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Jam Pulang</p>
                    <p className="text-sm font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                      {todayRecordFromCurrentMonth.checkOutTime || 'Belum tercatat'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Verifikasi Koordinat &amp; Foto</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        <span>
                          {todayRecordFromCurrentMonth.locationStatus === 'verified'
                            ? `Radius OK (${todayRecordFromCurrentMonth.distanceMeters} m)`
                            : todayRecordFromCurrentMonth.locationStatus === 'unconfigured'
                            ? 'GPS Sekolah Belum Diatur'
                            : todayRecordFromCurrentMonth.locationStatus === 'outside_radius'
                            ? `Di Luar Radius (${todayRecordFromCurrentMonth.distanceMeters} m)`
                            : 'Tanpa Cek Lokasi'}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Camera className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        <span>
                          {todayRecordFromCurrentMonth.faceStatus === 'photo_verified'
                            ? 'Foto Terverifikasi'
                            : todayRecordFromCurrentMonth.faceStatus === 'liveness_verified'
                            ? `Kedip & Senyum OK (${todayRecordFromCurrentMonth.faceConfidence}%)`
                            : todayRecordFromCurrentMonth.faceStatus === 'liveness_failed'
                            ? 'Verifikasi Foto Gagal'
                            : todayRecordFromCurrentMonth.faceStatus === 'matched'
                            ? `Wajah Cocok (${todayRecordFromCurrentMonth.faceConfidence}%)`
                            : todayRecordFromCurrentMonth.faceStatus === 'no_reference'
                            ? 'Foto Tersimpan'
                            : 'Tanpa Foto'}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Keterangan</p>
                    <p className="text-xs text-slate-700 mt-1">
                      {todayRecordFromCurrentMonth.notes || '—'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Masuk {todayEffectiveSchedule.schedule.checkInStart} (+
                  {districtSettings.lateToleranceMinutes}m) · Pulang{' '}
                  {todayEffectiveSchedule.schedule.checkOutStart}
                </p>
              </div>
            )}

            {/* 4-Column Colorful Monthly Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 border border-emerald-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-emerald-900">Hadir Bulan Ini</p>
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold text-emerald-800 tabular-nums mt-2">
                  {monthStats.hadir}
                </p>
                <p className="text-xs text-slate-600 mt-1">{formatIndonesianMonth(selectedMonth)}</p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 via-white to-orange-50/60 border border-amber-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-amber-900">Terlambat</p>
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold text-amber-700 tabular-nums mt-2">
                  {monthStats.terlambat}
                </p>
                <p className="text-xs text-slate-600 mt-1">Hari tercatat</p>
              </div>

              <div className="bg-gradient-to-br from-sky-50 via-white to-indigo-50/60 border border-sky-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-sky-900">Izin</p>
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" aria-hidden="true" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold text-sky-800 tabular-nums mt-2">
                  {monthStats.izin}
                </p>
                <p className="text-xs text-slate-600 mt-1">Pengajuan izin</p>
              </div>

              <div className="bg-gradient-to-br from-rose-50/80 via-white to-slate-50 border border-rose-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-rose-900">Sakit / Alpa</p>
                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                    <CalendarOff className="w-4 h-4" aria-hidden="true" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold text-slate-900 tabular-nums mt-2">
                  {monthStats.sakit + monthStats.alpa}
                </p>
                <p className="text-xs text-slate-600 mt-1 tabular-nums">
                  Sakit {monthStats.sakit} · Alpa {monthStats.alpa}
                </p>
              </div>
            </div>

            {/* Monthly Attendance Progress Strip */}
            <div className="bg-white/95 border border-emerald-200/70 rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-900">
                    Persentase Hadir ({formatIndonesianMonth(selectedMonth)})
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-800 tabular-nums">
                  {monthlyRecords.length > 0
                    ? `${Math.round(((monthStats.hadir + monthStats.terlambat) / monthlyRecords.length) * 100)}%`
                    : '0%'}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-700 to-teal-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      monthlyRecords.length > 0
                        ? Math.round(((monthStats.hadir + monthStats.terlambat) / monthlyRecords.length) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {monthStats.hadir + monthStats.terlambat} dari {monthlyRecords.length} hari tercatat bulan ini
              </p>
            </div>

            {/* Monthly Attendance History Table */}
            <div className="bg-white/95 border border-emerald-200/70 rounded-xl overflow-hidden shadow-xs">
              <div className="p-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Riwayat Kehadiran Bulan {formatIndonesianMonth(selectedMonth)}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Catatan absensi pribadi yang tersimpan di sistem kecamatan
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      if (e.target.value) setSelectedMonth(e.target.value);
                    }}
                    className="px-3 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              {historyLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : monthlyRecords.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Belum ada catatan kehadiran untuk bulan {formatIndonesianMonth(selectedMonth)}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                        <th className="py-3 px-4">Tanggal</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Jam Masuk</th>
                        <th className="py-3 px-4 text-right">Jam Pulang</th>
                        <th className="py-3 px-4">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {monthlyRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 text-xs font-medium text-slate-900">
                            {formatIndonesianDate(rec.date)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusIndicator status={rec.status} />
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                            {rec.checkInTime || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                            {rec.checkOutTime || '—'}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">{rec.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Leave Request Modal (Izin / Sakit) */}
      {leaveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-modal-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="leave-modal-title" className="font-display text-base font-semibold text-slate-900">
                Ajukan Izin atau Sakit Hari Ini
              </h2>
              <button
                type="button"
                onClick={() => setLeaveModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup jendela"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Jenis Keterangan
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setLeaveType('izin')}
                    className={`px-4 py-2.5 text-xs font-medium rounded-lg border cursor-pointer ${
                      leaveType === 'izin'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Izin
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveType('sakit')}
                    className={`px-4 py-2.5 text-xs font-medium rounded-lg border cursor-pointer ${
                      leaveType === 'sakit'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Sakit
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="leave-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Alasan / Keterangan *
                </label>
                <textarea
                  id="leave-notes"
                  rows={3}
                  required
                  minLength={4}
                  maxLength={FIELD_LIMITS.notesMax}
                  value={leaveNotes}
                  onChange={(e) => setLeaveNotes(e.target.value)}
                  placeholder="Tuliskan alasan izin atau keterangan sakit..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setLeaveModalOpen(false)}
                  disabled={actionBusy}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {actionBusy ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GPS Coordinates & Instant Photo Verification Modal */}
      {currentTeacher && verifyMode && (
        <VerificationCheckInModal
          isOpen={Boolean(verifyMode)}
          mode={verifyMode}
          teacher={currentTeacher}
          school={currentTeacherSchool}
          settings={districtSettings}
          onClose={() => setVerifyMode(null)}
          onConfirm={async (verification) => {
            if (verifyMode === 'checkin') {
              await performCheckIn(verification);
            } else {
              await performCheckOut(verification);
            }
          }}
        />
      )}
    </div>
  );
}
