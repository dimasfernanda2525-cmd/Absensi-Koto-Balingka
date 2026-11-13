export interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/**
 * Hitung jarak Haversine antara dua koordinat GPS dalam meter bulat.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Ambil lokasi GPS perangkat menggunakan Geolocation API browser.
 */
export function getCurrentGpsPosition(timeoutMs = 15000): Promise<GpsPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Peramban atau perangkat Anda tidak mendukung layanan lokasi GPS.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              'Izin akses lokasi ditolak. Aktifkan izin lokasi di browser agar dapat memverifikasi posisi sekolah.'
            )
          );
          return;
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Sinyal lokasi GPS tidak tersedia saat ini. Coba aktifkan GPS perangkat.'));
          return;
        }
        if (err.code === err.TIMEOUT) {
          reject(new Error('Waktu tunggu pengambilan GPS habis. Silakan muat ulang lokasi.'));
          return;
        }
        reject(new Error('Gagal mengambil koordinat lokasi perangkat.'));
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
}

function drawResizedToJpeg(
  source: HTMLImageElement | HTMLVideoElement,
  srcWidth: number,
  srcHeight: number,
  maxDim: number,
  quality: number
): string {
  const scale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight, 1));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Tidak dapat memproses gambar pada canvas peramban.');
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Kompres file gambar unggahan (foto referensi wajah) menjadi JPEG Data URL ringkas.
 */
export function compressImageFileToDataUrl(
  file: File,
  maxDim = 384,
  quality = 0.72,
  maxBytesLength = 135000
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar (JPG, PNG, atau WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat dimuat.'));
      img.onload = () => {
        try {
          let currentQuality = quality;
          let currentDim = maxDim;
          let dataUrl = drawResizedToJpeg(
            img,
            img.naturalWidth || img.width,
            img.naturalHeight || img.height,
            currentDim,
            currentQuality
          );

          while (dataUrl.length > maxBytesLength && currentQuality > 0.38) {
            currentQuality -= 0.1;
            currentDim = Math.max(200, Math.round(currentDim * 0.85));
            dataUrl = drawResizedToJpeg(
              img,
              img.naturalWidth || img.width,
              img.naturalHeight || img.height,
              currentDim,
              currentQuality
            );
          }

          if (dataUrl.length > maxBytesLength) {
            reject(new Error('Ukuran foto terlalu besar setelah dikompresi. Gunakan foto wajah yang lebih ringkas.'));
            return;
          }
          resolve(dataUrl);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Gagal mengompresi foto.'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export interface PreparedImageResult {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Siapkan file gambar dengan tetap mempertahankan resolusi piksel asli (tanpa mengubah lebar/tinggi).
 * Jika ukuran byte Data URL asli sudah muat di batas database, file digunakan apa adanya.
 * Jika melebihi batas byte, hanya kualitas JPEG yang disesuaikan pada dimensi piksel asli.
 */
export function prepareImagePreservingResolution(
  file: File,
  maxBytesLength = 460000
): Promise<PreparedImageResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar (JPG, PNG, atau WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const originalDataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat dimuat.'));
      img.onload = () => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        if (!width || !height) {
          reject(new Error('Dimensi gambar tidak valid.'));
          return;
        }

        // Jika file asli sudah berada di bawah batas database, kembalikan tanpa mengubah apa pun
        if (originalDataUrl.length <= maxBytesLength) {
          resolve({ dataUrl: originalDataUrl, width, height });
          return;
        }

        try {
          // Pertahankan resolusi piksel asli 100% (width x height tidak diubah)
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Tidak dapat memproses gambar pada canvas peramban.'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const qualities = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5, 0.4, 0.32, 0.25];
          for (const q of qualities) {
            const candidate = canvas.toDataURL('image/jpeg', q);
            if (candidate.length <= maxBytesLength) {
              resolve({ dataUrl: candidate, width, height });
              return;
            }
          }

          reject(
            new Error(
              `Ukuran file foto (${width}×${height} px) melebihi kapasitas penyimpanan database (~340 KB) tanpa mengubah resolusi. Pilih file foto dengan ukuran file lebih kecil.`
            )
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Gagal memproses file foto.'));
        }
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Tangkap frame kamera video menjadi JPEG Data URL terkompresi.
 */
export function captureVideoFrameToDataUrl(
  video: HTMLVideoElement,
  maxDim = 384,
  quality = 0.72,
  maxBytesLength = 98000
): string {
  const vw = video.videoWidth || 480;
  const vh = video.videoHeight || 360;
  if (vw === 0 || vh === 0) {
    throw new Error('Kamera belum siap menangkap gambar.');
  }

  let currentDim = maxDim;
  let currentQuality = quality;
  let dataUrl = drawResizedToJpeg(video, vw, vh, currentDim, currentQuality);

  while (dataUrl.length > maxBytesLength && currentQuality > 0.35) {
    currentQuality -= 0.1;
    currentDim = Math.max(180, Math.round(currentDim * 0.82));
    dataUrl = drawResizedToJpeg(video, vw, vh, currentDim, currentQuality);
  }

  return dataUrl;
}
