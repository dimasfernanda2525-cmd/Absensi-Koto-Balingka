import { useMemo, useState } from 'react';
import {
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { generateRandomSixDigitPin } from '../lib/crypto';
import { getInitials } from '../lib/dateUtils';
import { playChime, speakVoice, unlockVoiceAudio } from '../lib/voiceGuide';
import {
  deleteTeacherAndCredential,
  normalizeUsername,
  registerTeacherWithCredential,
  resetTeacherPin,
  seedSampleDistrictData,
  updateTeacherProfile,
} from '../services/attendanceService';
import {
  EmploymentType,
  EntityStatus,
  FIELD_LIMITS,
  School,
  SessionAccount,
  Teacher,
} from '../types/attendance';

interface AdminTeacherRegistryViewProps {
  schools: School[];
  teachers: Teacher[];
  loading: boolean;
  adminSession: SessionAccount;
  externalCreateTrigger: number;
  onNavigateToSettings: () => void;
  onViewTeacherProfile?: (teacher: Teacher) => void;
}

export function AdminTeacherRegistryView({
  schools,
  teachers,
  loading,
  adminSession,
  externalCreateTrigger,
  onNavigateToSettings,
  onViewTeacherProfile,
}: AdminTeacherRegistryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('semua');
  const [employmentFilter, setEmploymentFilter] = useState<'semua' | EmploymentType>('semua');

  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [resetPinTeacher, setResetPinTeacher] = useState<Teacher | null>(null);
  const [confirmDeleteTeacher, setConfirmDeleteTeacher] = useState<Teacher | null>(null);

  const [fullName, setFullName] = useState('');
  const [nip, setNip] = useState('');
  const [roleTitle, setRoleTitle] = useState('Guru Kelas');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('PNS');
  const [schoolId, setSchoolId] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<EntityStatus>('aktif');

  const [newResetPin, setNewResetPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const activeSchools = useMemo(
    () => schools.filter((s) => s.status === 'aktif'),
    [schools]
  );

  // Triggered from top header CTA
  const [lastTrigger, setLastTrigger] = useState(externalCreateTrigger);
  if (externalCreateTrigger !== lastTrigger) {
    setLastTrigger(externalCreateTrigger);
    openRegisterModal();
  }

  function suggestUsernameFromName(name: string): string {
    const cleaned = name
      .replace(/^(Hj\.|H\.|Drs\.|Dr\.)\s+/i, '')
      .split(',')[0]
      .trim()
      .split(/\s+/)[0];
    return normalizeUsername(cleaned || '');
  }

  function openRegisterModal() {
    setEditingTeacher(null);
    setFullName('');
    setNip('');
    setRoleTitle('Guru Kelas');
    setEmploymentType('PNS');
    setSchoolId(activeSchools[0]?.id || schools[0]?.id || '');
    setUsername('');
    setPin(generateRandomSixDigitPin());
    setStatus('aktif');
    setFormError(null);
    setRegisterModalOpen(true);
  }

  function openEditModal(teacher: Teacher) {
    setEditingTeacher(teacher);
    setFullName(teacher.fullName);
    setNip(teacher.nip);
    setRoleTitle(teacher.roleTitle);
    setEmploymentType(teacher.employmentType);
    setSchoolId(teacher.schoolId);
    setUsername(teacher.username);
    setPin('');
    setStatus(teacher.status);
    setFormError(null);
    setRegisterModalOpen(true);
  }

  function openResetPinModal(teacher: Teacher) {
    setResetPinTeacher(teacher);
    setNewResetPin(generateRandomSixDigitPin());
    setFormError(null);
  }

  async function handleSaveTeacher(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    const targetSchool = schools.find((s) => s.id === schoolId);
    if (!targetSchool) {
      setFormError('Pilih unit sekolah terlebih dahulu.');
      playChime('error');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingTeacher) {
        await updateTeacherProfile(
          editingTeacher,
          {
            fullName,
            nip,
            roleTitle,
            employmentType,
            school: targetSchool,
            status,
          },
          adminSession.username
        );
        setRegisterModalOpen(false);
        setBannerMsg({
          type: 'ok',
          text: `Profil guru ${fullName} berhasil diperbarui.`,
        });
        playChime('step_ok');
        speakVoice(`Data guru ${fullName} berhasil diperbarui.`);
      } else {
        await registerTeacherWithCredential(
          {
            fullName,
            nip,
            roleTitle,
            employmentType,
            school: targetSchool,
            username,
            pin,
            status,
          },
          adminSession.username
        );
        setRegisterModalOpen(false);
        setBannerMsg({
          type: 'ok',
          text: `Guru ${fullName} berhasil didaftarkan! Username: ${normalizeUsername(username)} · PIN: ${pin}`,
        });
        playChime('step_ok');
        speakVoice(`Akun guru ${fullName} berhasil didaftarkan.`);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan data guru.');
      playChime('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPinSubmit(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    if (!resetPinTeacher) return;
    setSaving(true);
    setFormError(null);
    try {
      await resetTeacherPin(resetPinTeacher, newResetPin, adminSession.username);
      setBannerMsg({
        type: 'ok',
        text: `PIN baru untuk ${resetPinTeacher.fullName} (@${resetPinTeacher.username}) adalah: ${newResetPin}`,
      });
      playChime('step_ok');
      speakVoice(`PIN baru untuk ${resetPinTeacher.fullName} berhasil disimpan.`);
      setResetPinTeacher(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal mereset PIN.');
      playChime('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    unlockVoiceAudio();
    if (!confirmDeleteTeacher) return;
    setSaving(true);
    try {
      await deleteTeacherAndCredential(confirmDeleteTeacher);
      setBannerMsg({
        type: 'ok',
        text: `Akun guru ${confirmDeleteTeacher.fullName} (@${confirmDeleteTeacher.username}) telah dihapus.`,
      });
      playChime('step_ok');
      speakVoice(`Akun guru ${confirmDeleteTeacher.fullName} telah dihapus.`);
      setConfirmDeleteTeacher(null);
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menghapus akun guru.',
      });
      playChime('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSeedSample() {
    unlockVoiceAudio();
    setSeeding(true);
    setBannerMsg(null);
    try {
      await seedSampleDistrictData(adminSession.username);
      setBannerMsg({
        type: 'ok',
        text: '3 sekolah dan 6 akun guru contoh berhasil didaftarkan (PIN contoh: 112233).',
      });
      playChime('step_ok');
      speakVoice('Data contoh sekolah dan guru berhasil dimuat.');
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memuat data contoh.',
      });
      playChime('error');
    } finally {
      setSeeding(false);
    }
  }

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teachers.filter((t) => {
      const matchQuery =
        !q ||
        t.fullName.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q) ||
        t.nip.toLowerCase().includes(q) ||
        t.schoolName.toLowerCase().includes(q);
      const matchSchool = schoolFilter === 'semua' || t.schoolId === schoolFilter;
      const matchType = employmentFilter === 'semua' || t.employmentType === employmentFilter;
      return matchQuery && matchSchool && matchType;
    });
  }, [teachers, searchQuery, schoolFilter, employmentFilter]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 text-white border border-emerald-800/60 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
        <div>
          <p className="text-xs font-medium text-amber-300">
            Akses Khusus Administrator
          </p>
          <h2 className="font-display text-xl font-bold text-white mt-0.5">
            Registrasi Guru, Username &amp; PIN
          </h2>
          <p className="text-xs text-emerald-100 mt-1">
            Daftarkan akun guru baru, tetapkan sekolah tugas, atau reset PIN 6 digit guru yang lupa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {teachers.length === 0 && (
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedSample}
              className="px-3.5 py-2 text-xs font-medium text-white bg-white/10 border border-white/20 hover:bg-white/20 rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {seeding ? 'Memuat...' : 'Muat Data Contoh'}
            </button>
          )}
          <button
            type="button"
            onClick={openRegisterModal}
            disabled={schools.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Daftarkan Guru &amp; PIN</span>
          </button>
        </div>
      </div>

      {schools.length === 0 && !loading && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-amber-900">
          <span>
            Belum ada sekolah terdaftar di kecamatan. Tambahkan minimal 1 sekolah terlebih dahulu
            sebelum mendaftarkan guru, atau muat data contoh.
          </span>
          <button
            type="button"
            onClick={onNavigateToSettings}
            className="px-3 py-1.5 font-medium bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Tambah Sekolah
          </button>
        </div>
      )}

      {bannerMsg && (
        <div
          role="status"
          className={`px-4 py-3 rounded-lg border text-xs flex items-center justify-between ${
            bannerMsg.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="font-medium">{bannerMsg.text}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="underline ml-4 cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            <div className="relative w-full sm:w-64">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, username, NIP..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-700"
              />
            </div>

            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              aria-label="Filter sekolah"
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-emerald-700"
            >
              <option value="semua">Semua Sekolah</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.schoolName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(['semua', 'PNS', 'PPPK', 'Honorer'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setEmploymentFilter(type)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  employmentFilter === type
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type === 'semua' ? 'Semua' : type}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-11 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-10 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Belum Ada Guru Terdaftar
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Daftarkan akun guru secara manual (beserta Username &amp; PIN 6 digit) atau muat data
              contoh kecamatan untuk uji coba langsung.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedSample}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
              >
                {seeding ? 'Memuat...' : 'Muat Data Contoh'}
              </button>
            </div>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            Tidak ada data guru yang sesuai dengan filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-teal-50/60 text-xs font-semibold text-emerald-950">
                  <th className="py-3 px-4 w-10">No</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Username Login</th>
                  <th className="py-3 px-4">Unit Sekolah</th>
                  <th className="py-3 px-4">Jabatan / Status</th>
                  <th className="py-3 px-4">Keaktifan</th>
                  <th className="py-3 px-4 text-right">Kelola</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredTeachers.map((teacher, idx) => (
                  <tr key={teacher.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onViewTeacherProfile?.(teacher)}
                          className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-emerald-600"
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
                        <div>
                          <button
                            type="button"
                            onClick={() => onViewTeacherProfile?.(teacher)}
                            className="font-medium text-slate-900 hover:text-emerald-800 hover:underline text-left cursor-pointer"
                          >
                            {teacher.fullName}
                          </button>
                          <p className="text-xs font-mono tabular-nums text-slate-500">
                            NIP {teacher.nip || '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-semibold text-emerald-800">
                        @{teacher.username}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-800">{teacher.schoolName}</td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-slate-800">{teacher.roleTitle}</p>
                      <p className="text-xs text-slate-500">{teacher.employmentType}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-medium ${
                          teacher.status === 'aktif' ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {teacher.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        {onViewTeacherProfile && (
                          <button
                            type="button"
                            onClick={() => onViewTeacherProfile(teacher)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer whitespace-nowrap"
                            title="Lihat profil lengkap & foto guru"
                          >
                            <User className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Profil</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openResetPinModal(teacher)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap"
                          title="Atur ulang PIN 6 digit"
                        >
                          <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Reset PIN</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(teacher)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          aria-label={`Ubah profil ${teacher.fullName}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTeacher(teacher)}
                          className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                          aria-label={`Hapus ${teacher.fullName}`}
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

      {/* Register / Edit Teacher Modal */}
      {registerModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingTeacher ? 'Ubah Data Guru' : 'Registrasi Akun Guru Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setRegisterModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} className="p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap &amp; Gelar *
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={FIELD_LIMITS.fullNameMax}
                  value={fullName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFullName(val);
                    if (!editingTeacher && !username) {
                      setUsername(suggestUsernameFromName(val));
                    }
                  }}
                  placeholder="Contoh: Hendrawan Putra, S.Pd."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-school" className="block text-xs font-medium text-slate-700 mb-1">
                    Unit Sekolah *
                  </label>
                  <select
                    id="reg-school"
                    required
                    value={schoolId}
                    onChange={(e) => setSchoolId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  >
                    <option value="" disabled>
                      Pilih sekolah...
                    </option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.schoolName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="reg-nip" className="block text-xs font-medium text-slate-700 mb-1">
                    NIP / NUPTK
                  </label>
                  <input
                    id="reg-nip"
                    type="text"
                    maxLength={FIELD_LIMITS.nipMax}
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    placeholder="19871104... atau -"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-role" className="block text-xs font-medium text-slate-700 mb-1">
                    Jabatan / Tugas *
                  </label>
                  <input
                    id="reg-role"
                    type="text"
                    required
                    minLength={2}
                    maxLength={FIELD_LIMITS.roleTitleMax}
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder="Contoh: Guru Kelas IV"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div>
                  <label htmlFor="reg-emp" className="block text-xs font-medium text-slate-700 mb-1">
                    Status Kepegawaian *
                  </label>
                  <select
                    id="reg-emp"
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  >
                    <option value="PNS">PNS</option>
                    <option value="PPPK">PPPK</option>
                    <option value="Honorer">Honorer</option>
                  </select>
                </div>
              </div>

              {!editingTeacher ? (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <p className="text-xs font-semibold text-slate-900">
                    Kredensial Masuk Portal Guru (Wajib Dicatat / Diserahkan ke Guru)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="reg-user" className="block text-xs font-medium text-slate-700 mb-1">
                        Username Login *
                      </label>
                      <input
                        id="reg-user"
                        type="text"
                        required
                        minLength={3}
                        maxLength={FIELD_LIMITS.usernameMax}
                        value={username}
                        onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                        placeholder="hendra"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-pin" className="block text-xs font-medium text-slate-700 mb-1">
                        PIN 6 Digit *
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="reg-pin"
                          type="text"
                          inputMode="numeric"
                          pattern="\d{6}"
                          maxLength={6}
                          required
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                        />
                        <button
                          type="button"
                          onClick={() => setPin(generateRandomSixDigitPin())}
                          className="px-2.5 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                          title="Acak PIN baru"
                          aria-label="Acak PIN baru"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-100">
                  <label htmlFor="reg-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Status Keaktifan Akun
                  </label>
                  <select
                    id="reg-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EntityStatus)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  >
                    <option value="aktif">Aktif (Dapat masuk &amp; ambil absen)</option>
                    <option value="nonaktif">Nonaktif (Akun ditangguhkan)</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRegisterModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {saving
                    ? 'Menyimpan...'
                    : editingTeacher
                    ? 'Simpan Perubahan'
                    : 'Daftarkan Guru & PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resetPinTeacher && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Atur Ulang PIN Guru
              </h3>
              <button
                type="button"
                onClick={() => setResetPinTeacher(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPinSubmit} className="p-6 space-y-4">
              <div className="text-xs text-slate-600 space-y-1">
                <p className="text-sm font-semibold text-slate-900">{resetPinTeacher.fullName}</p>
                <p>
                  Username: <span className="font-mono font-semibold">@{resetPinTeacher.username}</span> ·{' '}
                  {resetPinTeacher.schoolName}
                </p>
              </div>

              {formError && (
                <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="reset-pin-input" className="block text-xs font-medium text-slate-700 mb-1.5">
                  PIN Baru (6 Digit Angka)
                </label>
                <div className="flex gap-2">
                  <input
                    id="reset-pin-input"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={newResetPin}
                    onChange={(e) => setNewResetPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-3 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => setNewResetPin(generateRandomSixDigitPin())}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                    title="Acak PIN baru"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResetPinTeacher(null)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan PIN Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteTeacher && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-lg">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Hapus Akun &amp; Data Guru?
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Akun login <strong className="font-mono">@{confirmDeleteTeacher.username}</strong> dan
              profil <strong>{confirmDeleteTeacher.fullName}</strong> akan dihapus permanen.
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-6">
              <button
                type="button"
                onClick={() => setConfirmDeleteTeacher(null)}
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 rounded-lg disabled:opacity-60 cursor-pointer"
              >
                {saving ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
