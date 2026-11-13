import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarOff,
  Camera,
  Clock,
  Crop,
  Edit3,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  RotateCcw,
  Save,
  School as SchoolIcon,
  Send,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import { formatIndonesianDate, getDayOfWeekKey, getInitials, getTodayDateString } from '../lib/dateUtils';
import { playChime, speakVoice, unlockVoiceAudio } from '../lib/voiceGuide';
import {
  buildInstagramHref,
  buildWhatsAppHref,
  formatInstagramDisplay,
  formatWhatsAppDisplay,
  InstagramLogoIcon,
  normalizeInstagramInput,
  WhatsAppLogoIcon,
} from '../lib/socialLinks';
import {
  buildMessageThreadId,
  customizeTeacherProfile,
  markThreadMessagesRead,
  sendTeacherMessage,
} from '../services/attendanceService';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  DistrictSettings,
  FIELD_LIMITS,
  School,
  SchoolHoliday,
  Teacher,
  TeacherMessage,
  WEEKDAY_ORDER,
} from '../types/attendance';
import { CroppedPhotoResult, PhotoCropModal } from './PhotoCropModal';
import { PhotoLightboxModal } from './PhotoLightboxModal';

interface TeacherProfileViewProps {
  profileTeacher: Teacher;
  viewerTeacher?: Teacher;
  viewerRole?: 'teacher' | 'admin';
  school: School | null;
  settings: DistrictSettings;
  schoolHolidays: SchoolHoliday[];
  messages?: TeacherMessage[];
  backLabel?: string;
  onBack?: () => void;
  onOpenFullChat?: (colleague: Teacher) => void;
}

export function TeacherProfileView({
  profileTeacher,
  viewerTeacher,
  viewerRole = 'teacher',
  school,
  settings,
  schoolHolidays,
  messages = [],
  backLabel,
  onBack,
  onOpenFullChat,
}: TeacherProfileViewProps) {
  const isAdminViewer = viewerRole === 'admin' || !viewerTeacher;
  const isOwnProfile = !isAdminViewer && viewerTeacher?.id === profileTeacher.id;

  // Profile customization state (when viewing own profile)
  const [editing, setEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState(profileTeacher.bio || '');
  const [whatsappDraft, setWhatsappDraft] = useState(profileTeacher.whatsapp || '');
  const [instagramDraft, setInstagramDraft] = useState(profileTeacher.instagram || '');
  const [avatarDraft, setAvatarDraft] = useState(profileTeacher.avatarPhotoUrl || '');
  const [coverDraft, setCoverDraft] = useState(profileTeacher.coverPhotoUrl || '');
  const [avatarSourceFile, setAvatarSourceFile] = useState<File | null>(null);
  const [coverSourceFile, setCoverSourceFile] = useState<File | null>(null);
  const [cropDialog, setCropDialog] = useState<{ mode: 'avatar' | 'cover'; file: File } | null>(null);
  const [avatarResolution, setAvatarResolution] = useState<{ width: number; height: number } | null>(null);
  const [coverResolution, setCoverResolution] = useState<{ width: number; height: number } | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStageLabel, setUploadStageLabel] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Close-up photo lightbox viewer
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  // Direct message state (when a teacher visits another teacher's profile)
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBioDraft(profileTeacher.bio || '');
    setWhatsappDraft(profileTeacher.whatsapp || '');
    setInstagramDraft(profileTeacher.instagram || '');
    setAvatarDraft(profileTeacher.avatarPhotoUrl || '');
    setCoverDraft(profileTeacher.coverPhotoUrl || '');
    setAvatarSourceFile(null);
    setCoverSourceFile(null);
    setCropDialog(null);
    setAvatarResolution(null);
    setCoverResolution(null);
    setEditing(false);
    setProfileMsg(null);
    setMessageError(null);
    setLightboxPhoto(null);
  }, [
    profileTeacher.id,
    profileTeacher.bio,
    profileTeacher.whatsapp,
    profileTeacher.instagram,
    profileTeacher.avatarPhotoUrl,
    profileTeacher.coverPhotoUrl,
  ]);

  const threadId = useMemo(() => {
    if (!viewerTeacher) return '';
    return buildMessageThreadId(viewerTeacher.id, profileTeacher.id);
  }, [viewerTeacher, profileTeacher.id]);

  const threadMessages = useMemo(() => {
    if (isAdminViewer || isOwnProfile || !threadId) return [];
    return messages.filter((m) => m.threadId === threadId);
  }, [isAdminViewer, isOwnProfile, messages, threadId]);

  useEffect(() => {
    if (isAdminViewer || isOwnProfile || !viewerTeacher || threadMessages.length === 0) return;
    const hasUnread = threadMessages.some(
      (m) => m.recipientId === viewerTeacher.id && !m.isRead
    );
    if (hasUnread) {
      markThreadMessagesRead(threadMessages, viewerTeacher.id).catch(() => undefined);
    }
  }, [isAdminViewer, isOwnProfile, threadMessages, viewerTeacher]);

  useEffect(() => {
    if (!isAdminViewer && !isOwnProfile && threadMessages.length > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isAdminViewer, isOwnProfile, threadMessages.length]);

  const holidaysForSchool = useMemo(
    () => schoolHolidays.filter((h) => h.schoolId === profileTeacher.schoolId),
    [schoolHolidays, profileTeacher.schoolId]
  );

  const todayWeekdayKey = useMemo(() => getDayOfWeekKey(getTodayDateString()), []);

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileMsg(null);
    setAvatarSourceFile(file);
    setCropDialog({ mode: 'avatar', file });
  }

  function handleCoverSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileMsg(null);
    setCoverSourceFile(file);
    setCropDialog({ mode: 'cover', file });
  }

  function handleCropConfirmed(result: CroppedPhotoResult) {
    if (!cropDialog) return;
    if (cropDialog.mode === 'avatar') {
      setAvatarDraft(result.dataUrl);
      setAvatarResolution({ width: result.width, height: result.height });
    } else {
      setCoverDraft(result.dataUrl);
      setCoverResolution({ width: result.width, height: result.height });
    }
    setCropDialog(null);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    if (!viewerTeacher || profileBusy) return;

    const uploadingAvatar = avatarDraft !== (profileTeacher.avatarPhotoUrl || '') && Boolean(avatarDraft);
    const uploadingCover = coverDraft !== (profileTeacher.coverPhotoUrl || '') && Boolean(coverDraft);

    setProfileBusy(true);
    setProfileMsg(null);
    setUploadProgress(18);
    setUploadStageLabel(
      uploadingAvatar && uploadingCover
        ? 'Sedang mengunggah foto profil & foto sampul...'
        : uploadingAvatar
          ? 'Sedang mengunggah pembaruan foto profil...'
          : uploadingCover
            ? 'Sedang mengunggah pembaruan foto sampul...'
            : 'Sedang memperbarui data profil...'
    );

    const progressTimer = window.setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        const step = prev < 55 ? 14 : prev < 78 ? 7 : 3;
        return Math.min(90, prev + step);
      });
    }, 220);

    try {
      await customizeTeacherProfile(viewerTeacher, {
        bio: bioDraft,
        whatsapp: whatsappDraft,
        instagram: instagramDraft,
        avatarPhotoUrl: avatarDraft,
        coverPhotoUrl: coverDraft,
      });
      window.clearInterval(progressTimer);
      setUploadProgress(100);
      setUploadStageLabel('Pembaruan profil selesai diunggah.');
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      setEditing(false);
      setAvatarResolution(null);
      setCoverResolution(null);
      setProfileMsg({
        type: 'ok',
        text: 'Foto profil, sampul, bio, serta tautan WhatsApp & Instagram berhasil diperbarui.',
      });
      playChime('step_ok');
      speakVoice('Pembaruan profil Anda berhasil disimpan.');
    } catch (err) {
      window.clearInterval(progressTimer);
      setProfileMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengunggah perubahan profil.',
      });
      playChime('error');
    } finally {
      window.clearInterval(progressTimer);
      setProfileBusy(false);
      setUploadProgress(0);
      setUploadStageLabel('');
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    if (!viewerTeacher || !messageBody.trim() || sendingMessage || isOwnProfile || isAdminViewer) {
      return;
    }
    setSendingMessage(true);
    setMessageError(null);
    try {
      await sendTeacherMessage({
        sender: viewerTeacher,
        recipient: profileTeacher,
        body: messageBody,
      });
      setMessageBody('');
      playChime('step_ok');
      speakVoice(`Pesan untuk ${profileTeacher.fullName} berhasil dikirim.`);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
      playChime('error');
    } finally {
      setSendingMessage(false);
    }
  }

  const displayedCover = editing ? coverDraft : profileTeacher.coverPhotoUrl;
  const displayedAvatar = editing ? avatarDraft : profileTeacher.avatarPhotoUrl;
  const displayedWhatsapp = editing ? whatsappDraft : profileTeacher.whatsapp;
  const displayedInstagram = editing ? instagramDraft : profileTeacher.instagram;
  const waHref = buildWhatsAppHref(displayedWhatsapp);
  const igHref = buildInstagramHref(displayedInstagram);
  const avatarChanged = avatarDraft !== (profileTeacher.avatarPhotoUrl || '');
  const coverChanged = coverDraft !== (profileTeacher.coverPhotoUrl || '');

  function openPhotoCloseUp(url: string, label: string) {
    if (!url) return;
    setLightboxPhoto({
      url,
      title: `${label} — ${profileTeacher.fullName}`,
      subtitle: `${profileTeacher.roleTitle} · ${profileTeacher.schoolName}`,
    });
  }

  return (
    <div className="space-y-6">
      {onBack && (
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {backLabel ||
                (isAdminViewer ? 'Kembali ke Daftar Guru' : 'Kembali ke Daftar Rekan Guru')}
            </span>
          </button>
        </div>
      )}

      {/* Cover Photo + Avatar + Identity + Bio Card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="relative h-44 sm:h-52 bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 overflow-hidden group">
          {displayedCover ? (
            <button
              type="button"
              onClick={() =>
                openPhotoCloseUp(
                  displayedCover,
                  editing && coverChanged ? 'Pratinjau Foto Sampul' : 'Foto Sampul'
                )
              }
              className="w-full h-full block relative cursor-pointer text-left"
              aria-label={`Lihat foto sampul ${profileTeacher.fullName} lebih dekat`}
            >
              <img
                src={displayedCover}
                alt={`Foto sampul ${profileTeacher.fullName}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/65 text-white text-[11px] font-medium opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity backdrop-blur-xs">
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lihat Sampul Dekat</span>
              </span>
            </button>
          ) : (
            <div className="w-full h-full flex items-end justify-end p-5">
              <p className="text-xs text-emerald-100/80 font-medium">
                {profileTeacher.schoolName} · {settings.districtName}
              </p>
            </div>
          )}

          {profileBusy && coverChanged && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-20 bg-slate-950/60 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-white px-4 text-center"
            >
              <Loader2 className="w-6 h-6 animate-spin text-emerald-300" aria-hidden="true" />
              <span className="text-xs font-medium">
                {`Mengunggah foto sampul... ${uploadProgress}%`}
              </span>
            </div>
          )}

          {isOwnProfile && editing && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
              <label
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-white/95 hover:bg-white rounded-lg shadow-xs ${
                  profileBusy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{coverDraft ? 'Ganti Sampul' : 'Unggah Sampul'}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={profileBusy}
                  onChange={handleCoverSelect}
                  className="hidden"
                />
              </label>
              {coverDraft && (
                <button
                  type="button"
                  disabled={profileBusy}
                  onClick={() => {
                    setCoverDraft('');
                    setCoverSourceFile(null);
                    setCoverResolution(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-white/95 hover:bg-white rounded-lg shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Hapus</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-10 sm:-mt-12 relative z-10">
            <div className="flex items-end gap-4">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-white bg-emerald-50 text-emerald-900 font-display font-bold text-2xl flex items-center justify-center overflow-hidden shadow-md shrink-0 group/avatar">
                {displayedAvatar ? (
                  <button
                    type="button"
                    onClick={() =>
                      openPhotoCloseUp(
                        displayedAvatar,
                        editing && avatarChanged ? 'Pratinjau Foto Profil' : 'Foto Profil'
                      )
                    }
                    className="w-full h-full relative cursor-pointer"
                    aria-label={`Lihat foto profil ${profileTeacher.fullName} lebih dekat`}
                    title="Klik untuk melihat foto profil secara dekat"
                  >
                    <img
                      src={displayedAvatar}
                      alt={`Foto profil ${profileTeacher.fullName}`}
                      className="w-full h-full object-cover"
                    />
                    {!editing && (
                      <span className="absolute inset-0 bg-slate-950/35 text-white flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                        <ZoomIn className="w-5 h-5" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                ) : (
                  <span>{getInitials(profileTeacher.fullName)}</span>
                )}

                {profileBusy && (avatarChanged || Boolean(avatarDraft)) && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="absolute inset-0 z-20 bg-slate-950/65 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1 text-white text-center px-1"
                  >
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-300" aria-hidden="true" />
                    <span className="text-[10px] font-medium leading-tight">
                      {`${uploadProgress}%`}
                    </span>
                  </div>
                )}

                {isOwnProfile && editing && (
                  <label
                    className={`absolute bottom-0 inset-x-0 py-1 bg-slate-950/65 text-white flex items-center justify-center gap-1 text-[10px] font-medium hover:bg-slate-950/80 ${
                      profileBusy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                    }`}
                    title="Pilih & potong foto profil baru"
                  >
                    <Camera className="w-3 h-3" aria-hidden="true" />
                    <span>Ubah</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={profileBusy}
                      onChange={handleAvatarSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="pt-12 sm:pt-0 pb-1">
                <h1 className="font-display text-xl font-bold text-slate-900">
                  {profileTeacher.fullName}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  {profileTeacher.roleTitle} · {profileTeacher.schoolName} · @{profileTeacher.username}
                </p>
                {(waHref || igHref) && (
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    {waHref && (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Buka WhatsApp ${profileTeacher.fullName} (${formatWhatsAppDisplay(displayedWhatsapp)})`}
                        aria-label={`Buka profil WhatsApp ${profileTeacher.fullName}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#25D366]/15 text-[#0f7a38] border border-[#25D366]/45 hover:bg-[#25D366] hover:text-white transition-colors"
                      >
                        <WhatsAppLogoIcon className="w-4 h-4 shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {igHref && (
                      <a
                        href={igHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Buka Instagram ${formatInstagramDisplay(displayedInstagram)}`}
                        aria-label={`Buka profil Instagram ${profileTeacher.fullName}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-fuchsia-50 via-rose-50 to-amber-50 text-rose-700 border border-rose-300/80 hover:from-fuchsia-600 hover:via-rose-600 hover:to-amber-500 hover:text-white hover:border-transparent transition-all"
                      >
                        <InstagramLogoIcon className="w-4 h-4 shrink-0" />
                        <span>{formatInstagramDisplay(displayedInstagram)}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!editing && displayedAvatar && (
                <button
                  type="button"
                  onClick={() => openPhotoCloseUp(displayedAvatar, 'Foto Profil')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Lihat Foto Dekat</span>
                </button>
              )}

              {isOwnProfile ? (
                !editing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMsg(null);
                      setEditing(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Kustomisasi Profil</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={profileBusy}
                    onClick={() => {
                      setEditing(false);
                      setBioDraft(profileTeacher.bio || '');
                      setWhatsappDraft(profileTeacher.whatsapp || '');
                      setInstagramDraft(profileTeacher.instagram || '');
                      setAvatarDraft(profileTeacher.avatarPhotoUrl || '');
                      setCoverDraft(profileTeacher.coverPhotoUrl || '');
                      setAvatarResolution(null);
                      setCoverResolution(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-60 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Batal Edit</span>
                  </button>
                )
              ) : isAdminViewer ? (
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                    profileTeacher.status === 'aktif'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  Akun {profileTeacher.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                </span>
              ) : (
                onOpenFullChat && (
                  <button
                    type="button"
                    onClick={() => onOpenFullChat(profileTeacher)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Buka di Menu Pesan</span>
                  </button>
                )
              )}
            </div>
          </div>

          {profileBusy && (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/90 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-800 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold text-emerald-950 truncate">
                    {uploadStageLabel || 'Sedang mengunggah pembaruan profil...'}
                  </span>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-900 tabular-nums shrink-0">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-emerald-200/80 overflow-hidden">
                <div
                  className="h-full bg-emerald-800 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {profileMsg && (
            <div
              role="status"
              className={`mt-4 px-4 py-3 rounded-lg border text-xs flex items-center justify-between ${
                profileMsg.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{profileMsg.text}</span>
              <button
                type="button"
                onClick={() => setProfileMsg(null)}
                className="font-medium underline ml-4 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Profile Editor Form OR Displayed Bio */}
          {isOwnProfile && editing ? (
            <form
              onSubmit={handleSaveProfile}
              className="mt-5 pt-5 border-t border-slate-200 space-y-5"
            >
              {/* Live Preview Box before saving */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/70 via-white to-amber-50/40 border border-emerald-200/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold text-slate-900">
                      Pratinjau &amp; Potong Foto Sebelum Disimpan
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Foto dipotong agar pas dengan kotak profil/sampul, lalu klik Simpan &amp; Unggah Profil.
                    </p>
                  </div>
                  {(avatarChanged || coverChanged) && (
                    <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                      Foto siap diunggah
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Avatar Preview Card */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex items-center gap-4">
                    <div className="relative w-20 h-20 rounded-xl border border-slate-200 bg-emerald-50 text-emerald-900 font-display font-bold text-xl flex items-center justify-center overflow-hidden shrink-0">
                      {avatarDraft ? (
                        <img
                          src={avatarDraft}
                          alt="Pratinjau foto profil"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{getInitials(profileTeacher.fullName)}</span>
                      )}
                      {profileBusy && avatarChanged && (
                        <div className="absolute inset-0 bg-slate-950/65 flex flex-col items-center justify-center gap-1 text-white">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-300" aria-hidden="true" />
                          <span className="text-[10px] font-medium">{uploadProgress}%</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Foto Profil (Kotak 1:1)</p>
                        <p className="text-[11px] text-slate-500">
                          {profileBusy && avatarChanged
                            ? `Sedang mengunggah pembaruan (${uploadProgress}%)...`
                            : avatarDraft
                              ? avatarChanged
                                ? avatarResolution
                                  ? `Pas kotak (${avatarResolution.width}×${avatarResolution.height} px)`
                                  : 'Foto baru siap diunggah'
                                : 'Menggunakan foto saat ini'
                              : 'Belum ada foto (tampil inisial)'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md ${
                            profileBusy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                          }`}
                        >
                          <Camera className="w-3 h-3" aria-hidden="true" />
                          <span>{avatarDraft ? 'Pilih & Potong' : 'Pilih Foto'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={profileBusy}
                            onChange={handleAvatarSelect}
                            className="hidden"
                          />
                        </label>
                        {avatarSourceFile && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => setCropDialog({ mode: 'avatar', file: avatarSourceFile })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md disabled:opacity-60 cursor-pointer"
                          >
                            <Crop className="w-3 h-3" aria-hidden="true" />
                            <span>Potong Ulang</span>
                          </button>
                        )}
                        {avatarDraft && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => openPhotoCloseUp(avatarDraft, 'Pratinjau Foto Profil')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md disabled:opacity-60 cursor-pointer"
                          >
                            <ZoomIn className="w-3 h-3" aria-hidden="true" />
                            <span>Lihat Dekat</span>
                          </button>
                        )}
                        {avatarChanged && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => {
                              setAvatarDraft(profileTeacher.avatarPhotoUrl || '');
                              setAvatarSourceFile(null);
                              setAvatarResolution(null);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded-md disabled:opacity-60 cursor-pointer"
                            title="Kembalikan ke foto sebelumnya"
                          >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            <span>Batal</span>
                          </button>
                        )}
                        {avatarDraft && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => {
                              setAvatarDraft('');
                              setAvatarSourceFile(null);
                              setAvatarResolution(null);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 rounded-md disabled:opacity-60 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cover Photo Preview Card */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex items-center gap-4">
                    <div className="relative w-28 h-20 rounded-xl border border-slate-200 bg-gradient-to-br from-emerald-900 to-slate-900 overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-emerald-100">
                      {coverDraft ? (
                        <img
                          src={coverDraft}
                          alt="Pratinjau foto sampul"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>Bawaan</span>
                      )}
                      {profileBusy && coverChanged && (
                        <div className="absolute inset-0 bg-slate-950/65 flex flex-col items-center justify-center gap-1 text-white">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-300" aria-hidden="true" />
                          <span className="text-[10px] font-medium">{uploadProgress}%</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">Foto Sampul (Lebar 3:1)</p>
                        <p className="text-[11px] text-slate-500">
                          {profileBusy && coverChanged
                            ? `Sedang mengunggah pembaruan (${uploadProgress}%)...`
                            : coverDraft
                              ? coverChanged
                                ? coverResolution
                                  ? `Pas kotak (${coverResolution.width}×${coverResolution.height} px)`
                                  : 'Sampul baru siap diunggah'
                                : 'Menggunakan sampul saat ini'
                              : 'Menggunakan sampul hijau bawaan'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md ${
                            profileBusy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                          }`}
                        >
                          <ImageIcon className="w-3 h-3" aria-hidden="true" />
                          <span>{coverDraft ? 'Pilih & Potong' : 'Pilih Sampul'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={profileBusy}
                            onChange={handleCoverSelect}
                            className="hidden"
                          />
                        </label>
                        {coverSourceFile && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => setCropDialog({ mode: 'cover', file: coverSourceFile })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md disabled:opacity-60 cursor-pointer"
                          >
                            <Crop className="w-3 h-3" aria-hidden="true" />
                            <span>Potong Ulang</span>
                          </button>
                        )}
                        {coverDraft && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => openPhotoCloseUp(coverDraft, 'Pratinjau Foto Sampul')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md disabled:opacity-60 cursor-pointer"
                          >
                            <ZoomIn className="w-3 h-3" aria-hidden="true" />
                            <span>Lihat Dekat</span>
                          </button>
                        )}
                        {coverChanged && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => {
                              setCoverDraft(profileTeacher.coverPhotoUrl || '');
                              setCoverSourceFile(null);
                              setCoverResolution(null);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded-md disabled:opacity-60 cursor-pointer"
                            title="Kembalikan ke sampul sebelumnya"
                          >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            <span>Batal</span>
                          </button>
                        )}
                        {coverDraft && (
                          <button
                            type="button"
                            disabled={profileBusy}
                            onClick={() => {
                              setCoverDraft('');
                              setCoverSourceFile(null);
                              setCoverResolution(null);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 rounded-md disabled:opacity-60 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="profile-bio" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Bio Profil Guru
                </label>
                <textarea
                  id="profile-bio"
                  rows={3}
                  maxLength={FIELD_LIMITS.bioMax}
                  disabled={profileBusy}
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  placeholder="Tuliskan motto mengajar, bidang keahlian, atau catatan singkat tentang Anda..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700 resize-none disabled:opacity-60"
                />
                <p className="text-[11px] text-slate-400 mt-1 text-right tabular-nums">
                  {bioDraft.length}/{FIELD_LIMITS.bioMax}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-whatsapp"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#25D366]/15 text-[#0f7a38]">
                      <WhatsAppLogoIcon className="w-3.5 h-3.5" />
                    </span>
                    <span>Nomor WhatsApp (WA)</span>
                  </label>
                  <input
                    id="profile-whatsapp"
                    type="tel"
                    inputMode="tel"
                    maxLength={FIELD_LIMITS.whatsappMax}
                    disabled={profileBusy}
                    value={whatsappDraft}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/[^0-9+\-\s]/g, '');
                      setWhatsappDraft(sanitized);
                    }}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700 disabled:opacity-60 font-mono"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500">
                      Logo WA langsung muncul di profil setelah diisi.
                    </span>
                    {buildWhatsAppHref(whatsappDraft) && (
                      <a
                        href={buildWhatsAppHref(whatsappDraft) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[#0f7a38] hover:underline shrink-0"
                      >
                        <WhatsAppLogoIcon className="w-3.5 h-3.5" />
                        <span>Tes Buka WA</span>
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="profile-instagram"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gradient-to-tr from-amber-100 via-rose-100 to-fuchsia-100 text-rose-700">
                      <InstagramLogoIcon className="w-3.5 h-3.5" />
                    </span>
                    <span>Username Instagram (IG)</span>
                  </label>
                  <input
                    id="profile-instagram"
                    type="text"
                    maxLength={120}
                    disabled={profileBusy}
                    value={instagramDraft}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.toLowerCase().includes('instagram.com/')) {
                        setInstagramDraft(normalizeInstagramInput(val));
                      } else {
                        setInstagramDraft(val.replace(/[^a-zA-Z0-9._@]/g, '').slice(0, FIELD_LIMITS.instagramMax + 1));
                      }
                    }}
                    placeholder="Contoh: guru_pasbar (tanpa @ atau dengan @)"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700 disabled:opacity-60"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-500">
                      Logo IG langsung muncul di profil setelah diisi.
                    </span>
                    {buildInstagramHref(instagramDraft) && (
                      <a
                        href={buildInstagramHref(instagramDraft) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline shrink-0"
                      >
                        <InstagramLogoIcon className="w-3.5 h-3.5" />
                        <span>{formatInstagramDisplay(instagramDraft)}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {profileBusy && (
                  <span className="text-xs font-medium text-emerald-800 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Mengunggah pembaruan ({uploadProgress}%)...</span>
                  </span>
                )}
                <button
                  type="submit"
                  disabled={profileBusy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {profileBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>
                    {profileBusy
                      ? `Mengunggah Pembaruan (${uploadProgress}%)...`
                      : 'Simpan & Unggah Profil'}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-8">
                <p className="text-xs font-medium text-slate-500">Bio Guru</p>
                <p className="text-sm text-slate-800 mt-1 leading-relaxed whitespace-pre-line">
                  {profileTeacher.bio
                    ? profileTeacher.bio
                    : isOwnProfile
                    ? 'Anda belum menambahkan bio. Klik Kustomisasi Profil untuk mengisi bio, foto profil, dan foto sampul.'
                    : 'Guru ini belum menuliskan bio.'}
                </p>
              </div>
              <div className="md:col-span-4 space-y-1.5 text-xs text-slate-600">
                <p>
                  <span className="text-slate-400">Status Kepegawaian:</span>{' '}
                  <strong className="text-slate-900 font-medium">{profileTeacher.employmentType}</strong>
                </p>
                <p>
                  <span className="text-slate-400">NIP:</span>{' '}
                  <span className="font-mono tabular-nums text-slate-900">{profileTeacher.nip || '-'}</span>
                </p>
                <p>
                  <span className="text-slate-400">Wilayah:</span>{' '}
                  <span className="text-slate-900">{settings.districtName}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Direct Message Composer & Thread on Visited Colleague's Profile */}
      {!isAdminViewer && !isOwnProfile && viewerTeacher && (
        <div className="bg-white border border-sky-200/80 rounded-xl overflow-hidden shadow-xs">
          <div className="p-5 border-b border-sky-100 bg-gradient-to-r from-sky-50 via-teal-50/50 to-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Kirim Pesan ke {profileTeacher.fullName}
                </h2>
                <p className="text-xs text-slate-500">
                  Pesan langsung antar guru di {settings.districtName}
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 bg-slate-50/70 max-h-72 overflow-y-auto space-y-3">
            {threadMessages.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6">
                Belum ada percakapan dengan {profileTeacher.fullName}. Mulailah mengirim pesan di bawah.
              </p>
            ) : (
              threadMessages.map((m) => {
                const mine = m.senderId === viewerTeacher.id;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                        mine
                          ? 'bg-emerald-800 text-white'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p
                        className={`text-[10px] mt-1 ${
                          mine ? 'text-emerald-200' : 'text-slate-400'
                        }`}
                      >
                        {mine ? 'Anda' : m.senderName}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={threadEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white space-y-2">
            {messageError && <p className="text-xs text-rose-700">{messageError}</p>}
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                maxLength={FIELD_LIMITS.messageBodyMax}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={`Tulis pesan untuk ${profileTeacher.fullName}...`}
                className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
              <button
                type="submit"
                disabled={sendingMessage || !messageBody.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{sendingMessage ? 'Mengirim...' : 'Kirim Pesan'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* School Schedule (Senin–Sabtu) & School Holidays Info */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-emerald-200/70 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Jadwal Sekolah {profileTeacher.schoolName} (Senin – Sabtu)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-medium">
                  <th className="py-2.5 px-4">Hari</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Jam Masuk</th>
                  <th className="py-2.5 px-4 text-right">Jam Pulang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {WEEKDAY_ORDER.map(({ key, label }) => {
                  const day = school?.weeklySchedule?.[key] ?? DEFAULT_WEEKLY_SCHEDULE[key];
                  const isTodayRow = todayWeekdayKey === key;
                  return (
                    <tr key={key} className={isTodayRow ? 'bg-emerald-50/60' : undefined}>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {label}
                        {isTodayRow && (
                          <span className="ml-1.5 text-[10px] font-semibold text-emerald-800">
                            (Hari Ini)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={day.enabled ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                          {day.enabled ? 'Aktif' : 'Libur'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {day.enabled ? day.checkInStart : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {day.enabled ? day.checkOutStart : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-amber-200/70 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 via-orange-50/40 to-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <CalendarOff className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Hari Cuti / Libur {profileTeacher.schoolName}
            </h2>
          </div>
          <div className="p-4">
            {holidaysForSchool.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                <SchoolIcon className="w-5 h-5 text-amber-300 mx-auto mb-2" aria-hidden="true" />
                <p>Belum ada tanggal cuti/libur khusus yang ditetapkan untuk sekolah ini.</p>
              </div>
            ) : (
              <ul className="divide-y divide-amber-100/70 text-xs">
                {holidaysForSchool.map((h) => (
                  <li key={h.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{formatIndonesianDate(h.date)}</p>
                      <p className="text-slate-600 mt-0.5">{h.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Photo Cropper Modal */}
      <PhotoCropModal
        isOpen={Boolean(cropDialog)}
        file={cropDialog?.file ?? null}
        mode={cropDialog?.mode ?? 'avatar'}
        maxBytesLength={
          cropDialog?.mode === 'cover'
            ? FIELD_LIMITS.coverPhotoMax - 5000
            : FIELD_LIMITS.avatarPhotoMax - 5000
        }
        onCancel={() => setCropDialog(null)}
        onConfirm={handleCropConfirmed}
      />

      {/* Close-up Photo Lightbox Modal */}
      <PhotoLightboxModal
        isOpen={Boolean(lightboxPhoto)}
        imageUrl={lightboxPhoto?.url || ''}
        title={lightboxPhoto?.title || ''}
        subtitle={lightboxPhoto?.subtitle}
        onClose={() => setLightboxPhoto(null)}
      />
    </div>
  );
}
