import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { generateSalt, hashPin, verifyPin } from '../lib/crypto';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { normalizeInstagramInput, normalizeWhatsAppInput } from '../lib/socialLinks';
import {
  AccountRole,
  AttendanceRecord,
  AttendanceStatus,
  CredentialDoc,
  DEFAULT_DISTRICT_SETTINGS,
  DEFAULT_WEEKLY_SCHEDULE,
  DISTRICT_KEY,
  DistrictSettings,
  EmploymentType,
  EntityStatus,
  FaceStatus,
  FIELD_LIMITS,
  LocationStatus,
  PATTERNS,
  School,
  SchoolHoliday,
  SessionAccount,
  Teacher,
  TeacherFace,
  TeacherMessage,
  WEEKDAY_ORDER,
  WeeklySchedule,
} from '../types/attendance';

function sanitizeString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, FIELD_LIMITS.usernameMax);
}

function sanitizeNip(value: string): string {
  const trimmed = value.trim().slice(0, FIELD_LIMITS.nipMax);
  return PATTERNS.nip.test(trimmed) ? trimmed : trimmed.replace(/[^0-9\-\s]/g, '');
}

function sanitizeNpsn(value: string): string {
  const trimmed = value.trim().slice(0, FIELD_LIMITS.npsnMax);
  return PATTERNS.npsn.test(trimmed) ? trimmed : trimmed.replace(/[^0-9A-Za-z-]/g, '');
}

function sanitizeTime(value: string, allowEmpty: boolean): string {
  const trimmed = value.trim().slice(0, 5);
  if (allowEmpty && trimmed === '') return '';
  if (PATTERNS.timeHHMM.test(trimmed)) return trimmed;
  return allowEmpty ? '' : '07:30';
}

function clampLat(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-90, Math.min(90, Number(n.toFixed(6))));
}

function clampLng(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-180, Math.min(180, Number(n.toFixed(6))));
}

function clampRadius(value: number): number {
  const n = Math.round(Number(value) || 150);
  return Math.max(FIELD_LIMITS.minRadiusMeters, Math.min(FIELD_LIMITS.maxRadiusMeters, n));
}

function clampDistance(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(Number(value))) return -1;
  return Math.max(-1, Math.min(20000000, Math.round(Number(value))));
}

function sanitizeWeeklySchedule(ws?: Partial<WeeklySchedule> | null): WeeklySchedule {
  const result = {} as WeeklySchedule;
  for (const { key } of WEEKDAY_ORDER) {
    const def = DEFAULT_WEEKLY_SCHEDULE[key];
    const raw = ws?.[key];
    result[key] = {
      checkInStart: sanitizeTime(raw?.checkInStart || def.checkInStart, false),
      checkOutStart: sanitizeTime(raw?.checkOutStart || def.checkOutStart, false),
      enabled: raw?.enabled !== undefined ? Boolean(raw.enabled) : def.enabled,
    };
  }
  return result;
}

function normalizeSchool(id: string, data: Partial<Omit<School, 'id'>>): School {
  return {
    id,
    districtKey: data.districtKey || DISTRICT_KEY,
    schoolName: data.schoolName || '',
    npsn: data.npsn || '',
    address: data.address || '',
    hasLocation: Boolean(data.hasLocation),
    latitude: typeof data.latitude === 'number' ? data.latitude : 0,
    longitude: typeof data.longitude === 'number' ? data.longitude : 0,
    radiusMeters: typeof data.radiusMeters === 'number' ? data.radiusMeters : 150,
    weeklySchedule: sanitizeWeeklySchedule(data.weeklySchedule),
    status: data.status || 'aktif',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    updatedByUsername: data.updatedByUsername || 'admin',
  };
}

function normalizeSchoolHoliday(id: string, data: Partial<Omit<SchoolHoliday, 'id'>>): SchoolHoliday {
  return {
    id,
    districtKey: data.districtKey || DISTRICT_KEY,
    schoolId: data.schoolId || '',
    schoolName: data.schoolName || '',
    date: data.date || '',
    monthKey: data.monthKey || '',
    reason: data.reason || '',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    updatedByUsername: data.updatedByUsername || 'admin',
  };
}

function normalizeTeacher(id: string, data: Partial<Omit<Teacher, 'id'>>): Teacher {
  return {
    id,
    districtKey: data.districtKey || DISTRICT_KEY,
    fullName: data.fullName || '',
    nip: data.nip || '-',
    roleTitle: data.roleTitle || '',
    employmentType: data.employmentType || 'PNS',
    schoolId: data.schoolId || '',
    schoolName: data.schoolName || '',
    username: data.username || '',
    hasFacePhoto: Boolean(data.hasFacePhoto),
    bio: typeof data.bio === 'string' ? data.bio : '',
    whatsapp: typeof data.whatsapp === 'string' ? data.whatsapp : '',
    instagram: typeof data.instagram === 'string' ? data.instagram : '',
    avatarPhotoUrl: typeof data.avatarPhotoUrl === 'string' ? data.avatarPhotoUrl : '',
    coverPhotoUrl: typeof data.coverPhotoUrl === 'string' ? data.coverPhotoUrl : '',
    status: data.status || 'aktif',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    updatedByUsername: data.updatedByUsername || 'admin',
  };
}

function normalizeTeacherMessage(id: string, data: Partial<Omit<TeacherMessage, 'id'>>): TeacherMessage {
  return {
    id,
    districtKey: data.districtKey || DISTRICT_KEY,
    threadId: data.threadId || '',
    participants: Array.isArray(data.participants) ? data.participants : [],
    senderId: data.senderId || '',
    senderName: data.senderName || '',
    senderUsername: data.senderUsername || '',
    recipientId: data.recipientId || '',
    recipientName: data.recipientName || '',
    body: data.body || '',
    isRead: Boolean(data.isRead),
    createdAt: data.createdAt,
  };
}

function normalizeAttendance(id: string, data: Partial<Omit<AttendanceRecord, 'id'>>): AttendanceRecord {
  return {
    id,
    districtKey: data.districtKey || DISTRICT_KEY,
    date: data.date || '',
    monthKey: data.monthKey || '',
    teacherId: data.teacherId || '',
    teacherName: data.teacherName || '',
    teacherNip: data.teacherNip || '-',
    roleTitle: data.roleTitle || '',
    schoolId: data.schoolId || '',
    schoolName: data.schoolName || '',
    status: data.status || 'hadir',
    checkInTime: data.checkInTime || '',
    checkOutTime: data.checkOutTime || '',
    notes: data.notes || '',
    latitude: typeof data.latitude === 'number' ? data.latitude : 0,
    longitude: typeof data.longitude === 'number' ? data.longitude : 0,
    distanceMeters: typeof data.distanceMeters === 'number' ? data.distanceMeters : -1,
    locationStatus: data.locationStatus || 'not_required',
    faceStatus: data.faceStatus || 'not_required',
    faceConfidence: typeof data.faceConfidence === 'number' ? data.faceConfidence : 0,
    checkInPhotoUrl: data.checkInPhotoUrl || '',
    submittedByRole: data.submittedByRole || 'admin',
    recordedByUsername: data.recordedByUsername || 'admin',
    recordedByName: data.recordedByName || 'Administrator',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export async function ensureBootstrapData(): Promise<void> {
  try {
    const adminRef = doc(db, 'credentials', 'admin');
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      const salt = generateSalt();
      const pinHash = await hashPin(salt, '123456');
      await setDoc(adminRef, {
        username: 'admin',
        role: 'admin',
        pinSalt: salt,
        pinHash,
        teacherId: '',
        schoolId: '',
        displayName: 'Administrator Kecamatan',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUsername: 'admin',
        updatedByUsername: 'admin',
      });
    }

    const settingsRef = doc(db, 'districtSettings', 'main');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        ...DEFAULT_DISTRICT_SETTINGS,
        updatedAt: serverTimestamp(),
        updatedByUsername: 'admin',
      });
    }
  } catch (error) {
    console.warn('Bootstrap check skipped or failed:', error);
  }
}

export async function authenticateWithUsernameAndPin(
  rawUsername: string,
  rawPin: string,
  expectedRole: AccountRole
): Promise<{ session: SessionAccount; teacher: Teacher | null }> {
  const username = normalizeUsername(rawUsername);
  const pin = rawPin.trim();

  if (username.length < FIELD_LIMITS.usernameMin) {
    throw new Error('Username minimal 3 karakter.');
  }
  if (!PATTERNS.pin6.test(pin)) {
    throw new Error('PIN harus terdiri dari 6 digit angka.');
  }

  let credSnap;
  try {
    credSnap = await getDoc(doc(db, 'credentials', username));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `credentials/${username}`);
  }

  if (!credSnap.exists()) {
    throw new Error('Username tidak ditemukan. Pastikan sudah didaftarkan oleh Administrator.');
  }

  const cred = credSnap.data() as CredentialDoc;
  if (!cred.isActive) {
    throw new Error('Akun ini sedang dinonaktifkan oleh Administrator.');
  }

  if (cred.role !== expectedRole) {
    throw new Error(
      expectedRole === 'admin'
        ? 'Akun ini bukan akun Administrator.'
        : 'Akun Administrator silakan masuk melalui tombol Masuk Admin di atas.'
    );
  }

  const isPinValid = await verifyPin(cred.pinSalt, pin, cred.pinHash);
  if (!isPinValid) {
    throw new Error('PIN tidak sesuai. Silakan periksa kembali PIN 6 digit Anda.');
  }

  let teacher: Teacher | null = null;
  if (expectedRole === 'teacher') {
    if (!cred.teacherId) {
      throw new Error('Profil guru belum tertaut pada akun ini.');
    }
    let teacherSnap;
    try {
      teacherSnap = await getDoc(doc(db, 'teachers', cred.teacherId));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `teachers/${cred.teacherId}`);
    }
    if (!teacherSnap.exists()) {
      throw new Error('Data profil guru tidak ditemukan.');
    }
    teacher = normalizeTeacher(teacherSnap.id, teacherSnap.data() as Partial<Teacher>);
    if (teacher.status !== 'aktif') {
      throw new Error('Status keaktifan guru Anda sedang nonaktif.');
    }
  }

  return {
    session: {
      username: cred.username,
      role: cred.role,
      displayName: teacher ? teacher.fullName : cred.displayName,
      teacherId: teacher ? teacher.id : cred.teacherId || undefined,
      schoolId: teacher ? teacher.schoolId : cred.schoolId || undefined,
    },
    teacher,
  };
}

export function subscribeDistrictSettings(
  onData: (settings: DistrictSettings) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'districtSettings', 'main'),
    (snap) => {
      if (snap.exists()) {
        onData({
          ...DEFAULT_DISTRICT_SETTINGS,
          ...(snap.data() as Partial<DistrictSettings>),
        });
      } else {
        onData(DEFAULT_DISTRICT_SETTINGS);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'districtSettings/main');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export async function saveDistrictSettings(
  input: DistrictSettings,
  adminUsername: string
): Promise<void> {
  const payload = {
    districtKey: DISTRICT_KEY,
    districtName:
      sanitizeString(input.districtName, FIELD_LIMITS.districtNameMax) || 'Kecamatan Koto Balingka',
    regencyName: sanitizeString(input.regencyName, FIELD_LIMITS.regencyNameMax),
    coordinatorName: sanitizeString(input.coordinatorName, FIELD_LIMITS.coordinatorNameMax),
    coordinatorNip: sanitizeNip(input.coordinatorNip),
    checkInStart: sanitizeTime(input.checkInStart, false),
    lateToleranceMinutes: Math.max(0, Math.min(120, Math.round(Number(input.lateToleranceMinutes) || 0))),
    checkOutStart: sanitizeTime(input.checkOutStart, false),
    requireLocationVerification: Boolean(input.requireLocationVerification),
    requireFaceVerification: Boolean(input.requireFaceVerification),
    updatedAt: serverTimestamp(),
    updatedByUsername: normalizeUsername(adminUsername),
  };

  try {
    await setDoc(doc(db, 'districtSettings', 'main'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'districtSettings/main');
  }
}

export function subscribeSchools(
  onData: (schools: School[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'schools'), where('districtKey', '==', DISTRICT_KEY));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: School[] = snapshot.docs.map((d) =>
        normalizeSchool(d.id, d.data() as Partial<School>)
      );
      list.sort((a, b) => a.schoolName.localeCompare(b.schoolName, 'id'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'schools');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export function subscribeSchoolDoc(
  schoolId: string,
  onData: (school: School | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'schools', schoolId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData(normalizeSchool(snap.id, snap.data() as Partial<School>));
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `schools/${schoolId}`);
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export async function upsertSchool(
  input: {
    id?: string;
    schoolName: string;
    npsn: string;
    address: string;
    hasLocation: boolean;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    weeklySchedule?: WeeklySchedule;
    status: EntityStatus;
    createdAt?: unknown;
  },
  adminUsername: string
): Promise<string> {
  const schoolName = sanitizeString(input.schoolName, FIELD_LIMITS.schoolNameMax);
  if (schoolName.length < 3) throw new Error('Nama sekolah minimal 3 karakter.');
  const adminUser = normalizeUsername(adminUsername);

  const schoolId = input.id || generateId('sek');
  if (!PATTERNS.docId.test(schoolId)) throw new Error('ID sekolah tidak valid.');
  const ref = doc(db, 'schools', schoolId);

  const lat = input.hasLocation ? clampLat(input.latitude) : 0;
  const lng = input.hasLocation ? clampLng(input.longitude) : 0;
  const radius = clampRadius(input.radiusMeters);
  const weeklySchedule = sanitizeWeeklySchedule(input.weeklySchedule);
  const status: EntityStatus = input.status === 'nonaktif' ? 'nonaktif' : 'aktif';

  const hasValidCreatedAt =
    Boolean(input.createdAt) &&
    typeof input.createdAt === 'object' &&
    'seconds' in (input.createdAt as Record<string, unknown>);

  const payload = {
    districtKey: DISTRICT_KEY,
    schoolName,
    npsn: sanitizeNpsn(input.npsn),
    address: sanitizeString(input.address, FIELD_LIMITS.addressMax),
    hasLocation: Boolean(input.hasLocation),
    latitude: lat,
    longitude: lng,
    radiusMeters: radius,
    weeklySchedule,
    status,
    createdAt: input.id && hasValidCreatedAt ? input.createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  };

  try {
    await setDoc(ref, payload);
    return schoolId;
  } catch (error) {
    handleFirestoreError(
      error,
      input.id ? OperationType.UPDATE : OperationType.CREATE,
      `schools/${schoolId}`
    );
  }
}

function buildFullSchoolSchedulePayload(
  school: School,
  weeklySchedule: WeeklySchedule,
  adminUser: string
) {
  const cleanName = sanitizeString(school.schoolName, FIELD_LIMITS.schoolNameMax);
  const hasLoc = Boolean(school.hasLocation);
  const hasValidCreatedAt =
    Boolean(school.createdAt) &&
    typeof school.createdAt === 'object' &&
    'seconds' in (school.createdAt as Record<string, unknown>);
  return {
    districtKey: DISTRICT_KEY,
    schoolName: cleanName.length >= 3 ? cleanName : 'Sekolah Kecamatan',
    npsn: sanitizeNpsn(school.npsn || ''),
    address: sanitizeString(school.address || '', FIELD_LIMITS.addressMax),
    hasLocation: hasLoc,
    latitude: hasLoc ? clampLat(school.latitude) : 0,
    longitude: hasLoc ? clampLng(school.longitude) : 0,
    radiusMeters: clampRadius(school.radiusMeters),
    weeklySchedule,
    status: (school.status === 'nonaktif' ? 'nonaktif' : 'aktif') as EntityStatus,
    createdAt: hasValidCreatedAt ? school.createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  };
}

export async function saveSchoolWeeklySchedule(
  school: School,
  weeklySchedule: WeeklySchedule,
  adminUsername: string
): Promise<void> {
  const adminUser = normalizeUsername(adminUsername);
  const cleanSchedule = sanitizeWeeklySchedule(weeklySchedule);
  try {
    await setDoc(
      doc(db, 'schools', school.id),
      buildFullSchoolSchedulePayload(school, cleanSchedule, adminUser)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `schools/${school.id}`);
  }
}

export async function syncSchoolCheckOutSchedule(
  sourceSchool: School,
  targetSchools: School[],
  adminUsername: string
): Promise<number> {
  const targets = targetSchools.filter((s) => s.id !== sourceSchool.id);
  if (targets.length === 0) return 0;

  const adminUser = normalizeUsername(adminUsername);
  const srcSchedule = sanitizeWeeklySchedule(sourceSchool.weeklySchedule);
  const batch = writeBatch(db);

  for (const target of targets) {
    const targetSchedule = sanitizeWeeklySchedule(target.weeklySchedule);
    const merged = {} as WeeklySchedule;
    for (const { key } of WEEKDAY_ORDER) {
      merged[key] = {
        checkInStart: targetSchedule[key].checkInStart,
        checkOutStart: srcSchedule[key].checkOutStart,
        enabled: targetSchedule[key].enabled,
      };
    }
    batch.set(
      doc(db, 'schools', target.id),
      buildFullSchoolSchedulePayload(target, merged, adminUser)
    );
  }

  try {
    await batch.commit();
    return targets.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'schools');
  }
}

export function subscribeSchoolHolidays(
  onData: (holidays: SchoolHoliday[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'schoolHolidays'), where('districtKey', '==', DISTRICT_KEY));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        normalizeSchoolHoliday(d.id, d.data() as Partial<SchoolHoliday>)
      );
      list.sort((a, b) => a.date.localeCompare(b.date));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'schoolHolidays');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export async function addSchoolHoliday(
  input: {
    school: School;
    date: string;
    reason: string;
  },
  adminUsername: string
): Promise<void> {
  const date = input.date.trim();
  if (!PATTERNS.dateYMD.test(date)) {
    throw new Error('Format tanggal hari cuti harus YYYY-MM-DD.');
  }
  const reason = sanitizeString(input.reason, FIELD_LIMITS.holidayReasonMax);
  if (reason.length < 2) {
    throw new Error('Keterangan hari cuti/libur minimal 2 karakter.');
  }
  const holidayId = `${input.school.id}_${date}`;
  const adminUser = normalizeUsername(adminUsername);

  try {
    await setDoc(doc(db, 'schoolHolidays', holidayId), {
      districtKey: DISTRICT_KEY,
      schoolId: input.school.id,
      schoolName: sanitizeString(input.school.schoolName, FIELD_LIMITS.schoolNameMax),
      date,
      monthKey: date.slice(0, 7),
      reason,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUsername: adminUser,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `schoolHolidays/${holidayId}`);
  }
}

export async function deleteSchoolHoliday(holidayId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'schoolHolidays', holidayId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `schoolHolidays/${holidayId}`);
  }
}

export async function deleteSchool(schoolId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'schools', schoolId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `schools/${schoolId}`);
  }
}

export function subscribeTeachers(
  onData: (teachers: Teacher[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'teachers'), where('districtKey', '==', DISTRICT_KEY));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Teacher[] = snapshot.docs.map((d) =>
        normalizeTeacher(d.id, d.data() as Partial<Teacher>)
      );
      list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'teachers');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export function subscribeTeacherDoc(
  teacherId: string,
  onData: (teacher: Teacher | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'teachers', teacherId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData(normalizeTeacher(snap.id, snap.data() as Partial<Teacher>));
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `teachers/${teacherId}`);
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export interface RegisterTeacherInput {
  fullName: string;
  nip: string;
  roleTitle: string;
  employmentType: EmploymentType;
  school: School;
  username: string;
  pin: string;
  status: EntityStatus;
  referencePhotoDataUrl?: string;
}

export async function registerTeacherWithCredential(
  input: RegisterTeacherInput,
  adminUsername: string
): Promise<string> {
  const adminUser = normalizeUsername(adminUsername);
  const fullName = sanitizeString(input.fullName, FIELD_LIMITS.fullNameMax);
  const roleTitle = sanitizeString(input.roleTitle, FIELD_LIMITS.roleTitleMax);
  const username = normalizeUsername(input.username);
  const pin = input.pin.trim();

  if (fullName.length < 2) throw new Error('Nama guru minimal 2 karakter.');
  if (roleTitle.length < 2) throw new Error('Jabatan minimal 2 karakter.');
  if (username.length < FIELD_LIMITS.usernameMin || !PATTERNS.username.test(username)) {
    throw new Error('Username minimal 3 karakter (huruf kecil, angka, - atau _).');
  }
  if (!PATTERNS.pin6.test(pin)) {
    throw new Error('PIN guru wajib 6 digit angka.');
  }

  const photoUrl = input.referencePhotoDataUrl?.trim() || '';
  if (photoUrl && photoUrl.length > FIELD_LIMITS.facePhotoMax) {
    throw new Error('Ukuran foto referensi wajah terlalu besar.');
  }
  const hasFacePhoto = photoUrl.length >= 20;

  const existingCred = await getDoc(doc(db, 'credentials', username));
  if (existingCred.exists()) {
    throw new Error(`Username "${username}" sudah digunakan. Silakan pilih username lain.`);
  }

  const teacherId = generateId('guru');
  const salt = generateSalt();
  const pinHash = await hashPin(salt, pin);

  const batch = writeBatch(db);
  batch.set(doc(db, 'teachers', teacherId), {
    districtKey: DISTRICT_KEY,
    fullName,
    nip: sanitizeNip(input.nip) || '-',
    roleTitle,
    employmentType: input.employmentType,
    schoolId: input.school.id,
    schoolName: sanitizeString(input.school.schoolName, FIELD_LIMITS.schoolNameMax),
    username,
    hasFacePhoto,
    bio: '',
    whatsapp: '',
    instagram: '',
    avatarPhotoUrl: '',
    coverPhotoUrl: '',
    status: input.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  });

  batch.set(doc(db, 'credentials', username), {
    username,
    role: 'teacher',
    pinSalt: salt,
    pinHash,
    teacherId,
    schoolId: input.school.id,
    displayName: fullName,
    isActive: input.status === 'aktif',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdByUsername: adminUser,
    updatedByUsername: adminUser,
  });

  if (hasFacePhoto) {
    batch.set(doc(db, 'teacherFaces', teacherId), {
      teacherId,
      photoDataUrl: photoUrl,
      updatedAt: serverTimestamp(),
      updatedByUsername: adminUser,
    });
  }

  try {
    await batch.commit();
    return teacherId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `teachers/${teacherId}`);
  }
}

export async function updateTeacherProfile(
  teacher: Teacher,
  updates: {
    fullName: string;
    nip: string;
    roleTitle: string;
    employmentType: EmploymentType;
    school: School;
    status: EntityStatus;
    referencePhotoDataUrl?: string | null;
  },
  adminUsername: string
): Promise<void> {
  const adminUser = normalizeUsername(adminUsername);
  const fullName = sanitizeString(updates.fullName, FIELD_LIMITS.fullNameMax);
  const roleTitle = sanitizeString(updates.roleTitle, FIELD_LIMITS.roleTitleMax);
  if (fullName.length < 2) throw new Error('Nama guru minimal 2 karakter.');
  if (roleTitle.length < 2) throw new Error('Jabatan minimal 2 karakter.');

  const newPhoto =
    typeof updates.referencePhotoDataUrl === 'string' ? updates.referencePhotoDataUrl.trim() : undefined;
  if (newPhoto && newPhoto.length > FIELD_LIMITS.facePhotoMax) {
    throw new Error('Ukuran foto referensi wajah terlalu besar.');
  }

  let nextHasFacePhoto = Boolean(teacher.hasFacePhoto);
  if (updates.referencePhotoDataUrl === null) {
    nextHasFacePhoto = false;
  } else if (newPhoto && newPhoto.length >= 20) {
    nextHasFacePhoto = true;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'teachers', teacher.id), {
    fullName,
    nip: sanitizeNip(updates.nip) || '-',
    roleTitle,
    employmentType: updates.employmentType,
    schoolId: updates.school.id,
    schoolName: sanitizeString(updates.school.schoolName, FIELD_LIMITS.schoolNameMax),
    username: teacher.username,
    hasFacePhoto: nextHasFacePhoto,
    bio: (teacher.bio || '').slice(0, FIELD_LIMITS.bioMax),
    whatsapp: normalizeWhatsAppInput(teacher.whatsapp || ''),
    instagram: normalizeInstagramInput(teacher.instagram || ''),
    avatarPhotoUrl: (teacher.avatarPhotoUrl || '').slice(0, FIELD_LIMITS.avatarPhotoMax),
    coverPhotoUrl: (teacher.coverPhotoUrl || '').slice(0, FIELD_LIMITS.coverPhotoMax),
    status: updates.status,
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  });

  batch.update(doc(db, 'credentials', teacher.username), {
    displayName: fullName,
    schoolId: updates.school.id,
    isActive: updates.status === 'aktif',
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  });

  if (newPhoto && newPhoto.length >= 20) {
    batch.set(doc(db, 'teacherFaces', teacher.id), {
      teacherId: teacher.id,
      photoDataUrl: newPhoto,
      updatedAt: serverTimestamp(),
      updatedByUsername: adminUser,
    });
  } else if (updates.referencePhotoDataUrl === null) {
    batch.delete(doc(db, 'teacherFaces', teacher.id));
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teachers/${teacher.id}`);
  }
}

export async function customizeTeacherProfile(
  teacher: Teacher,
  updates: {
    bio: string;
    whatsapp?: string;
    instagram?: string;
    avatarPhotoUrl: string;
    coverPhotoUrl: string;
  }
): Promise<void> {
  const cleanBio = sanitizeString(updates.bio, FIELD_LIMITS.bioMax);
  const cleanWhatsapp = normalizeWhatsAppInput(updates.whatsapp ?? teacher.whatsapp ?? '');
  const cleanInstagram = normalizeInstagramInput(updates.instagram ?? teacher.instagram ?? '');
  const cleanAvatar = updates.avatarPhotoUrl.trim();
  const cleanCover = updates.coverPhotoUrl.trim();

  if (cleanAvatar.length > FIELD_LIMITS.avatarPhotoMax) {
    throw new Error('Ukuran foto profil terlalu besar.');
  }
  if (cleanCover.length > FIELD_LIMITS.coverPhotoMax) {
    throw new Error('Ukuran foto sampul terlalu besar.');
  }

  try {
    await updateDoc(doc(db, 'teachers', teacher.id), {
      bio: cleanBio,
      whatsapp: cleanWhatsapp,
      instagram: cleanInstagram,
      avatarPhotoUrl: cleanAvatar,
      coverPhotoUrl: cleanCover,
      updatedAt: serverTimestamp(),
      updatedByUsername: teacher.username,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teachers/${teacher.id}`);
  }
}

export function buildMessageThreadId(teacherAId: string, teacherBId: string): string {
  return [teacherAId, teacherBId].sort().join('__');
}

export function subscribeTeacherMessages(
  teacherId: string,
  onData: (messages: TeacherMessage[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'teacherMessages'), where('districtKey', '==', DISTRICT_KEY));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => normalizeTeacherMessage(d.id, d.data() as Partial<TeacherMessage>))
        .filter((m) => m.participants.includes(teacherId));
      list.sort((a, b) => {
        const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        return ta - tb;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'teacherMessages');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export async function sendTeacherMessage(payload: {
  sender: Teacher;
  recipient: Teacher;
  body: string;
}): Promise<void> {
  const cleanBody = sanitizeString(payload.body, FIELD_LIMITS.messageBodyMax);
  if (!cleanBody) {
    throw new Error('Pesan tidak boleh kosong.');
  }
  if (payload.sender.id === payload.recipient.id) {
    throw new Error('Tidak dapat mengirim pesan ke akun sendiri.');
  }
  const msgId = generateId('msg');
  const threadId = buildMessageThreadId(payload.sender.id, payload.recipient.id);

  try {
    await setDoc(doc(db, 'teacherMessages', msgId), {
      districtKey: DISTRICT_KEY,
      threadId,
      participants: [payload.sender.id, payload.recipient.id],
      senderId: payload.sender.id,
      senderName: sanitizeString(payload.sender.fullName, FIELD_LIMITS.fullNameMax),
      senderUsername: payload.sender.username,
      recipientId: payload.recipient.id,
      recipientName: sanitizeString(payload.recipient.fullName, FIELD_LIMITS.fullNameMax),
      body: cleanBody,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `teacherMessages/${msgId}`);
  }
}

export async function markThreadMessagesRead(
  messages: TeacherMessage[],
  currentTeacherId: string
): Promise<void> {
  const unread = messages.filter(
    (m) => m.recipientId === currentTeacherId && !m.isRead
  );
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  for (const m of unread) {
    batch.update(doc(db, 'teacherMessages', m.id), { isRead: true });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'teacherMessages');
  }
}

export async function fetchTeacherReferenceFace(teacherId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'teacherFaces', teacherId));
    if (!snap.exists()) return null;
    const data = snap.data() as TeacherFace;
    return data.photoDataUrl || null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `teacherFaces/${teacherId}`);
  }
}

export async function uploadTeacherReferenceFace(
  teacher: Teacher,
  photoDataUrl: string,
  adminUsername: string
): Promise<void> {
  const cleanUrl = photoDataUrl.trim();
  if (cleanUrl.length < 20 || cleanUrl.length > FIELD_LIMITS.facePhotoMax) {
    throw new Error('Ukuran atau format foto wajah tidak valid.');
  }
  const adminUser = normalizeUsername(adminUsername);
  const batch = writeBatch(db);
  batch.set(doc(db, 'teacherFaces', teacher.id), {
    teacherId: teacher.id,
    photoDataUrl: cleanUrl,
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  });
  batch.update(doc(db, 'teachers', teacher.id), {
    fullName: teacher.fullName,
    nip: teacher.nip || '-',
    roleTitle: teacher.roleTitle,
    employmentType: teacher.employmentType,
    schoolId: teacher.schoolId,
    schoolName: teacher.schoolName,
    username: teacher.username,
    hasFacePhoto: true,
    status: teacher.status,
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `teacherFaces/${teacher.id}`);
  }
}

export async function removeTeacherReferenceFace(
  teacher: Teacher,
  adminUsername: string
): Promise<void> {
  const adminUser = normalizeUsername(adminUsername);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'teacherFaces', teacher.id));
  batch.update(doc(db, 'teachers', teacher.id), {
    fullName: teacher.fullName,
    nip: teacher.nip || '-',
    roleTitle: teacher.roleTitle,
    employmentType: teacher.employmentType,
    schoolId: teacher.schoolId,
    schoolName: teacher.schoolName,
    username: teacher.username,
    hasFacePhoto: false,
    status: teacher.status,
    updatedAt: serverTimestamp(),
    updatedByUsername: adminUser,
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `teacherFaces/${teacher.id}`);
  }
}

export async function verifyLivenessWithServer(payload: {
  step: 'blink' | 'smile';
  frames: string[];
  teacherName: string;
}): Promise<{
  passed: boolean;
  isLivePerson: boolean;
  confidence: number;
  reason: string;
}> {
  const response = await fetch('/api/verify-liveness', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as {
    passed?: boolean;
    isLivePerson?: boolean;
    confidence?: number;
    reason?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || 'Layanan verifikasi wajah gagal merespons.');
  }
  return {
    passed: Boolean(data.passed),
    isLivePerson: Boolean(data.isLivePerson),
    confidence: Math.max(0, Math.min(100, Math.round(Number(data.confidence) || 0))),
    reason: String(data.reason || 'Pemeriksaan selesai.'),
  };
}

export async function resetTeacherPin(
  teacher: Teacher,
  newPin: string,
  adminUsername: string
): Promise<void> {
  const pin = newPin.trim();
  if (!PATTERNS.pin6.test(pin)) {
    throw new Error('PIN baru wajib 6 digit angka.');
  }
  const salt = generateSalt();
  const pinHash = await hashPin(salt, pin);

  try {
    await updateDoc(doc(db, 'credentials', teacher.username), {
      pinSalt: salt,
      pinHash,
      updatedAt: serverTimestamp(),
      updatedByUsername: normalizeUsername(adminUsername),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `credentials/${teacher.username}`);
  }
}

export async function deleteTeacherAndCredential(teacher: Teacher): Promise<void> {
  try {
    await deleteDoc(doc(db, 'credentials', teacher.username)).catch(() => undefined);
    await deleteDoc(doc(db, 'teacherFaces', teacher.id)).catch(() => undefined);
    await deleteDoc(doc(db, 'teachers', teacher.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `teachers/${teacher.id}`);
  }
}

export async function changeAdminPin(
  adminUsername: string,
  currentPin: string,
  newPin: string
): Promise<void> {
  const uname = normalizeUsername(adminUsername);
  if (!PATTERNS.pin6.test(newPin.trim())) {
    throw new Error('PIN baru harus 6 digit angka.');
  }

  const snap = await getDoc(doc(db, 'credentials', uname));
  if (!snap.exists()) throw new Error('Akun administrator tidak ditemukan.');
  const cred = snap.data() as CredentialDoc;
  const ok = await verifyPin(cred.pinSalt, currentPin.trim(), cred.pinHash);
  if (!ok) throw new Error('PIN saat ini tidak sesuai.');

  const newSalt = generateSalt();
  const newHash = await hashPin(newSalt, newPin.trim());

  try {
    await updateDoc(doc(db, 'credentials', uname), {
      pinSalt: newSalt,
      pinHash: newHash,
      updatedAt: serverTimestamp(),
      updatedByUsername: uname,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `credentials/${uname}`);
  }
}

export async function registerAdditionalAdmin(
  newUsername: string,
  displayName: string,
  pin: string,
  currentAdminUsername: string
): Promise<void> {
  const uname = normalizeUsername(newUsername);
  const name = sanitizeString(displayName, 100);
  if (uname.length < 3 || !PATTERNS.username.test(uname)) {
    throw new Error('Username minimal 3 karakter (huruf kecil, angka, - atau _).');
  }
  if (!PATTERNS.pin6.test(pin.trim())) {
    throw new Error('PIN wajib 6 digit angka.');
  }
  if (name.length < 2) throw new Error('Nama administrator minimal 2 karakter.');

  const existing = await getDoc(doc(db, 'credentials', uname));
  if (existing.exists()) throw new Error(`Username "${uname}" sudah terdaftar.`);

  const salt = generateSalt();
  const pinHash = await hashPin(salt, pin.trim());

  try {
    await setDoc(doc(db, 'credentials', uname), {
      username: uname,
      role: 'admin',
      pinSalt: salt,
      pinHash,
      teacherId: '',
      schoolId: '',
      displayName: name,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUsername: normalizeUsername(currentAdminUsername),
      updatedByUsername: normalizeUsername(currentAdminUsername),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `credentials/${uname}`);
  }
}

export function subscribeAttendanceByDate(
  dateStr: string,
  onData: (records: AttendanceRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'attendance'),
    where('districtKey', '==', DISTRICT_KEY),
    where('date', '==', dateStr)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        normalizeAttendance(d.id, d.data() as Partial<AttendanceRecord>)
      );
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'attendance');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export function subscribeAttendanceByMonth(
  monthKey: string,
  onData: (records: AttendanceRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'attendance'),
    where('districtKey', '==', DISTRICT_KEY),
    where('monthKey', '==', monthKey)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        normalizeAttendance(d.id, d.data() as Partial<AttendanceRecord>)
      );
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'attendance');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export function subscribeTeacherMonthlyAttendance(
  teacherId: string,
  monthKey: string,
  onData: (records: AttendanceRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'attendance'),
    where('districtKey', '==', DISTRICT_KEY),
    where('monthKey', '==', monthKey),
    where('teacherId', '==', teacherId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) =>
        normalizeAttendance(d.id, d.data() as Partial<AttendanceRecord>)
      );
      list.sort((a, b) => b.date.localeCompare(a.date));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'attendance');
      } catch (err) {
        onError(err as Error);
      }
    }
  );
}

export interface AttendanceVerificationInput {
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  locationStatus?: LocationStatus;
  faceStatus?: FaceStatus;
  faceConfidence?: number;
  checkInPhotoUrl?: string;
}

export async function saveAttendanceRecord(input: {
  date: string;
  teacher: Teacher;
  status: AttendanceStatus;
  checkInTime: string;
  checkOutTime: string;
  notes: string;
  verification?: AttendanceVerificationInput;
  submittedByRole: AccountRole;
  recordedByUsername: string;
  recordedByName: string;
  existingRecord?: AttendanceRecord;
}): Promise<void> {
  const date = input.date.trim();
  if (!PATTERNS.dateYMD.test(date)) throw new Error('Format tanggal harus YYYY-MM-DD.');
  const monthKey = date.slice(0, 7);
  const attendanceId = `${date}_${input.teacher.id}`;
  const ref = doc(db, 'attendance', attendanceId);

  const cleanCheckIn = sanitizeTime(input.checkInTime, true);
  const cleanCheckOut = sanitizeTime(input.checkOutTime, true);
  const cleanNotes = sanitizeString(input.notes, FIELD_LIMITS.notesMax);
  const recUser = normalizeUsername(input.recordedByUsername);
  const recName = sanitizeString(input.recordedByName, 100);

  const v = input.verification;
  const lat = clampLat(v?.latitude ?? input.existingRecord?.latitude ?? 0);
  const lng = clampLng(v?.longitude ?? input.existingRecord?.longitude ?? 0);
  const distanceMeters = clampDistance(
    v?.distanceMeters ?? input.existingRecord?.distanceMeters ?? -1
  );
  const locationStatus: LocationStatus =
    v?.locationStatus ?? input.existingRecord?.locationStatus ?? 'not_required';
  const faceStatus: FaceStatus = v?.faceStatus ?? input.existingRecord?.faceStatus ?? 'not_required';
  const faceConfidence = Math.max(
    0,
    Math.min(100, Math.round(v?.faceConfidence ?? input.existingRecord?.faceConfidence ?? 0))
  );
  const checkInPhotoUrl = (
    v?.checkInPhotoUrl ??
    input.existingRecord?.checkInPhotoUrl ??
    ''
  ).slice(0, FIELD_LIMITS.checkInPhotoMax);

  if (input.existingRecord) {
    if (input.submittedByRole === 'teacher') {
      try {
        await updateDoc(ref, {
          checkOutTime: cleanCheckOut,
          notes: cleanNotes,
          submittedByRole: 'teacher',
          recordedByUsername: recUser,
          recordedByName: recName,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `attendance/${attendanceId}`);
      }
      return;
    }

    try {
      await updateDoc(ref, {
        status: input.status,
        checkInTime: cleanCheckIn,
        checkOutTime: cleanCheckOut,
        notes: cleanNotes,
        teacherName: sanitizeString(input.teacher.fullName, FIELD_LIMITS.fullNameMax),
        teacherNip: sanitizeNip(input.teacher.nip),
        roleTitle: sanitizeString(input.teacher.roleTitle, FIELD_LIMITS.roleTitleMax),
        schoolId: input.teacher.schoolId,
        schoolName: sanitizeString(input.teacher.schoolName, FIELD_LIMITS.schoolNameMax),
        latitude: lat,
        longitude: lng,
        distanceMeters,
        locationStatus,
        faceStatus,
        faceConfidence,
        checkInPhotoUrl,
        submittedByRole: 'admin',
        recordedByUsername: recUser,
        recordedByName: recName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `attendance/${attendanceId}`);
    }
    return;
  }

  try {
    await setDoc(ref, {
      districtKey: DISTRICT_KEY,
      date,
      monthKey,
      teacherId: input.teacher.id,
      teacherName: sanitizeString(input.teacher.fullName, FIELD_LIMITS.fullNameMax),
      teacherNip: sanitizeNip(input.teacher.nip),
      roleTitle: sanitizeString(input.teacher.roleTitle, FIELD_LIMITS.roleTitleMax),
      schoolId: input.teacher.schoolId,
      schoolName: sanitizeString(input.teacher.schoolName, FIELD_LIMITS.schoolNameMax),
      status: input.status,
      checkInTime: cleanCheckIn,
      checkOutTime: cleanCheckOut,
      notes: cleanNotes,
      latitude: lat,
      longitude: lng,
      distanceMeters,
      locationStatus,
      faceStatus,
      faceConfidence,
      checkInPhotoUrl,
      submittedByRole: input.submittedByRole,
      recordedByUsername: recUser,
      recordedByName: recName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `attendance/${attendanceId}`);
  }
}

export async function markRemainingTeachersPresent(
  date: string,
  teachers: Teacher[],
  existingMap: Map<string, AttendanceRecord>,
  checkInTime: string,
  adminUsername: string,
  adminDisplayName: string
): Promise<number> {
  const pending = teachers.filter((t) => t.status === 'aktif' && !existingMap.has(t.id));
  if (pending.length === 0) return 0;

  const monthKey = date.slice(0, 7);
  const cleanTime = sanitizeTime(checkInTime, false);
  const recUser = normalizeUsername(adminUsername);
  const recName = sanitizeString(adminDisplayName, 100);
  const batch = writeBatch(db);

  for (const teacher of pending) {
    const attendanceId = `${date}_${teacher.id}`;
    batch.set(doc(db, 'attendance', attendanceId), {
      districtKey: DISTRICT_KEY,
      date,
      monthKey,
      teacherId: teacher.id,
      teacherName: sanitizeString(teacher.fullName, FIELD_LIMITS.fullNameMax),
      teacherNip: sanitizeNip(teacher.nip),
      roleTitle: sanitizeString(teacher.roleTitle, FIELD_LIMITS.roleTitleMax),
      schoolId: teacher.schoolId,
      schoolName: sanitizeString(teacher.schoolName, FIELD_LIMITS.schoolNameMax),
      status: 'hadir',
      checkInTime: cleanTime,
      checkOutTime: '',
      notes: 'Dicatat serentak oleh Administrator',
      latitude: 0,
      longitude: 0,
      distanceMeters: -1,
      locationStatus: 'not_required',
      faceStatus: 'not_required',
      faceConfidence: 0,
      checkInPhotoUrl: '',
      submittedByRole: 'admin',
      recordedByUsername: recUser,
      recordedByName: recName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return pending.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'attendance');
  }
}

export async function deleteAttendanceRecord(attendanceId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'attendance', attendanceId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `attendance/${attendanceId}`);
  }
}

export async function seedSampleDistrictData(adminUsername: string): Promise<void> {
  const adminUser = normalizeUsername(adminUsername);

  const sampleSchools = [
    {
      id: 'sdn11-kotobalingka',
      schoolName: 'SDN 11 Koto Balingka',
      npsn: '10304511',
      address: 'Jorong Koto Balingka, Kenagarian Parit',
      hasLocation: false,
      latitude: 0,
      longitude: 0,
      radiusMeters: 150,
    },
    {
      id: 'sdn02-kotobalingka',
      schoolName: 'SDN 02 Sungai Beremas',
      npsn: '10304502',
      address: 'Jorong Sungai Beremas, Kec. Koto Balingka',
      hasLocation: false,
      latitude: 0,
      longitude: 0,
      radiusMeters: 150,
    },
    {
      id: 'sdn05-kotobalingka',
      schoolName: 'SDN 05 Lubuk Hilir',
      npsn: '10304505',
      address: 'Jorong Lubuk Hilir, Kec. Koto Balingka',
      hasLocation: false,
      latitude: 0,
      longitude: 0,
      radiusMeters: 150,
    },
  ];

  const sampleTeachers: Array<{
    id: string;
    fullName: string;
    nip: string;
    roleTitle: string;
    employmentType: EmploymentType;
    schoolId: string;
    schoolName: string;
    username: string;
    pin: string;
  }> = [
    {
      id: 'guru-rahmawati',
      fullName: 'Hj. Rahmawati, S.Pd., M.Pd.',
      nip: '19720415 199603 2 004',
      roleTitle: 'Kepala Sekolah',
      employmentType: 'PNS',
      schoolId: 'sdn11-kotobalingka',
      schoolName: 'SDN 11 Koto Balingka',
      username: 'rahmawati',
      pin: '112233',
    },
    {
      id: 'guru-hendra',
      fullName: 'Hendrawan Putra, S.Pd.',
      nip: '19871104 201903 1 005',
      roleTitle: 'Guru Kelas IV',
      employmentType: 'PNS',
      schoolId: 'sdn11-kotobalingka',
      schoolName: 'SDN 11 Koto Balingka',
      username: 'hendra',
      pin: '112233',
    },
    {
      id: 'guru-sari',
      fullName: 'Yuliana Sari, S.Pd.SD',
      nip: '19830521 200902 2 003',
      roleTitle: 'Guru Kelas V',
      employmentType: 'PNS',
      schoolId: 'sdn02-kotobalingka',
      schoolName: 'SDN 02 Sungai Beremas',
      username: 'sari',
      pin: '112233',
    },
    {
      id: 'guru-rizki',
      fullName: 'Rizki Fauzan, S.Pd.',
      nip: '19940317 202321 1 009',
      roleTitle: 'Guru PJOK',
      employmentType: 'PPPK',
      schoolId: 'sdn02-kotobalingka',
      schoolName: 'SDN 02 Sungai Beremas',
      username: 'rizki',
      pin: '112233',
    },
    {
      id: 'guru-marnis',
      fullName: 'Marnis Susanti, S.Pd.',
      nip: '19890218 202221 2 011',
      roleTitle: 'Guru Kelas III',
      employmentType: 'PPPK',
      schoolId: 'sdn05-kotobalingka',
      schoolName: 'SDN 05 Lubuk Hilir',
      username: 'marnis',
      pin: '112233',
    },
    {
      id: 'guru-budi',
      fullName: 'Budi Santoso, S.Pd.I.',
      nip: '-',
      roleTitle: 'Guru PAI',
      employmentType: 'Honorer',
      schoolId: 'sdn05-kotobalingka',
      schoolName: 'SDN 05 Lubuk Hilir',
      username: 'budi',
      pin: '112233',
    },
  ];

  const batch = writeBatch(db);

  for (const s of sampleSchools) {
    batch.set(doc(db, 'schools', s.id), {
      districtKey: DISTRICT_KEY,
      schoolName: s.schoolName,
      npsn: s.npsn,
      address: s.address,
      hasLocation: s.hasLocation,
      latitude: s.latitude,
      longitude: s.longitude,
      radiusMeters: s.radiusMeters,
      weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
      status: 'aktif',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUsername: adminUser,
    });
  }

  for (const t of sampleTeachers) {
    const salt = generateSalt();
    const pinHash = await hashPin(salt, t.pin);

    batch.set(doc(db, 'teachers', t.id), {
      districtKey: DISTRICT_KEY,
      fullName: t.fullName,
      nip: t.nip,
      roleTitle: t.roleTitle,
      employmentType: t.employmentType,
      schoolId: t.schoolId,
      schoolName: t.schoolName,
      username: t.username,
      hasFacePhoto: false,
      bio: '',
      whatsapp: '',
      instagram: '',
      avatarPhotoUrl: '',
      coverPhotoUrl: '',
      status: 'aktif',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUsername: adminUser,
    });

    batch.set(doc(db, 'credentials', t.username), {
      username: t.username,
      role: 'teacher',
      pinSalt: salt,
      pinHash,
      teacherId: t.id,
      schoolId: t.schoolId,
      displayName: t.fullName,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUsername: adminUser,
      updatedByUsername: adminUser,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'schools');
  }
}
