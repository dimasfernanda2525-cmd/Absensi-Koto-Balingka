export const DISTRICT_KEY = 'kecamatan-utama';

export type EmploymentType = 'PNS' | 'PPPK' | 'Honorer';
export type EntityStatus = 'aktif' | 'nonaktif';
export type AttendanceStatus = 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa';
export type AccountRole = 'teacher' | 'admin';

export type LocationStatus = 'verified' | 'outside_radius' | 'unconfigured' | 'not_required';
export type FaceStatus =
  | 'photo_verified'
  | 'liveness_verified'
  | 'liveness_failed'
  | 'matched'
  | 'mismatch'
  | 'no_reference'
  | 'not_required';
export type LivenessStep = 'blink' | 'smile';

export type DayOfWeekKey = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat' | 'sabtu';

export interface DaySchedule {
  checkInStart: string;
  checkOutStart: string;
  enabled: boolean;
}

export type WeeklySchedule = Record<DayOfWeekKey, DaySchedule>;

export const WEEKDAY_ORDER: Array<{ key: DayOfWeekKey; label: string }> = [
  { key: 'senin', label: 'Senin' },
  { key: 'selasa', label: 'Selasa' },
  { key: 'rabu', label: 'Rabu' },
  { key: 'kamis', label: 'Kamis' },
  { key: 'jumat', label: 'Jumat' },
  { key: 'sabtu', label: 'Sabtu' },
];

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  senin: { checkInStart: '07:30', checkOutStart: '14:00', enabled: true },
  selasa: { checkInStart: '07:30', checkOutStart: '14:00', enabled: true },
  rabu: { checkInStart: '07:30', checkOutStart: '14:00', enabled: true },
  kamis: { checkInStart: '07:30', checkOutStart: '14:00', enabled: true },
  jumat: { checkInStart: '07:30', checkOutStart: '11:30', enabled: true },
  sabtu: { checkInStart: '07:30', checkOutStart: '12:30', enabled: true },
};

export type AdminTab = 'pemantauan' | 'rekap' | 'registrasi' | 'pengaturan';
export type TeacherTab = 'absensi' | 'profil' | 'rekan' | 'pesan';
export type AppMode = 'teacher_portal' | 'admin_console';

export const FIELD_LIMITS = {
  districtNameMax: 120,
  regencyNameMax: 120,
  coordinatorNameMax: 100,
  schoolNameMax: 120,
  npsnMax: 20,
  addressMax: 200,
  holidayReasonMax: 120,
  fullNameMax: 100,
  nipMax: 30,
  roleTitleMax: 80,
  usernameMin: 3,
  usernameMax: 40,
  pinLength: 6,
  notesMax: 300,
  bioMax: 300,
  whatsappMax: 25,
  instagramMax: 40,
  messageBodyMax: 500,
  minRadiusMeters: 20,
  maxRadiusMeters: 5000,
  facePhotoMax: 140000,
  checkInPhotoMax: 100000,
  avatarPhotoMax: 470000,
  coverPhotoMax: 470000,
} as const;

export const PATTERNS = {
  timeHHMM: /^([01][0-9]|2[0-3]):[0-5][0-9]$/,
  nip: /^[0-9\-\s]*$/,
  npsn: /^[0-9A-Za-z-]*$/,
  dateYMD: /^\d{4}-\d{2}-\d{2}$/,
  monthYM: /^\d{4}-\d{2}$/,
  docId: /^[a-zA-Z0-9_\-]+$/,
  username: /^[a-z0-9_\-]+$/,
  pin6: /^\d{6}$/,
} as const;

export interface DistrictSettings {
  districtKey: string;
  districtName: string;
  regencyName: string;
  coordinatorName: string;
  coordinatorNip: string;
  checkInStart: string;
  lateToleranceMinutes: number;
  checkOutStart: string;
  requireLocationVerification: boolean;
  requireFaceVerification: boolean;
  updatedAt?: unknown;
  updatedByUsername: string;
}

export interface School {
  id: string;
  districtKey: string;
  schoolName: string;
  npsn: string;
  address: string;
  hasLocation: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  weeklySchedule: WeeklySchedule;
  status: EntityStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedByUsername: string;
}

export interface SchoolHoliday {
  id: string;
  districtKey: string;
  schoolId: string;
  schoolName: string;
  date: string;
  monthKey: string;
  reason: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedByUsername: string;
}

export interface Teacher {
  id: string;
  districtKey: string;
  fullName: string;
  nip: string;
  roleTitle: string;
  employmentType: EmploymentType;
  schoolId: string;
  schoolName: string;
  username: string;
  hasFacePhoto: boolean;
  bio: string;
  whatsapp: string;
  instagram: string;
  avatarPhotoUrl: string;
  coverPhotoUrl: string;
  status: EntityStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedByUsername: string;
}

export interface TeacherMessage {
  id: string;
  districtKey: string;
  threadId: string;
  participants: string[];
  senderId: string;
  senderName: string;
  senderUsername: string;
  recipientId: string;
  recipientName: string;
  body: string;
  isRead: boolean;
  createdAt?: unknown;
}

export interface TeacherFace {
  teacherId: string;
  photoDataUrl: string;
  updatedAt?: unknown;
  updatedByUsername: string;
}

export interface CredentialDoc {
  username: string;
  role: AccountRole;
  pinSalt: string;
  pinHash: string;
  teacherId: string;
  schoolId: string;
  displayName: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdByUsername: string;
  updatedByUsername: string;
}

export interface AttendanceRecord {
  id: string;
  districtKey: string;
  date: string;
  monthKey: string;
  teacherId: string;
  teacherName: string;
  teacherNip: string;
  roleTitle: string;
  schoolId: string;
  schoolName: string;
  status: AttendanceStatus;
  checkInTime: string;
  checkOutTime: string;
  notes: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  locationStatus: LocationStatus;
  faceStatus: FaceStatus;
  faceConfidence: number;
  checkInPhotoUrl: string;
  submittedByRole: AccountRole;
  recordedByUsername: string;
  recordedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LivenessVerificationResult {
  passed: boolean;
  isLivePerson: boolean;
  confidence: number;
  reason: string;
}

export interface SessionAccount {
  username: string;
  role: AccountRole;
  displayName: string;
  teacherId?: string;
  schoolId?: string;
}

export const DEFAULT_DISTRICT_SETTINGS: DistrictSettings = {
  districtKey: DISTRICT_KEY,
  districtName: 'Kecamatan Koto Balingka',
  regencyName: 'Kabupaten Pasaman Barat',
  coordinatorName: 'Drs. H. Zulkarnain, M.Pd.',
  coordinatorNip: '19690814 199403 1 006',
  checkInStart: '07:30',
  lateToleranceMinutes: 15,
  checkOutStart: '14:00',
  requireLocationVerification: true,
  requireFaceVerification: true,
  updatedByUsername: 'admin',
};
