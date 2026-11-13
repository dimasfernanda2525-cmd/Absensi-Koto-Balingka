import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { GoogleGenAI as GoogleGenAIType } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT =
  process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 3000 : 3000;

const ttsCache = new Map<string, string>();
let ttsQuotaBlockedUntil = 0;
let ttsQuotaLoggedOnce = false;

let genAiModulePromise: Promise<typeof import('@google/genai')> | null = null;
function getGenAiModule() {
  if (!genAiModulePromise) {
    genAiModulePromise = import('@google/genai');
  }
  return genAiModulePromise;
}

async function createGeminiClient(): Promise<{
  ai: GoogleGenAIType;
  ThinkingLevel: typeof import('@google/genai').ThinkingLevel;
  Type: typeof import('@google/genai').Type;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const { GoogleGenAI, ThinkingLevel, Type } = await getGenAiModule();
  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return { ai, ThinkingLevel, Type };
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
    dataUrl.trim()
  );
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
    data: match[2],
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '3mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Liveness gesture verification: blink or smile (no reference photo needed)
  app.post('/api/verify-liveness', async (req, res) => {
    try {
      const gemini = await createGeminiClient();
      if (!gemini) {
        res.status(500).json({
          error: 'Kunci layanan verifikasi belum dikonfigurasi di server.',
        });
        return;
      }
      const { ai, ThinkingLevel, Type } = gemini;

      const { step, frames, teacherName } = req.body as {
        step?: 'blink' | 'smile';
        frames?: string[];
        teacherName?: string;
      };

      if (step !== 'blink' && step !== 'smile') {
        res.status(400).json({ error: 'Tahap verifikasi tidak valid (gunakan blink atau smile).' });
        return;
      }

      if (!Array.isArray(frames) || frames.length === 0 || frames.length > 6) {
        res.status(400).json({ error: 'Sertakan 1 sampai 6 tangkapan kamera untuk verifikasi.' });
        return;
      }

      const parsedFrames = frames.map((f) => (typeof f === 'string' ? parseDataUrl(f) : null));
      if (parsedFrames.some((p) => !p)) {
        res.status(400).json({ error: 'Format gambar kamera tidak valid.' });
        return;
      }

      const imageParts = parsedFrames.map((p) => ({
        inlineData: { mimeType: p!.mimeType, data: p!.data },
      }));

      const prompt =
        step === 'blink'
          ? [
              `Anda adalah sistem verifikasi keaktifan wajah (liveness) absensi untuk ${
                teacherName || 'guru'
              }.`,
              `Berikut adalah ${imageParts.length} frame berurutan dari kamera depan selama sekitar 1.5 detik.`,
              'Tugas Anda:',
              '1. Pastikan terlihat wajah manusia asli secara langsung di depan kamera (bukan foto layar HP/monitor, bukan cetakan kertas, dan bukan kamera kosong).',
              '2. Periksa apakah orang tersebut melakukan gerakan KEDIP MATA atau memejamkan/menyipitkan kelopak mata secara jelas pada setidaknya satu frame dibanding frame lainnya (misalnya mata terbuka -> terpejam -> terbuka, atau terpejam pada beberapa frame).',
              '3. Berikan hasil JSON dengan passed=true hanya jika wajah asli terdeteksi DAN gerakan kedipan mata terlihat.',
              '4. Berikan alasan singkat 1 kalimat dalam Bahasa Indonesia yang ramah dan jelas.',
            ].join('\n')
          : [
              `Anda adalah sistem verifikasi ekspresi senyum (liveness) absensi untuk ${
                teacherName || 'guru'
              }.`,
              `Berikut adalah ${imageParts.length} frame kamera depan saat guru diminta tersenyum.`,
              'Tugas Anda:',
              '1. Pastikan terlihat wajah manusia asli secara langsung di depan kamera (bukan foto layar/cetak dan bukan kamera kosong).',
              '2. Periksa apakah orang tersebut tersenyum dengan jelas (sudut bibir terangkat / ekspresi senyum ramah).',
              '3. Berikan hasil JSON dengan passed=true hanya jika wajah asli terdeteksi DAN ekspresi senyum terlihat.',
              '4. Berikan alasan singkat 1 kalimat dalam Bahasa Indonesia yang ramah dan jelas.',
            ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [...imageParts, { text: prompt }],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              passed: {
                type: Type.BOOLEAN,
                description:
                  'True jika manusia asli terdeteksi dan gerakan kedip/senyum yang diminta berhasil dilakukan.',
              },
              isLivePerson: {
                type: Type.BOOLEAN,
                description: 'True jika terlihat wajah manusia nyata langsung di depan kamera.',
              },
              confidence: {
                type: Type.INTEGER,
                description: 'Skor keyakinan verifikasi antara 0 hingga 100.',
              },
              reason: {
                type: Type.STRING,
                description: 'Penjelasan singkat 1 kalimat dalam Bahasa Indonesia.',
              },
            },
            required: ['passed', 'isLivePerson', 'confidence', 'reason'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const result = JSON.parse(rawText) as {
        passed: boolean;
        isLivePerson: boolean;
        confidence: number;
        reason: string;
      };

      res.json({
        passed: Boolean(result.passed) && Boolean(result.isLivePerson),
        isLivePerson: Boolean(result.isLivePerson),
        confidence: Math.max(0, Math.min(100, Math.round(Number(result.confidence) || 0))),
        reason: String(result.reason || 'Pemeriksaan selesai.'),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Liveness verification error:', msg);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        res.status(429).json({
          error: 'Batas permintaan verifikasi tercapai sementara. Coba lagi sebentar lagi.',
        });
        return;
      }
      res.status(500).json({
        error: 'Gagal memeriksa gerakan wajah di server. Silakan ulangi sebentar.',
      });
    }
  });

  function ensureWavBase64(base64Data: string, mimeType?: string): { base64: string; mimeType: string } {
    const raw = Buffer.from(base64Data, 'base64');
    // Check if already a RIFF/WAV container
    if (raw.length >= 12 && raw.toString('ascii', 0, 4) === 'RIFF' && raw.toString('ascii', 8, 12) === 'WAVE') {
      return { base64: base64Data, mimeType: 'audio/wav' };
    }
    if (mimeType && !mimeType.toLowerCase().includes('l16') && !mimeType.toLowerCase().includes('pcm')) {
      return { base64: base64Data, mimeType };
    }
    // Wrap 24kHz mono 16-bit LE PCM in a 44-byte WAV header
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + raw.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(raw.length, 40);
    return {
      base64: Buffer.concat([header, raw]).toString('base64'),
      mimeType: 'audio/wav',
    };
  }

  // Indonesian Voice Guide TTS via Gemini 3.8 Flash Lite TTS (with in-memory WAV cache)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      const cleanText = typeof text === 'string' ? text.trim() : '';
      if (!cleanText || cleanText.length > 280) {
        res.status(400).json({ error: 'Teks suara wajib diisi (maksimal 280 karakter).' });
        return;
      }

      const cached = ttsCache.get(cleanText);
      if (cached) {
        res.json({ audioBase64: cached, mimeType: 'audio/wav' });
        return;
      }

      if (Date.now() < ttsQuotaBlockedUntil) {
        res.status(429).json({
          error: 'Kuota layanan suara sementara tercapai. Menggunakan suara perangkat.',
          quotaExceeded: true,
        });
        return;
      }

      const gemini = await createGeminiClient();
      if (!gemini) {
        res.status(500).json({ error: 'Layanan suara belum dikonfigurasi.' });
        return;
      }
      const { ai } = gemini;

      const generateTts = (withStyle: boolean) =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                withStyle
                  ? {
                      text: cleanText,
                      speechMetadata: {
                        style:
                          'Warm, friendly, natural Indonesian everyday speaker, gentle smile, clear pronunciation, comfortable conversational pace',
                      },
                    }
                  : {
                      text: `Ucapkan dalam Bahasa Indonesia dengan nada hangat, ramah, santai, dan sangat natural: ${cleanText}`,
                    },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });

      let response;
      let lastErr: unknown = null;
      const attempts = [() => generateTts(true), () => generateTts(false)];
      for (const attempt of attempts) {
        try {
          response = await attempt();
          if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
            break;
          }
        } catch (err) {
          lastErr = err;
          const errMsg = err instanceof Error ? err.message : String(err);
          if (
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('429') ||
            errMsg.includes('PERMISSION_DENIED') ||
            errMsg.includes('API_KEY_INVALID') ||
            errMsg.includes('403')
          ) {
            break;
          }
        }
      }

      const inlineData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) {
        if (lastErr) throw lastErr;
        res.status(502).json({ error: 'Audio tidak berhasil dihasilkan.' });
        return;
      }

      const wav = ensureWavBase64(inlineData.data, inlineData.mimeType);

      if (ttsCache.size > 60) {
        const firstKey = ttsCache.keys().next().value;
        if (firstKey) ttsCache.delete(firstKey);
      }
      ttsCache.set(cleanText, wav.base64);
      ttsQuotaLoggedOnce = false;

      res.json({ audioBase64: wav.base64, mimeType: wav.mimeType });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        ttsQuotaBlockedUntil = Date.now() + 30 * 60_000;
        if (!ttsQuotaLoggedOnce) {
          ttsQuotaLoggedOnce = true;
          console.info('TTS quota limit reached; pausing server TTS for 30m (browser voice fallback active).');
        }
        res.status(429).json({
          error: 'Kuota layanan suara sementara tercapai. Menggunakan suara perangkat.',
          quotaExceeded: true,
        });
        return;
      }
      console.error('TTS error:', msg);
      if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403')) {
        res.status(403).json({
          error: 'Kunci layanan suara belum memiliki akses.',
        });
        return;
      }
      res.status(500).json({
        error: 'Gagal menghasilkan suara panduan.',
        details: msg,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    );
    vitePromise.catch((err) => {
      console.error('Vite middleware initialization failed:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
