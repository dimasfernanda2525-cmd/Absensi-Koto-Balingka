import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { playChime, speakVoice, unlockVoiceAudio } from '../lib/voiceGuide';
import { authenticateWithUsernameAndPin } from '../services/attendanceService';
import { DistrictSettings, SessionAccount } from '../types/attendance';

interface AdminLoginScreenProps {
  districtSettings: DistrictSettings;
  onAdminLogin: (session: SessionAccount) => void;
  onBackToTeacherPortal: () => void;
}

export function AdminLoginScreen({
  districtSettings,
  onAdminLogin,
  onBackToTeacherPortal,
}: AdminLoginScreenProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emblemFailed, setEmblemFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    unlockVoiceAudio();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await authenticateWithUsernameAndPin(username, pin, 'admin');
      onAdminLogin(res.session);
      playChime('step_ok');
      speakVoice(
        `Selamat datang, ${res.session.displayName}. Konsol administrator siap digunakan.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke Konsol Administrator.');
      playChime('error');
      speakVoice('Maaf, username atau PIN administrator belum sesuai.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white border-b-2 border-amber-400/80 px-4 md:px-8 h-16 flex items-center justify-between gap-8 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {!emblemFailed ? (
            <img
              src="/assets/aistudio/Lambang-Kabupaten-Pasaman-Barat-Sumatera-Barat_128__1__77a567ea.png"
              alt="Lambang Kabupaten Pasaman Barat"
              onError={() => setEmblemFailed(true)}
              className="h-10 w-auto object-contain shrink-0 drop-shadow-xs"
            />
          ) : (
            <ShieldCheck className="w-6 h-6 text-amber-300 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <span className="font-display text-base font-bold text-white whitespace-nowrap block leading-tight">
              Konsol Administrator
            </span>
            <span className="text-[11px] text-amber-200/90 hidden sm:block truncate">
              {districtSettings.districtName}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToTeacherPortal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Kembali ke Portal Guru</span>
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md bg-white border border-emerald-200/80 rounded-2xl overflow-hidden shadow-md">
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-800 px-8 py-6 text-white">
            <p className="text-xs font-medium text-amber-300">{districtSettings.districtName}</p>
            <h1 className="font-display text-2xl font-bold text-white mt-1">
              Masuk Administrator
            </h1>
            <p className="text-xs text-emerald-100 mt-1.5 leading-relaxed">
              Khusus pengelola kecamatan untuk mendaftarkan Username &amp; PIN guru, mengatur jadwal
              sekolah, memantau kehadiran, dan mencetak rekap bulanan.
            </p>
          </div>

          <div className="p-8 bg-gradient-to-b from-emerald-50/35 via-white to-amber-50/20">
            {errorMsg && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 leading-relaxed"
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="admin-username" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Username Administrator
                </label>
                <input
                  id="admin-username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="admin"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label htmlFor="admin-pin" className="block text-xs font-medium text-slate-700 mb-1.5">
                  PIN Administrator (6 Digit)
                </label>
                <div className="relative">
                  <input
                    id="admin-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoComplete="current-password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm font-mono tracking-widest bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
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
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-emerald-800 to-teal-700 hover:from-emerald-900 hover:to-teal-800 disabled:opacity-60 text-white text-sm font-semibold transition-all cursor-pointer shadow-xs"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>{loading ? 'Memverifikasi...' : 'Masuk Konsol Admin'}</span>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
