// =============================================================================
// Date Utilities
// Centralized date handling for calendar and scheduling
// =============================================================================

/**
 * Get the start of a week (Monday) for a given date
 */
export const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust for Monday start (day 0 = Sunday in JS, we want Monday = 0)
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get the end of a week (Sunday) for a given date
 */
export const getWeekEnd = (date: Date): Date => {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

/**
 * Format date to ISO string (YYYY-MM-DD) using LOCAL date components
 * This prevents timezone shifting when converting to UTC
 * 
 * @param date Date object (can be UTC or local)
 * @returns Local date string in YYYY-MM-DD format
 * 
 * Example:
 * - Date: 2026-01-20 23:30:00 EST (UTC: 2026-01-21 04:30:00)
 * - toISODate() returns: "2026-01-20" (local date, not UTC)
 */
export const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format date to ISO string (YYYY-MM-DD) using UTC date components
 * Use this when you explicitly need UTC date (e.g., for API contracts)
 * 
 * @param date Date object
 * @returns UTC date string in YYYY-MM-DD format
 */
export const toISODateUTC = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Format date to ISO datetime string
 */
export const toISODateTime = (date: Date): string => {
  return date.toISOString();
};

/**
 * Format time to 24h format (HH:mm)
 */
export const toTime24h = (date: Date): string => {
  return date.toTimeString().slice(0, 5);
};

/**
 * Format time to 12h format (h:mm AM/PM)
 */
export const toTime12h = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
};

/**
 * Parse time string (HH:mm) to minutes since midnight
 */
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Convert minutes since midnight to time string (HH:mm)
 */
export const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

/**
 * UNIVERSAL DAY INDEXING SYSTEM
 * dlulu uses: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
 * JavaScript Date.getDay() uses: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
 */

/**
 * Convert JavaScript Date.getDay() (0=Sun) to dlulu day index (0=Mon)
 * @param jsDay JavaScript day (0=Sunday, 6=Saturday)
 * @returns dlulu day index (0=Monday, 6=Sunday)
 */
export const jsDayToDluluDay = (jsDay: number): number => {
  // JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  // dlulu: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
};

/**
 * Convert dlulu day index (0=Mon) to JavaScript Date.getDay() (0=Sun)
 * @param dluluDay dlulu day index (0=Monday, 6=Sunday)
 * @returns JavaScript day (0=Sunday, 6=Saturday)
 */
export const dluluDayToJsDay = (dluluDay: number): number => {
  // dlulu: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  // JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  return (dluluDay + 1) % 7;
};

/**
 * Get day offset (0=Monday, 6=Sunday) from a date
 * @deprecated Use jsDayToDluluDay(date.getDay()) instead for clarity
 */
export const getDayOffset = (date: Date): number => {
  return jsDayToDluluDay(date.getDay());
};

/**
 * Standard weekday array (Monday-Friday) in dlulu indexing
 */
export const WEEKDAYS_DLULU = [0, 1, 2, 3, 4] as const; // Mon-Fri

/**
 * Standard weekend array (Saturday-Sunday) in dlulu indexing
 */
export const WEEKEND_DLULU = [5, 6] as const; // Sat-Sun

/**
 * Get date from week start and day offset
 */
export const getDateFromOffset = (weekStart: Date, dayOffset: number): Date => {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + dayOffset);
  return date;
};

/**
 * Combine date and time into a single Date object
 */
export const combineDateAndTime = (date: Date, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

/**
 * Get display format for date (Jan 15, 2025)
 */
export const formatDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

/**
 * Get short display format (Jan 15)
 */
export const formatShortDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
};

/**
 * Get day name (Monday)
 */
export const getDayName = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

/**
 * Get short day name (Mon)
 */
export const getShortDayName = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

/**
 * Get relative date label (Today, Tomorrow, Yesterday, or date)
 */
export const getRelativeLabel = (date: Date): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 7) return getDayName(date);
  return formatShortDate(date);
};

/**
 * Check if two dates are the same day
 */
export const isSameDay = (date1: Date, date2: Date): boolean => {
  return date1.toDateString() === date2.toDateString();
};

/**
 * Check if date is today
 */
export const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

/**
 * Check if date is in the past
 */
export const isPast = (date: Date): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return target < today;
};

/**
 * Get dates for a week (Monday to Sunday)
 */
export const getWeekDates = (weekStart: Date): Date[] => {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date;
  });
};

/**
 * Get hours array for calendar view (0-23)
 */
export const getHoursArray = (startHour = 0, endHour = 24): number[] => {
  return Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
};

/**
 * Calculate duration in minutes between two times
 */
export const calculateDuration = (startTime: string, endTime: string): number => {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
};

/**
 * Add minutes to a time string
 */
export const addMinutesToTime = (time: string, minutes: number): string => {
  const totalMinutes = timeToMinutes(time) + minutes;
  return minutesToTime(totalMinutes % (24 * 60));
};

/**
 * Generate RRULE for recurrence
 */
export const generateRRule = (
  frequency: 'daily' | 'weekly' | 'monthly',
  interval: number = 1,
  daysOfWeek?: number[], // 0=Mon, 6=Sun
  until?: Date
): string => {
  const parts = [`FREQ=${frequency.toUpperCase()}`];
  
  if (interval > 1) {
    parts.push(`INTERVAL=${interval}`);
  }
  
  if (daysOfWeek && daysOfWeek.length > 0) {
    const dayNames = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
    const days = daysOfWeek.map(d => dayNames[d]).join(',');
    parts.push(`BYDAY=${days}`);
  }
  
  if (until) {
    parts.push(`UNTIL=${until.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
  }
  
  return `RRULE:${parts.join(';')}`;
};

/**
 * Parse RRULE to components
 */
export const parseRRule = (rrule: string): {
  frequency: string;
  interval: number;
  daysOfWeek: number[];
  until?: Date;
} => {
  const result = {
    frequency: 'weekly',
    interval: 1,
    daysOfWeek: [] as number[],
    until: undefined as Date | undefined,
  };
  
  if (!rrule.startsWith('RRULE:')) return result;
  
  const parts = rrule.replace('RRULE:', '').split(';');
  const dayMap: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
  
  parts.forEach(part => {
    const [key, value] = part.split('=');
    switch (key) {
      case 'FREQ':
        result.frequency = value.toLowerCase();
        break;
      case 'INTERVAL':
        result.interval = parseInt(value, 10);
        break;
      case 'BYDAY':
        result.daysOfWeek = value.split(',').map(d => dayMap[d] ?? 0);
        break;
      case 'UNTIL':
        result.until = new Date(
          value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8)
        );
        break;
    }
  });
  
  return result;
};

/**
 * Get time zone string (e.g., "America/New_York")
 */
export const getLocalTimeZone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Create ISO datetime with timezone for Google Calendar
 */
export const createEventDateTime = (date: Date, time?: string): {
  dateTime?: string;
  date?: string;
  timeZone: string;
} => {
  const timeZone = getLocalTimeZone();
  
  if (time) {
    const combined = combineDateAndTime(date, time);
    return {
      dateTime: combined.toISOString().slice(0, 19), // Remove milliseconds and Z
      timeZone,
    };
  }
  
  // All-day event
  return {
    date: toISODate(date),
    timeZone,
  };
};

/**
 * Generate a unique ID
 */
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
