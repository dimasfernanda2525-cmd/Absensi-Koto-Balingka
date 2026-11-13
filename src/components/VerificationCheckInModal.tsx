import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  calculateDistanceMeters,
  captureVideoFrameToDataUrl,
  compressImageFileToDataUrl,
  getCurrentGpsPosition,
  GpsPosition,
} from '../lib/geoAndImage';
import {
  isVoiceEnabled,
  playChime,
  setVoiceEnabled as setGlobalVoiceEnabled,
  speakVoice,
  stopAllVoice,
  subscribeVoiceEnabled,
  unlockVoiceAudio,
} from '../lib/voiceGuide';
import { AttendanceVerificationInput } from '../services/attendanceService';
import {
  DistrictSettings,
  FaceStatus,
  LocationStatus,
  School,
  Teacher,
} from '../types/attendance';

interface VerificationCheckInModalProps {
  isOpen: boolean;
  mode: 'checkin' | 'checkout';
  teacher: Teacher;
  school: School | null;
  settings: DistrictSettings;
  onClose: () => void;
  onConfirm: (verification: AttendanceVerificationInput) => Promise<void>;
}

const VOICE_PROMPTS = {
  readyCheckInPhoto:
    'Silakan pastikan titik lokasi terbaca, lalu tekan tombol ambil foto untuk absen masuk.',
  readyCheckOutPhoto:
    'Silakan ambil foto kehadiran terlebih dahulu untuk mencatat absen pulang.',
  readyLocationOnly:
    'Titik lokasi sedang diperiksa. Setelah sesuai radius sekolah, silakan tekan tombol simpan presensi.',
  captured: 'Foto kehadiran sudah siap. Silakan tekan simpan presensi.',
};

export function VerificationCheckInModal({
  isOpen,
  mode,
  teacher,
  school,
  settings,
  onClose,
  onConfirm,
}: VerificationCheckInModalProps) {
  const [voiceEnabled, setVoiceEnabled] = useState(() => isVoiceEnabled());

  // Location state
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gps, setGps] = useState<GpsPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Fast 1-Tap Photo capture state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const savedRef = useRef(false);
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  useEffect(() => {
    return subscribeVoiceEnabled((next) => setVoiceEnabled(next));
  }, []);

  const requireLocation = settings.requireLocationVerification;
  const requirePhoto = settings.requireFaceVerification;

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const loadLocation = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const pos = await getCurrentGpsPosition(12000);
      setGps(pos);
    } catch (err) {
      setGps(null);
      setGpsError(err instanceof Error ? err.message : 'Gagal mengambil lokasi GPS.');
    } finally {
      setGpsLoading(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Kamera langsung tidak tersedia pada peramban ini. Gunakan tombol ambil foto perangkat di bawah.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setCameraError(
        'Izin kamera ditolak atau sedang digunakan aplikasi lain. Anda juga dapat memakai tombol kamera HP di bawah.'
      );
    }
  }, [stopCameraStream]);

  const readyPrompt = requirePhoto
    ? mode === 'checkin'
      ? VOICE_PROMPTS.readyCheckInPhoto
      : VOICE_PROMPTS.readyCheckOutPhoto
    : VOICE_PROMPTS.readyLocationOnly;

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      if (!savedRef.current) {
        stopAllVoice();
      }
      return;
    }

    savedRef.current = false;
    setCapturedPhoto(null);
    setPhotoFeedback(null);
    setSubmitError(null);
    setGps(null);
    setGpsError(null);

    if (requireLocation || school?.hasLocation) {
      loadLocation();
    }

    if (requirePhoto) {
      startCamera().then(() => {
        if (voiceEnabledRef.current) {
          speakVoice(readyPrompt, true);
        }
      });
    } else if (voiceEnabledRef.current) {
      speakVoice(readyPrompt, true);
    }

    return () => {
      stopCameraStream();
      if (!savedRef.current) {
        stopAllVoice();
      }
    };
  }, [
    isOpen,
    requireLocation,
    requirePhoto,
    readyPrompt,
    school?.hasLocation,
    loadLocation,
    startCamera,
    stopCameraStream,
  ]);

  if (!isOpen) return null;

  // Location Verification Status
  let distanceMeters = -1;
  let locationStatus: LocationStatus = 'not_required';
  let locationReady = true;

  if (!requireLocation) {
    locationStatus = 'not_required';
    locationReady = true;
    if (gps && school?.hasLocation) {
      distanceMeters = calculateDistanceMeters(
        gps.latitude,
        gps.longitude,
        school.latitude,
        school.longitude
      );
    }
  } else if (!school || !school.hasLocation) {
    locationStatus = 'unconfigured';
    locationReady = true;
  } else if (gpsLoading || !gps) {
    locationStatus = 'outside_radius';
    locationReady = false;
  } else {
    distanceMeters = calculateDistanceMeters(
      gps.latitude,
      gps.longitude,
      school.latitude,
      school.longitude
    );
    if (distanceMeters <= school.radiusMeters) {
      locationStatus = 'verified';
      locationReady = true;
    } else {
      locationStatus = 'outside_radius';
      locationReady = false;
    }
  }

  // Fast Photo Status
  let faceStatus: FaceStatus = 'not_required';
  let faceConfidence = 0;
  let photoReady = true;

  if (!requirePhoto) {
    faceStatus = 'not_required';
    photoReady = true;
  } else if (capturedPhoto) {
    faceStatus = 'photo_verified';
    faceConfidence = 100;
    photoReady = true;
  } else {
    faceStatus = 'liveness_failed';
    faceConfidence = 0;
    photoReady = false;
  }

  function handleCapturePhoto() {
    if (!videoRef.current) return;
    setPhotoFeedback(null);
    try {
      const photo = captureVideoFrameToDataUrl(videoRef.current, 420, 0.74, 95000);
      playChime('shutter', voiceEnabled);
      stopCameraStream();
      setCapturedPhoto(photo);
      speakVoice(VOICE_PROMPTS.captured, voiceEnabled);
    } catch (err) {
      setPhotoFeedback(err instanceof Error ? err.message : 'Gagal mengambil foto kehadiran.');
    }
  }

  async function handleFallbackFileCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoFeedback(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 420, 0.74, 95000);
      playChime('shutter', voiceEnabled);
      stopCameraStream();
      setCapturedPhoto(dataUrl);
      speakVoice(VOICE_PROMPTS.captured, voiceEnabled);
    } catch (err) {
      setPhotoFeedback(err instanceof Error ? err.message : 'Gagal memproses foto.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function handleRetakePhoto() {
    setCapturedPhoto(null);
    setPhotoFeedback(null);
    startCamera();
  }

  async function handleConfirmSubmit() {
    if (!locationReady || !photoReady || photoBusy || submitting) return;
    unlockVoiceAudio();
    setSubmitting(true);
    setSubmitError(null);
    try {
      savedRef.current = true;
      await onConfirm({
        latitude: gps?.latitude ?? 0,
        longitude: gps?.longitude ?? 0,
        distanceMeters,
        locationStatus,
        faceStatus,
        faceConfidence,
        checkInPhotoUrl: capturedPhoto || '',
      });
      stopCameraStream();
      onClose();
    } catch (err) {
      savedRef.current = false;
      const errText = err instanceof Error ? err.message : 'Gagal menyimpan data presensi.';
      setSubmitError(errText);
      playChime('error', voiceEnabled);
      speakVoice('Maaf, presensi gagal disimpan. Silakan periksa kembali.', voiceEnabled);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleVoice() {
    unlockVoiceAudio();
    const next = !voiceEnabled;
    setGlobalVoiceEnabled(next);
    if (next) {
      speakVoice(capturedPhoto ? VOICE_PROMPTS.captured : readyPrompt, true);
    }
  }

  const canSubmit = locationReady && photoReady && !gpsLoading && !photoBusy && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-modal-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 id="verify-modal-title" className="font-display text-base font-semibold text-slate-900">
              {mode === 'checkin'
                ? 'Verifikasi Koordinat & Foto — Absen Masuk'
                : 'Verifikasi Koordinat & Foto — Absen Pulang'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {teacher.fullName} · {teacher.schoolName}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleVoice}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                voiceEnabled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
              title={voiceEnabled ? 'Matikan panduan suara' : 'Aktifkan panduan suara'}
            >
              {voiceEnabled ? (
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{voiceEnabled ? 'Suara Aktif' : 'Suara Bisu'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopAllVoice();
                stopCameraStream();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label="Tutup jendela verifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {submitError && (
            <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
              {submitError}
            </div>
          )}

          {/* Section 1: Coordinates GPS */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-800 shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-slate-900">
                  1. Koordinat Lokasi Sekolah (GPS)
                </h3>
              </div>
              <button
                type="button"
                onClick={loadLocation}
                disabled={gpsLoading}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
                <span>Muat Ulang GPS</span>
              </button>
            </div>

            {!requireLocation ? (
              <p className="text-xs text-slate-600">
                Pembatasan radius lokasi tidak diwajibkan.{' '}
                {gps && (
                  <span className="font-mono tabular-nums text-slate-500">
                    ({gps.latitude}, {gps.longitude})
                  </span>
                )}
              </p>
            ) : !school || !school.hasLocation ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Titik koordinat sekolah belum diatur Administrator. Presensi tetap bisa dilanjutkan;
                {gps
                  ? ` posisi Anda tercatat (${gps.latitude}, ${gps.longitude}).`
                  : ' koordinat tidak tersedia.'}
              </div>
            ) : gpsLoading ? (
              <p className="text-xs text-slate-600">Mengambil titik koordinat GPS perangkat Anda...</p>
            ) : gpsError ? (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{gpsError}</span>
              </div>
            ) : locationStatus === 'verified' ? (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Koordinat Dalam Radius Sekolah</p>
                  <p className="mt-0.5 tabular-nums">
                    Jarak <strong className="font-mono">{distanceMeters} m</strong> dari {school.schoolName}{' '}
                    (maks {school.radiusMeters} m · akurasi ±{gps?.accuracyMeters ?? 0} m) ·{' '}
                    <span className="font-mono">
                      {gps?.latitude ?? 0}, {gps?.longitude ?? 0}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Di Luar Radius Sekolah</p>
                  <p className="mt-0.5 tabular-nums">
                    Jarak Anda <strong className="font-mono">{distanceMeters} m</strong> dari{' '}
                    {school.schoolName}, melebihi batas <strong className="font-mono">{school.radiusMeters} m</strong>.
                    Mendekatlah ke area sekolah lalu tekan Muat Ulang GPS.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Direct Instant Photo */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-800 shrink-0" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-slate-900">
                  2. Foto Kehadiran Langsung
                </h3>
              </div>
              {requirePhoto && (
                <button
                  type="button"
                  onClick={() => {
                    unlockVoiceAudio();
                    speakVoice(capturedPhoto ? VOICE_PROMPTS.captured : readyPrompt, true);
                  }}
                  className="text-[11px] font-medium text-emerald-800 hover:underline cursor-pointer"
                >
                  Putar Ulang Suara
                </button>
              )}
            </div>

            {!requirePhoto ? (
              <p className="text-xs text-slate-600">
                Pengambilan foto kehadiran sedang tidak diwajibkan oleh Administrator.
              </p>
            ) : !capturedPhoto ? (
              <div className="space-y-3">
                <div className="relative w-full aspect-[4/3] max-h-64 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
                  {cameraActive ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover -scale-x-100"
                    />
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-300 space-y-2">
                      <Camera className="w-7 h-7 mx-auto text-slate-400" aria-hidden="true" />
                      <p>{cameraError || 'Mengaktifkan kamera...'}</p>
                    </div>
                  )}
                </div>

                {photoFeedback && (
                  <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                    {photoFeedback}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  {cameraActive && (
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                    >
                      <Camera className="w-4 h-4" aria-hidden="true" />
                      <span>Ambil Foto Kehadiran</span>
                    </button>
                  )}

                  <label className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer">
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    <span>{photoBusy ? 'Memproses...' : 'Ambil Foto via Kamera Perangkat'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handleFallbackFileCapture}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-950">
                  <img
                    src={capturedPhoto}
                    alt="Foto kehadiran guru"
                    className="w-full max-h-56 object-contain mx-auto"
                  />
                </div>

                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="font-medium">Foto kehadiran siap disimpan bersama koordinat GPS.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetakePhoto}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Foto Ulang</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              stopAllVoice();
              stopCameraStream();
              onClose();
            }}
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleConfirmSubmit}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            <UserCheck className="w-4 h-4" aria-hidden="true" />
            <span>
              {submitting
                ? 'Menyimpan Presensi...'
                : mode === 'checkin'
                ? 'Simpan Absen Masuk'
                : 'Simpan Absen Pulang'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
