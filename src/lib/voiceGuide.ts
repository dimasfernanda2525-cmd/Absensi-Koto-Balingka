const VOICE_PREF_KEY = 'absen_voice_enabled_v1';
const TTS_COOLDOWN_KEY = 'absen_tts_cooldown_until_v1';

const clientTtsCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string | null>>();
const voicePrefListeners = new Set<(enabled: boolean) => void>();

// Minimal 0.02s silent WAV for synchronous gesture-unlocking inside iframes/mobile browsers
const SILENT_WAV_DATA_URL =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let sharedAudio: HTMLAudioElement | null = null;
let sharedAudioUnlocked = false;
let sharedAudioCtx: AudioContext | null = null;
let gestureInstallDone = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
let speakGeneration = 0;
let fallbackDelayTimer: number | null = null;

function readInitialTtsCooldown(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.sessionStorage.getItem(TTS_COOLDOWN_KEY);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) && ts > Date.now() ? ts : 0;
  } catch {
    return 0;
  }
}

let ttsCooldownUntil = readInitialTtsCooldown();

function setTtsCooldown(durationMs: number): void {
  ttsCooldownUntil = Date.now() + durationMs;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(TTS_COOLDOWN_KEY, String(ttsCooldownUntil));
    } catch {
      // Ignore sessionStorage errors
    }
  }
}

function readInitialVoicePref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(VOICE_PREF_KEY);
    if (raw === '0' || raw === 'false') return false;
  } catch {
    // Ignore storage read errors
  }
  return true;
}

let voiceEnabledState = readInitialVoicePref();

export function isVoiceEnabled(): boolean {
  return voiceEnabledState;
}

export function setVoiceEnabled(enabled: boolean): void {
  voiceEnabledState = enabled;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(VOICE_PREF_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore storage write errors
    }
  }
  if (!enabled) {
    stopAllVoice();
  }
  for (const listener of voicePrefListeners) {
    listener(enabled);
  }
}

export function subscribeVoiceEnabled(listener: (enabled: boolean) => void): () => void {
  voicePrefListeners.add(listener);
  return () => {
    voicePrefListeners.delete(listener);
  };
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => undefined);
  }
  return sharedAudioCtx;
}

function getOrCreateSharedAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

function refreshBrowserVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const list = window.speechSynthesis.getVoices();
    if (list.length > 0) {
      cachedVoices = list;
    }
  } catch {
    // Ignore voice enumeration errors
  }
}

export function unlockVoiceAudio(): void {
  if (typeof window === 'undefined') return;
  getOrCreateAudioContext();
  refreshBrowserVoices();

  const audio = getOrCreateSharedAudio();
  if (audio && !sharedAudioUnlocked) {
    const isActivelyPlaying = !audio.paused && audio.currentTime > 0 && !audio.ended;
    if (!isActivelyPlaying) {
      try {
        audio.src = SILENT_WAV_DATA_URL;
        const p = audio.play();
        if (p) {
          p.then(() => {
            sharedAudioUnlocked = true;
          }).catch(() => undefined);
        } else {
          sharedAudioUnlocked = true;
        }
      } catch {
        // Ignore unlock errors
      }
    } else {
      sharedAudioUnlocked = true;
    }
  }
}

export function installVoiceGestureUnlock(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  refreshBrowserVoices();

  if (gestureInstallDone) {
    return () => undefined;
  }
  gestureInstallDone = true;

  const onGesture = () => {
    unlockVoiceAudio();
  };

  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
  window.addEventListener('touchstart', onGesture, { capture: true, passive: true });
  window.addEventListener('keydown', onGesture, { capture: true, passive: true });

  const onVoicesChanged = () => {
    refreshBrowserVoices();
  };
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    } catch {
      // Some older browsers use onvoiceschanged
      window.speechSynthesis.onvoiceschanged = onVoicesChanged;
    }
  }

  return () => {
    gestureInstallDone = false;
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('touchstart', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      } catch {
        // Ignore cleanup errors
      }
    }
  };
}

export function stopAllVoice(): void {
  speakGeneration += 1;
  if (fallbackDelayTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(fallbackDelayTimer);
    fallbackDelayTimer = null;
  }
  if (sharedAudio) {
    try {
      sharedAudio.pause();
      sharedAudio.currentTime = 0;
    } catch {
      // Ignore audio pause errors
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Ignore synthesis cancel errors
    }
  }
}

function selectBestIndonesianVoice(): SpeechSynthesisVoice | undefined {
  refreshBrowserVoices();
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  const isId = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase();
    return lang.startsWith('id') || lang.includes('ind');
  };

  return (
    voices.find(
      (v) => isId(v) && /natural|online|google|gadis|damayanti|ardi/i.test(v.name)
    ) ||
    voices.find((v) => isId(v) && !v.localService) ||
    voices.find((v) => isId(v)) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('ms'))
  );
}

function speakWithBrowserFallback(text: string, expectedGen: number): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (expectedGen !== speakGeneration) return;

  try {
    const synth = window.speechSynthesis;
    const wasBusy = synth.speaking || synth.pending;
    if (wasBusy) {
      synth.cancel();
    }

    const runSpeak = () => {
      if (expectedGen !== speakGeneration) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 0.98;
      utterance.pitch = 1.04;
      utterance.volume = 1;

      const idVoice = selectBestIndonesianVoice();
      if (idVoice) {
        utterance.voice = idVoice;
      }
      synth.speak(utterance);
    };

    if (wasBusy) {
      fallbackDelayTimer = window.setTimeout(() => {
        fallbackDelayTimer = null;
        runSpeak();
      }, 30);
    } else {
      runSpeak();
    }
  } catch {
    // Ignore browser speech synthesis failures
  }
}

async function fetchTtsDataUrl(text: string): Promise<string | null> {
  const existing = clientTtsCache.get(text);
  if (existing) return existing;

  if (Date.now() < ttsCooldownUntil) {
    return null;
  }

  const inflight = inFlightRequests.get(text);
  if (inflight) return inflight;

  const promise = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5500);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Put TTS endpoint into cooldown so fallback voice responds instantaneously
        setTtsCooldown(res.status === 429 || res.status === 403 ? 30 * 60_000 : 60_000);
        return null;
      }
      const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
      if (!data.audioBase64) {
        setTtsCooldown(60_000);
        return null;
      }
      const dataUrl = `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`;
      if (clientTtsCache.size > 40) {
        const firstKey = clientTtsCache.keys().next().value;
        if (firstKey) clientTtsCache.delete(firstKey);
      }
      clientTtsCache.set(text, dataUrl);
      return dataUrl;
    } catch {
      setTtsCooldown(30_000);
      return null;
    } finally {
      window.clearTimeout(timer);
      inFlightRequests.delete(text);
    }
  })();

  inFlightRequests.set(text, promise);
  return promise;
}

export async function prewarmVoicePrompts(_texts: string[]): Promise<void> {
  // Intentionally disabled to conserve TTS API quota; prompts are cached lazily on first use.
}

export interface SpeakVoiceOptions {
  enabled?: boolean;
  interrupt?: boolean;
}

export async function speakVoice(
  text: string,
  optionsOrEnabled: boolean | SpeakVoiceOptions = isVoiceEnabled()
): Promise<void> {
  const enabled =
    typeof optionsOrEnabled === 'boolean'
      ? optionsOrEnabled
      : (optionsOrEnabled.enabled ?? isVoiceEnabled());
  const interrupt =
    typeof optionsOrEnabled === 'object' ? (optionsOrEnabled.interrupt ?? true) : true;

  const cleanText = text.trim();
  if (interrupt) {
    stopAllVoice();
  } else {
    speakGeneration += 1;
  }

  if (!enabled || !cleanText) return;

  const myGen = speakGeneration;
  const playDataUrl = async (dataUrl: string): Promise<boolean> => {
    const audio = getOrCreateSharedAudio();
    if (!audio) return false;
    try {
      audio.pause();
      audio.src = dataUrl;
      audio.currentTime = 0;
      audio.volume = 1;
      await audio.play();
      sharedAudioUnlocked = true;
      return true;
    } catch {
      return false;
    }
  };

  const cached = clientTtsCache.get(cleanText);
  if (cached) {
    const ok = await playDataUrl(cached);
    if (!ok && myGen === speakGeneration) {
      speakWithBrowserFallback(cleanText, myGen);
    }
    return;
  }

  const fetched = await fetchTtsDataUrl(cleanText);
  if (myGen !== speakGeneration) return;

  if (fetched) {
    const ok = await playDataUrl(fetched);
    if (ok) return;
  }

  speakWithBrowserFallback(cleanText, myGen);
}

export function playChime(
  type: 'step_ok' | 'error' | 'shutter',
  enabled = isVoiceEnabled()
): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number, gainPeak = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === 'shutter' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    if (type === 'step_ok') {
      playTone(587.33, now, 0.12);
      playTone(880, now + 0.1, 0.2);
    } else if (type === 'error') {
      playTone(320, now, 0.16, 0.06);
      playTone(240, now + 0.14, 0.22, 0.06);
    } else {
      playTone(1046.5, now, 0.07, 0.09);
    }
  } catch {
    // Ignore audio context errors
  }
}
