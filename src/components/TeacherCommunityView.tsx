import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Search, Send, User, ZoomIn } from 'lucide-react';
import { getInitials } from '../lib/dateUtils';
import { playChime, speakVoice, unlockVoiceAudio } from '../lib/voiceGuide';
import {
  buildInstagramHref,
  buildWhatsAppHref,
  formatInstagramDisplay,
  formatWhatsAppDisplay,
  InstagramLogoIcon,
  WhatsAppLogoIcon,
} from '../lib/socialLinks';
import {
  buildMessageThreadId,
  markThreadMessagesRead,
  sendTeacherMessage,
} from '../services/attendanceService';
import {
  DistrictSettings,
  FIELD_LIMITS,
  School,
  SchoolHoliday,
  Teacher,
  TeacherMessage,
} from '../types/attendance';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { TeacherProfileView } from './TeacherProfileView';

interface TeacherCommunityViewProps {
  mode: 'rekan' | 'pesan';
  viewerTeacher: Teacher;
  teachers: Teacher[];
  schools: School[];
  settings: DistrictSettings;
  schoolHolidays: SchoolHoliday[];
  messages: TeacherMessage[];
  selectedColleagueId: string | null;
  onSelectColleagueId: (id: string | null) => void;
  onOpenChatWithColleague: (colleague: Teacher) => void;
  onVisitColleagueProfile: (colleague: Teacher) => void;
}

export function TeacherCommunityView({
  mode,
  viewerTeacher,
  teachers,
  schools,
  settings,
  schoolHolidays,
  messages,
  selectedColleagueId,
  onSelectColleagueId,
  onOpenChatWithColleague,
  onVisitColleagueProfile,
}: TeacherCommunityViewProps) {
  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('semua');
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const otherActiveTeachers = useMemo(
    () => teachers.filter((t) => t.status === 'aktif' && t.id !== viewerTeacher.id),
    [teachers, viewerTeacher.id]
  );

  const selectedColleague = useMemo(
    () => otherActiveTeachers.find((t) => t.id === selectedColleagueId) ?? null,
    [otherActiveTeachers, selectedColleagueId]
  );

  const schoolMap = useMemo(() => {
    const map = new Map<string, School>();
    for (const s of schools) map.set(s.id, s);
    return map;
  }, [schools]);

  // Precompute unread count & latest message per colleague
  const threadSummaryByColleague = useMemo(() => {
    const summary = new Map<string, { lastBody: string; unread: number; order: number }>();
    messages.forEach((m, index) => {
      const partnerId = m.senderId === viewerTeacher.id ? m.recipientId : m.senderId;
      const prev = summary.get(partnerId) ?? { lastBody: '', unread: 0, order: -1 };
      const isUnread = m.recipientId === viewerTeacher.id && !m.isRead ? 1 : 0;
      summary.set(partnerId, {
        lastBody: m.body,
        unread: prev.unread + isUnread,
        order: index,
      });
    });
    return summary;
  }, [messages, viewerTeacher.id]);

  // Sorted colleague list for Pesan inbox (colleagues with messages/unread first)
  const inboxColleagues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...otherActiveTeachers]
      .filter(
        (t) =>
          !q ||
          t.fullName.toLowerCase().includes(q) ||
          t.schoolName.toLowerCase().includes(q) ||
          t.username.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const sa = threadSummaryByColleague.get(a.id);
        const sb = threadSummaryByColleague.get(b.id);
        if ((sb?.unread ?? 0) !== (sa?.unread ?? 0)) {
          return (sb?.unread ?? 0) - (sa?.unread ?? 0);
        }
        if ((sb?.order ?? -1) !== (sa?.order ?? -1)) {
          return (sb?.order ?? -1) - (sa?.order ?? -1);
        }
        return a.fullName.localeCompare(b.fullName, 'id');
      });
  }, [otherActiveTeachers, search, threadSummaryByColleague]);

  // Auto-select first colleague when opening Pesan tab without active target
  useEffect(() => {
    if (mode === 'pesan' && !selectedColleague && inboxColleagues.length > 0) {
      onSelectColleagueId(inboxColleagues[0].id);
    }
  }, [mode, selectedColleague, inboxColleagues, onSelectColleagueId]);

  const activeThreadMessages = useMemo(() => {
    if (!selectedColleague) return [];
    const tid = buildMessageThreadId(viewerTeacher.id, selectedColleague.id);
    return messages.filter((m) => m.threadId === tid);
  }, [selectedColleague, viewerTeacher.id, messages]);

  useEffect(() => {
    if (mode !== 'pesan' || !selectedColleague || activeThreadMessages.length === 0) return;
    const hasUnread = activeThreadMessages.some(
      (m) => m.recipientId === viewerTeacher.id && !m.isRead
    );
    if (hasUnread) {
      markThreadMessagesRead(activeThreadMessages, viewerTeacher.id).catch(() => undefined);
    }
  }, [mode, selectedColleague, activeThreadMessages, viewerTeacher.id]);

  useEffect(() => {
    if (mode === 'pesan' && activeThreadMessages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [mode, activeThreadMessages.length]);

  const filteredDirectoryTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return otherActiveTeachers.filter((t) => {
      if (schoolFilter !== 'semua' && t.schoolId !== schoolFilter) return false;
      if (!q) return true;
      return (
        t.fullName.toLowerCase().includes(q) ||
        t.schoolName.toLowerCase().includes(q) ||
        t.roleTitle.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q)
      );
    });
  }, [otherActiveTeachers, schoolFilter, search]);

  async function handleSendInInbox(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    if (!selectedColleague || !chatInput.trim() || sending) return;
    setSending(true);
    setChatError(null);
    try {
      await sendTeacherMessage({
        sender: viewerTeacher,
        recipient: selectedColleague,
        body: chatInput,
      });
      setChatInput('');
      playChime('step_ok');
      speakVoice(`Pesan ke ${selectedColleague.fullName} berhasil dikirim.`);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
      playChime('error');
    } finally {
      setSending(false);
    }
  }

  // Visiting a colleague's profile inside "Rekan Guru"
  if (mode === 'rekan' && selectedColleague) {
    return (
      <TeacherProfileView
        profileTeacher={selectedColleague}
        viewerTeacher={viewerTeacher}
        school={schoolMap.get(selectedColleague.schoolId) ?? null}
        settings={settings}
        schoolHolidays={schoolHolidays}
        messages={messages}
        onBack={() => onSelectColleagueId(null)}
        onOpenFullChat={onOpenChatWithColleague}
      />
    );
  }

  const COVER_GRADIENTS = [
    'from-emerald-800 via-teal-700 to-sky-800',
    'from-teal-900 via-emerald-800 to-amber-700',
    'from-sky-900 via-teal-800 to-emerald-800',
    'from-amber-800 via-emerald-800 to-teal-900',
  ];

  if (mode === 'rekan') {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 text-white border border-emerald-800/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
          <div>
            <p className="text-xs font-medium text-amber-300">{settings.districtName}</p>
            <h1 className="font-display text-xl font-bold text-white mt-0.5">
              Rekan Guru &amp; Kunjungi Profil
            </h1>
            <p className="text-xs text-emerald-100 mt-0.5">
              Pilih profil rekan guru untuk melihat bio, jadwal sekolah, atau mengirim pesan langsung.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative">
              <Search
                className="w-4 h-4 text-emerald-700 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama guru atau sekolah..."
                className="pl-9 pr-3 py-2 text-xs bg-white border border-emerald-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-400 w-full sm:w-56"
              />
            </div>
            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              aria-label="Filter sekolah rekan guru"
              className="px-3 py-2 text-xs bg-white border border-emerald-200 rounded-lg text-slate-800 font-medium"
            >
              <option value="semua">Semua Sekolah ({schools.length})</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.schoolName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredDirectoryTeachers.length === 0 ? (
          <div className="bg-white border border-emerald-200/70 rounded-xl p-10 text-center text-xs text-slate-500">
            Belum ada rekan guru lain yang cocok dengan filter pencarian saat ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDirectoryTeachers.map((colleague, index) => {
              const summary = threadSummaryByColleague.get(colleague.id);
              const fallbackGradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
              return (
                <div
                  key={colleague.id}
                  className="bg-white border border-emerald-200/80 rounded-2xl overflow-hidden flex flex-col justify-between shadow-xs hover:border-emerald-400 transition-colors"
                >
                  <div>
                    <div
                      className={`h-22 bg-gradient-to-br ${fallbackGradient} overflow-hidden relative group/cov`}
                    >
                      {colleague.coverPhotoUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxPhoto({
                              url: colleague.coverPhotoUrl,
                              title: `Foto Sampul — ${colleague.fullName}`,
                              subtitle: `${colleague.roleTitle} · ${colleague.schoolName}`,
                            })
                          }
                          className="w-full h-full block relative cursor-pointer"
                          aria-label={`Lihat foto sampul ${colleague.fullName} lebih dekat`}
                        >
                          <img
                            src={colleague.coverPhotoUrl}
                            alt={`Sampul ${colleague.fullName}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute inset-0 bg-slate-950/30 text-white flex items-center justify-center opacity-0 group-hover/cov:opacity-100 transition-opacity">
                            <ZoomIn className="w-4 h-4" aria-hidden="true" />
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="px-4 pb-4">
                      <div className="-mt-7 flex items-end justify-between gap-2 relative z-10">
                        <div className="w-14 h-14 rounded-xl border-2 border-white bg-emerald-50 text-emerald-900 font-display font-bold text-base flex items-center justify-center overflow-hidden shadow-xs group/av">
                          {colleague.avatarPhotoUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxPhoto({
                                  url: colleague.avatarPhotoUrl,
                                  title: `Foto Profil — ${colleague.fullName}`,
                                  subtitle: `${colleague.roleTitle} · ${colleague.schoolName}`,
                                })
                              }
                              className="w-full h-full relative cursor-pointer"
                              aria-label={`Lihat foto profil ${colleague.fullName} lebih dekat`}
                              title="Klik untuk melihat foto lebih dekat"
                            >
                              <img
                                src={colleague.avatarPhotoUrl}
                                alt={colleague.fullName}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute inset-0 bg-slate-950/35 text-white flex items-center justify-center opacity-0 group-hover/av:opacity-100 transition-opacity">
                                <ZoomIn className="w-4 h-4" aria-hidden="true" />
                              </span>
                            </button>
                          ) : (
                            <span>{getInitials(colleague.fullName)}</span>
                          )}
                        </div>
                        {summary && summary.unread > 0 && (
                          <span className="text-[11px] font-semibold text-emerald-800 tabular-nums">
                            {summary.unread} pesan baru
                          </span>
                        )}
                      </div>

                      <h2 className="font-display text-sm font-bold text-slate-900 mt-2.5 truncate">
                        {colleague.fullName}
                      </h2>
                      <p className="text-xs text-emerald-800 font-medium truncate">
                        {colleague.schoolName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {colleague.roleTitle} · @{colleague.username}
                      </p>
                      <p className="text-xs text-slate-600 mt-2.5 line-clamp-2 min-h-[2rem]">
                        {colleague.bio || 'Belum ada bio profil.'}
                      </p>
                      {(buildWhatsAppHref(colleague.whatsapp) || buildInstagramHref(colleague.instagram)) && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          {buildWhatsAppHref(colleague.whatsapp) && (
                            <a
                              href={buildWhatsAppHref(colleague.whatsapp) || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Buka WhatsApp ${colleague.fullName} (${formatWhatsAppDisplay(colleague.whatsapp)})`}
                              aria-label={`Buka WhatsApp ${colleague.fullName}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-[#25D366]/15 text-[#0f7a38] border border-[#25D366]/40 hover:bg-[#25D366] hover:text-white transition-colors"
                            >
                              <WhatsAppLogoIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>WA</span>
                            </a>
                          )}
                          {buildInstagramHref(colleague.instagram) && (
                            <a
                              href={buildInstagramHref(colleague.instagram) || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Buka Instagram ${formatInstagramDisplay(colleague.instagram)}`}
                              aria-label={`Buka Instagram ${colleague.fullName}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-gradient-to-r from-fuchsia-50 via-rose-50 to-amber-50 text-rose-700 border border-rose-300/80 hover:from-fuchsia-600 hover:via-rose-600 hover:to-amber-500 hover:text-white hover:border-transparent transition-all"
                            >
                              <InstagramLogoIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>{formatInstagramDisplay(colleague.instagram)}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectColleagueId(colleague.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                    >
                      <User className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Kunjungi Profil</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChatWithColleague(colleague)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                      aria-label={`Kirim pesan ke ${colleague.fullName}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Pesan</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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

  // Mode: 'pesan' (Direct Messages Inbox)
  return (
    <div className="bg-white border border-emerald-200/80 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[540px] shadow-sm">
      {/* Left: Teacher Conversations */}
      <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-emerald-100 flex flex-col">
        <div className="p-4 bg-gradient-to-r from-emerald-900 to-teal-800 text-white space-y-3">
          <h1 className="font-display text-base font-bold text-white">Pesan Antar Guru</h1>
          <div className="relative">
            <Search
              className="w-4 h-4 text-emerald-700 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari rekan guru..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-emerald-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100 overflow-y-auto max-h-[320px] lg:max-h-[480px]">
          {inboxColleagues.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Belum ada rekan guru lain di kecamatan ini.
            </div>
          ) : (
            inboxColleagues.map((col) => {
              const summary = threadSummaryByColleague.get(col.id);
              const active = selectedColleague?.id === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => onSelectColleagueId(col.id)}
                  className={`w-full p-3.5 text-left flex items-start gap-3 transition-colors cursor-pointer ${
                    active ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold text-xs flex items-center justify-center overflow-hidden shrink-0">
                    {col.avatarPhotoUrl ? (
                      <img
                        src={col.avatarPhotoUrl}
                        alt={col.fullName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{getInitials(col.fullName)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 truncate">{col.fullName}</p>
                      {summary && summary.unread > 0 && (
                        <span className="text-[11px] font-bold text-emerald-800 tabular-nums shrink-0">
                          {summary.unread} baru
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{col.schoolName}</p>
                    <p className="text-xs text-slate-600 truncate mt-1">
                      {summary?.lastBody || 'Ketuk untuk mulai berkirim pesan'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Active Conversation */}
      <div className="lg:col-span-8 flex flex-col justify-between bg-slate-50/60">
        {!selectedColleague ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-slate-500">
            Pilih salah satu rekan guru di daftar sebelah kiri untuk memulai percakapan.
          </div>
        ) : (
          <>
            <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold text-xs flex items-center justify-center overflow-hidden shrink-0">
                  {selectedColleague.avatarPhotoUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxPhoto({
                          url: selectedColleague.avatarPhotoUrl,
                          title: `Foto Profil — ${selectedColleague.fullName}`,
                          subtitle: `${selectedColleague.roleTitle} · ${selectedColleague.schoolName}`,
                        })
                      }
                      className="w-full h-full cursor-pointer"
                      title="Lihat foto lebih dekat"
                    >
                      <img
                        src={selectedColleague.avatarPhotoUrl}
                        alt={selectedColleague.fullName}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <span>{getInitials(selectedColleague.fullName)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {selectedColleague.fullName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {selectedColleague.schoolName} · @{selectedColleague.username}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onVisitColleagueProfile(selectedColleague)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer shrink-0"
              >
                <User className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lihat Profil</span>
              </button>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3 max-h-[380px]">
              {activeThreadMessages.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-10">
                  Belum ada pesan dengan {selectedColleague.fullName}. Tulis pesan pertama Anda di bawah.
                </p>
              ) : (
                activeThreadMessages.map((m) => {
                  const mine = m.senderId === viewerTeacher.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[78%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
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
              <div ref={endRef} />
            </div>

            <form onSubmit={handleSendInInbox} className="p-4 bg-white border-t border-slate-200 space-y-2">
              {chatError && <p className="text-xs text-rose-700">{chatError}</p>}
              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  maxLength={FIELD_LIMITS.messageBodyMax}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Kirim pesan ke ${selectedColleague.fullName}...`}
                  className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="submit"
                  disabled={sending || !chatInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{sending ? 'Mengirim...' : 'Kirim'}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>

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
