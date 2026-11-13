# Security Specification — Sistem Absensi Guru Kecamatan (Lokasi & Verifikasi Wajah)

## 1. Data Invariants
1. **Credential & Face Isolation**: Salted SHA-256 PIN hashes live in `credentials/{username}` and reference face photos live in `teacherFaces/{teacherId}`. Both collections strictly enforce `allow list: if false;` to prevent mass scraping.
2. **Admin-Only Registration & Reference Face Upload**: Creating or updating `credentials`, `teachers`, `teacherFaces`, `schools`, or `districtSettings` requires `updatedByUsername` / `createdByUsername` to reference an active `role == 'admin'` document in `credentials`.
3. **Volumetric Bounds on Images & Coordinates**: `teacherFaces.photoDataUrl` is capped at 140,000 bytes, `attendance.checkInPhotoUrl` is capped at 100,000 bytes, `latitude` is bounded `[-90, 90]`, `longitude` is bounded `[-180, 180]`, and `radiusMeters` is bounded `[20, 5000]`.
4. **Server-Side Face Matching**: Face matching calls `@google/genai` strictly inside Express `server.ts` (`/api/verify-face`) so `GEMINI_API_KEY` never leaves the server.
5. **Teacher Self-Attendance Boundary**: When `submittedByRole == 'teacher'`, the attendance status may only be `hadir`, `terlambat`, `izin`, or `sakit`, and `recordedByUsername` must match `teachers/{teacherId}.username`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Face Photo Scraping**: Client queries `getDocs(collection(db, 'teacherFaces'))`. Expected: `PERMISSION_DENIED`.
2. **Oversized Image Payload (DoW)**: Client attempts to store a 900KB photo in `checkInPhotoUrl` or `photoDataUrl`. Expected: `PERMISSION_DENIED`.
3. **Invalid GPS Coordinates**: Client writes `latitude: 999` or `radiusMeters: -10`. Expected: `PERMISSION_DENIED`.
4. **Non-Admin Face Reference Overwrite**: Teacher attempts to overwrite `teacherFaces/{id}` with their own `updatedByUsername`. Expected: `PERMISSION_DENIED`.
5. **Credential Enumeration**: Client queries `getDocs(collection(db, 'credentials'))`. Expected: `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Client adds `bypassGeofence: true` on `attendance`. Expected: `PERMISSION_DENIED`.
7. **Cross-Teacher Check-In**: Teacher `budi` submits attendance for `hendra`. Expected: `PERMISSION_DENIED`.
8. **Orphan Face Record**: Admin creates `teacherFaces/nonexistent` without an existing `teachers/nonexistent` doc. Expected: `PERMISSION_DENIED`.
9. **Master Admin Deletion**: Client attempts `deleteDoc(doc(db, 'credentials', 'admin'))`. Expected: `PERMISSION_DENIED`.
10. **Client Timestamp Spoofing**: Client sets `updatedAt` to a past timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
11. **Immortal Field Mutation**: Client mutates `teacherId` or `date` on `attendance` update. Expected: `PERMISSION_DENIED`.
12. **Self-Marking Alpa**: Teacher submits `status: 'alpa'` with `submittedByRole: 'teacher'`. Expected: `PERMISSION_DENIED`.
