import {
  AttendanceStatus,
  DayOfWeekKey,
  DaySchedule,
  DEFAULT_WEEKLY_SCHEDULE,
  DistrictSettings,
  School,
} from '../types/attendance';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function getTodayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(now: Date = new Date()): string {
  return getTodayDateString(now).slice(0, 7);
}

export function getCurrentTimeHHMM(now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getCurrentTimeWithSeconds(now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function getDayOfWeekKey(dateStr: string): DayOfWeekKey | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dayIndex = new Date(y, m - 1, d).getDay();
  const map: Record<number, DayOfWeekKey> = {
    1: 'senin',
    2: 'selasa',
    3: 'rabu',
    4: 'kamis',
    5: 'jumat',
    6: 'sabtu',
  };
  return map[dayIndex] ?? null;
}

export function getEffectiveDaySchedule(
  dateStr: string,
  school: School | null,
  settings: DistrictSettings
): { dayKey: DayOfWeekKey | null; schedule: DaySchedule } {
  const dayKey = getDayOfWeekKey(dateStr);
  if (!dayKey) {
    return {
      dayKey: null,
      schedule: {
        checkInStart: settings.checkInStart,
        checkOutStart: settings.checkOutStart,
        enabled: false,
      },
    };
  }
  const schoolDay = school?.weeklySchedule?.[dayKey] ?? DEFAULT_WEEKLY_SCHEDULE[dayKey];
  return {
    dayKey,
    schedule: {
      checkInStart: schoolDay?.checkInStart || settings.checkInStart,
      checkOutStart: schoolDay?.checkOutStart || settings.checkOutStart,
      enabled: schoolDay?.enabled ?? true,
    },
  };
}

export function formatIndonesianDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  const dayName = HARI_ID[dateObj.getDay()] ?? '';
  const monthName = BULAN_ID[m - 1] ?? '';
  return `${dayName}, ${d} ${monthName} ${y}`;
}

export function formatIndonesianMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const monthName = BULAN_ID[m - 1] ?? '';
  return `${monthName} ${y}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function computeCheckInStatus(
  actualHHMM: string,
  checkInStart: string,
  toleranceMinutes: number
): 'hadir' | 'terlambat' {
  const actual = timeToMinutes(actualHHMM);
  const limit = timeToMinutes(checkInStart) + toleranceMinutes;
  return actual > limit ? 'terlambat' : 'hadir';
}

export function countSchoolDaysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return 22;
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = getTodayDateString();
  const isCurrentMonth = todayStr.slice(0, 7) === monthKey;
  const maxDay = isCurrentMonth ? Math.min(daysInMonth, Number(todayStr.slice(8, 10))) : daysInMonth;

  let count = 0;
  for (let d = 1; d <= maxDay; d++) {
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    // Indonesian SD usually operates Senin–Sabtu (1-6)
    if (dayOfWeek >= 1 && dayOfWeek <= 6) {
      count += 1;
    }
  }
  return Math.max(count, 1);
}

export function getStatusLabel(status: AttendanceStatus | 'belum'): string {
  switch (status) {
    case 'hadir':
      return 'Hadir';
    case 'terlambat':
      return 'Terlambat';
    case 'izin':
      return 'Izin';
    case 'sakit':
      return 'Sakit';
    case 'alpa':
      return 'Alpa';
    case 'belum':
    default:
      return 'Belum Absen';
  }
}

export function getInitials(fullName: string): string {
  const cleaned = fullName.replace(/^(Hj\.|H\.|Drs\.|Dr\.)\s+/i, '').split(',')[0].trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
