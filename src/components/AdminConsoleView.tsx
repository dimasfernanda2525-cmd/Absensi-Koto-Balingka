import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  LogOut,
  Menu,
  Plus,
  Printer,
  School as SchoolIcon,
  Settings,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { getCurrentMonthKey, getTodayDateString } from '../lib/dateUtils';
import {
  isVoiceEnabled,
  playChime,
  setVoiceEnabled as setGlobalVoiceEnabled,
  speakVoice,
  subscribeVoiceEnabled,
  unlockVoiceAudio,
} from '../lib/voiceGuide';
import {
  subscribeAttendanceByDate,
  subscribeAttendanceByMonth,
  subscribeSchoolHolidays,
  subscribeSchools,
  subscribeTeachers,
} from '../services/attendanceService';
import {
  AdminTab,
  AttendanceRecord,
  DistrictSettings,
  School,
  SchoolHoliday,
  SessionAccount,
  Teacher,
} from '../types/attendance';
import { AdminDailyMonitorView } from './AdminDailyMonitorView';
import { AdminDistrictSettingsView } from './AdminDistrictSettingsView';
import { AdminTeacherRegistryView } from './AdminTeacherRegistryView';
import { MonthlyRecapView } from './MonthlyRecapView';
import { TeacherProfileView } from './TeacherProfileView';

interface AdminConsoleViewProps {
  adminSession: SessionAccount;
  districtSettings: DistrictSettings;
  onLogoutAdmin: () => void;
  onSwitchToTeacherPortal: () => void;
}

const ADMIN_NAV: Array<{ id: AdminTab; label: string; icon: typeof ClipboardCheck }> = [
  { id: 'pemantauan', label: 'Pemantauan Harian', icon: ClipboardCheck },
  { id: 'rekap', label: 'Rekap Bulanan', icon: BarChart3 },
  { id: 'registrasi', label: 'Registrasi Guru & PIN', icon: UserPlus },
  { id: 'pengaturan', label: 'Sekolah & Pengaturan', icon: Settings },
];

export function AdminConsoleView({
  adminSession,
  districtSettings,
  onLogoutAdmin,
  onSwitchToTeacherPortal,
}: AdminConsoleViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('pemantauan');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKey());
  const [createTeacherTrigger, setCreateTeacherTrigger] = useState(0);

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolHolidays, setSchoolHolidays] = useState<SchoolHoliday[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [dailyAttendance, setDailyAttendance] = useState<AttendanceRecord[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [monthlyAttendance, setMonthlyAttendance] = useState<AttendanceRecord[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [viewingTeacherId, setViewingTeacherId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [emblemFailed, setEmblemFailed] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => isVoiceEnabled());

  useEffect(() => {
    return subscribeVoiceEnabled((next) => setVoiceEnabled(next));
  }, []);

  const viewingTeacher = useMemo(
    () => teachers.find((t) => t.id === viewingTeacherId) ?? null,
    [teachers, viewingTeacherId]
  );

  const viewingTeacherSchool = useMemo(() => {
    if (!viewingTeacher) return null;
    return schools.find((s) => s.id === viewingTeacher.schoolId) ?? null;
  }, [viewingTeacher, schools]);

  useEffect(() => {
    setTeachersLoading(true);
    const unsubSchools = subscribeSchools(
      (list) => setSchools(list),
      (err) => setSyncError(err.message)
    );
    const unsubHolidays = subscribeSchoolHolidays(
      (list) => setSchoolHolidays(list),
      () => undefined
    );
    const unsubTeachers = subscribeTeachers(
      (list) => {
        setTeachers(list);
        setTeachersLoading(false);
      },
      (err) => {
        setSyncError(err.message);
        setTeachersLoading(false);
      }
    );
    return () => {
      unsubSchools();
      unsubHolidays();
      unsubTeachers();
    };
  }, []);

  useEffect(() => {
    setDailyLoading(true);
    const unsub = subscribeAttendanceByDate(
      selectedDate,
      (records) => {
        setDailyAttendance(records);
        setDailyLoading(false);
      },
      (err) => {
        setSyncError(err.message);
        setDailyLoading(false);
      }
    );
    return () => unsub();
  }, [selectedDate]);

  useEffect(() => {
    setMonthlyLoading(true);
    const unsub = subscribeAttendanceByMonth(
      selectedMonth,
      (records) => {
        setMonthlyAttendance(records);
        setMonthlyLoading(false);
      },
      (err) => {
        setSyncError(err.message);
        setMonthlyLoading(false);
      }
    );
    return () => unsub();
  }, [selectedMonth]);

  const currentTabLabel = ADMIN_NAV.find((i) => i.id === activeTab)?.label ?? 'Pemantauan Harian';

  function handleHeaderPrimaryAction() {
    if (activeTab === 'registrasi') {
      setCreateTeacherTrigger((n) => n + 1);
    } else if (activeTab === 'rekap') {
      window.print();
    } else if (activeTab === 'pemantauan') {
      setSelectedDate(getTodayDateString());
    } else {
      setActiveTab('registrasi');
    }
  }

  function getHeaderActionLabel(): string {
    if (activeTab === 'registrasi') return 'Daftarkan Guru';
    if (activeTab === 'rekap') return 'Cetak Laporan';
    if (activeTab === 'pemantauan') return 'Tanggal Hari Ini';
    return 'Registrasi Guru';
  }

  function handleToggleGlobalVoice() {
    unlockVoiceAudio();
    const next = !voiceEnabled;
    setGlobalVoiceEnabled(next);
    if (next) {
      playChime('step_ok', true);
      speakVoice('Suara panduan administrator telah diaktifkan.', true);
    }
  }

  function handleLogoutWithVoice() {
    unlockVoiceAudio();
    speakVoice('Anda telah keluar dari konsol administrator. Hati-hati di jalan.');
    onLogoutAdmin();
  }

  return (
    <div className="min-h-screen flex">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden print:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-gradient-to-b from-emerald-950 via-slate-900 to-emerald-950 text-white border-r border-emerald-900/70 flex flex-col justify-between transition-transform duration-200 print:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          <div className="p-5 border-b border-emerald-800/60 flex items-center justify-between gap-3">
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
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-white truncate">
                  Konsol Admin
                </p>
                <p className="text-[11px] text-amber-300/90 truncate">
                  {districtSettings.districtName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="p-1.5 rounded-lg text-emerald-100 hover:bg-white/10 lg:hidden cursor-pointer"
              aria-label="Tutup menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="p-3 space-y-1.5" aria-label="Navigasi Administrator">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setViewingTeacherId(null);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-800/90 to-teal-800/80 text-white border border-amber-400/45 shadow-xs'
                      : 'text-emerald-100/80 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-emerald-300/75'}`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Admin Account & Switcher Footer */}
        <div className="p-4 border-t border-emerald-800/60 bg-black/15 space-y-2.5">
          <div className="min-w-0 pb-1">
            <p className="text-xs font-semibold text-white truncate">
              {adminSession.displayName}
            </p>
            <p className="text-[11px] text-emerald-200/80 font-mono truncate">
              @{adminSession.username} · Administrator
            </p>
          </div>

          <button
            type="button"
            onClick={onSwitchToTeacherPortal}
            className="w-full px-3 py-2 text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
          >
            Buka Portal Guru
          </button>

          <button
            type="button"
            onClick={handleLogoutWithVoice}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-emerald-50 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Keluar Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 3-Zone Top Header */}
        <header className="sticky top-0 z-30 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white border-b-2 border-amber-400/80 px-4 md:px-8 h-16 flex items-center justify-between gap-8 print:hidden shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="p-2 -ml-2 rounded-lg text-emerald-100 hover:bg-white/10 lg:hidden cursor-pointer shrink-0"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-display font-semibold text-white whitespace-nowrap shrink-0 hidden sm:inline">
                {districtSettings.districtName}
              </span>
              <span className="text-amber-300/70 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-amber-200 truncate">{currentTabLabel}</span>
            </div>
          </div>

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
              <span className="hidden md:inline">{voiceEnabled ? 'Suara Aktif' : 'Suara Bisu'}</span>
            </button>

            <button
              type="button"
              onClick={handleHeaderPrimaryAction}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              {activeTab === 'registrasi' ? (
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              ) : activeTab === 'rekap' ? (
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              ) : null}
              <span>{getHeaderActionLabel()}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {syncError && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-900 flex items-center justify-between gap-4 print:hidden"
            >
              <span className="break-all">Kendala sinkronisasi database: {syncError}</span>
              <button
                type="button"
                onClick={() => setSyncError(null)}
                className="font-medium underline shrink-0 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {viewingTeacher ? (
            <TeacherProfileView
              profileTeacher={viewingTeacher}
              viewerRole="admin"
              school={viewingTeacherSchool}
              settings={districtSettings}
              schoolHolidays={schoolHolidays}
              backLabel={`Kembali ke ${currentTabLabel}`}
              onBack={() => setViewingTeacherId(null)}
            />
          ) : (
            <>
              {activeTab === 'pemantauan' && (
                <AdminDailyMonitorView
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  schools={schools}
                  teachers={teachers}
                  teachersLoading={teachersLoading}
                  attendanceRecords={dailyAttendance}
                  attendanceLoading={dailyLoading}
                  settings={districtSettings}
                  adminSession={adminSession}
                  onNavigateToRegistry={() => setActiveTab('registrasi')}
                  onViewTeacherProfile={(teacher) => setViewingTeacherId(teacher.id)}
                />
              )}

              {activeTab === 'rekap' && (
                <MonthlyRecapView
                  selectedMonth={selectedMonth}
                  onMonthChange={setSelectedMonth}
                  schools={schools}
                  teachers={teachers}
                  monthlyRecords={monthlyAttendance}
                  loading={teachersLoading || monthlyLoading}
                  settings={districtSettings}
                />
              )}

              {activeTab === 'registrasi' && (
                <AdminTeacherRegistryView
                  schools={schools}
                  teachers={teachers}
                  loading={teachersLoading}
                  adminSession={adminSession}
                  externalCreateTrigger={createTeacherTrigger}
                  onNavigateToSettings={() => setActiveTab('pengaturan')}
                  onViewTeacherProfile={(teacher) => setViewingTeacherId(teacher.id)}
                />
              )}

              {activeTab === 'pengaturan' && (
                <AdminDistrictSettingsView
                  settings={districtSettings}
                  schools={schools}
                  adminSession={adminSession}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
