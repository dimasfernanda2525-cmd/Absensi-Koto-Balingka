import { useEffect, useState } from 'react';
import { installVoiceGestureUnlock } from './lib/voiceGuide';
import { AdminConsoleView } from './components/AdminConsoleView';
import { AdminLoginScreen } from './components/AdminLoginScreen';
import { TeacherPortalView } from './components/TeacherPortalView';
import {
  ensureBootstrapData,
  subscribeDistrictSettings,
  subscribeSchoolDoc,
  subscribeTeacherDoc,
} from './services/attendanceService';
import {
  AppMode,
  DEFAULT_DISTRICT_SETTINGS,
  DistrictSettings,
  School,
  SessionAccount,
  Teacher,
} from './types/attendance';

const SESSION_STORAGE_KEY = 'absen_kecamatan_session_v1';

function loadSavedSession(): SessionAccount | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionAccount;
    if (parsed && parsed.username && (parsed.role === 'teacher' || parsed.role === 'admin')) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  const [bootReady, setBootReady] = useState(false);
  const [districtSettings, setDistrictSettings] = useState<DistrictSettings>(
    DEFAULT_DISTRICT_SETTINGS
  );

  const [initialSession] = useState<SessionAccount | null>(() => loadSavedSession());
  const [appMode, setAppMode] = useState<AppMode>(() =>
    initialSession?.role === 'admin' ? 'admin_console' : 'teacher_portal'
  );
  const [teacherSession, setTeacherSession] = useState<SessionAccount | null>(() =>
    initialSession?.role === 'teacher' ? initialSession : null
  );
  const [adminSession, setAdminSession] = useState<SessionAccount | null>(() =>
    initialSession?.role === 'admin' ? initialSession : null
  );
  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null);
  const [activeSchool, setActiveSchool] = useState<School | null>(null);

  useEffect(() => {
    let active = true;
    ensureBootstrapData().finally(() => {
      if (active) setBootReady(true);
    });

    const unsubSettings = subscribeDistrictSettings(
      (data) => setDistrictSettings(data),
      () => undefined
    );

    const unsubUnlock = installVoiceGestureUnlock();

    return () => {
      active = false;
      unsubSettings();
      unsubUnlock();
    };
  }, []);

  // Keep active teacher profile synchronized if signed in as teacher
  useEffect(() => {
    if (!teacherSession?.teacherId) {
      setActiveTeacher(null);
      return;
    }
    const unsub = subscribeTeacherDoc(
      teacherSession.teacherId,
      (teacherDoc) => {
        if (!teacherDoc || teacherDoc.status !== 'aktif') {
          setTeacherSession(null);
          setActiveTeacher(null);
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } else {
          setActiveTeacher(teacherDoc);
        }
      },
      () => undefined
    );
    return () => unsub();
  }, [teacherSession?.teacherId]);

  // Keep teacher's assigned school coordinates & radius synchronized
  useEffect(() => {
    const schoolId = activeTeacher?.schoolId || teacherSession?.schoolId;
    if (!schoolId) {
      setActiveSchool(null);
      return;
    }
    const unsub = subscribeSchoolDoc(
      schoolId,
      (schoolDoc) => setActiveSchool(schoolDoc),
      () => undefined
    );
    return () => unsub();
  }, [activeTeacher?.schoolId, teacherSession?.schoolId]);

  function handleTeacherLoginSuccess(session: SessionAccount, teacher: Teacher) {
    setTeacherSession(session);
    setActiveTeacher(teacher);
    setAppMode('teacher_portal');
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  function handleTeacherLogout() {
    setTeacherSession(null);
    setActiveTeacher(null);
    setActiveSchool(null);
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  function handleAdminLoginSuccess(session: SessionAccount) {
    setAdminSession(session);
    setAppMode('admin_console');
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  function handleAdminLogout() {
    setAdminSession(null);
    setAppMode('teacher_portal');
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  if (!bootReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2.5">
          <div className="w-8 h-8 border-2 border-emerald-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-600">Menyiapkan Portal Absensi Guru Kecamatan...</p>
        </div>
      </div>
    );
  }

  if (appMode === 'admin_console') {
    if (!adminSession) {
      return (
        <AdminLoginScreen
          districtSettings={districtSettings}
          onAdminLogin={handleAdminLoginSuccess}
          onBackToTeacherPortal={() => setAppMode('teacher_portal')}
        />
      );
    }

    return (
      <AdminConsoleView
        adminSession={adminSession}
        districtSettings={districtSettings}
        onLogoutAdmin={handleAdminLogout}
        onSwitchToTeacherPortal={() => setAppMode('teacher_portal')}
      />
    );
  }

  return (
    <TeacherPortalView
      districtSettings={districtSettings}
      session={teacherSession}
      teacher={activeTeacher}
      teacherSchool={activeSchool}
      onLoginSuccess={handleTeacherLoginSuccess}
      onLogout={handleTeacherLogout}
      onSwitchToAdmin={() => setAppMode('admin_console')}
    />
  );
}
