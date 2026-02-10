export type DemoCalendarEvent = {
  id: string;
  title: string;
  dayIndex: number; // 0=Mon ... 6=Sun
  startHour: number; // 0-24
  durationHours: number;
  kind: 'blocked' | 'session';
};

export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 20;

export const BASE_WEEK_EVENTS: DemoCalendarEvent[] = [
  // Blocked time
  {id: 'b1', title: 'Work', dayIndex: 0, startHour: 9, durationHours: 8, kind: 'blocked'},
  {id: 'b2', title: 'Work', dayIndex: 1, startHour: 9, durationHours: 8, kind: 'blocked'},
  {id: 'b3', title: 'Work', dayIndex: 2, startHour: 9, durationHours: 8, kind: 'blocked'},
  {id: 'b4', title: 'Work', dayIndex: 3, startHour: 9, durationHours: 8, kind: 'blocked'},
  {id: 'b5', title: 'Work', dayIndex: 4, startHour: 9, durationHours: 8, kind: 'blocked'},

  // Scheduled sessions (initial)
  {id: 's1', title: 'Interview 2 users', dayIndex: 1, startHour: 18, durationHours: 1, kind: 'session'},
  {id: 's2', title: 'Landing page v1', dayIndex: 2, startHour: 19, durationHours: 1, kind: 'session'},
  {id: 's3', title: 'MVP onboarding', dayIndex: 4, startHour: 18, durationHours: 1, kind: 'session'},
];

export const withExtraSession = (title: string): DemoCalendarEvent[] => {
  return [
    ...BASE_WEEK_EVENTS,
    {id: 's_new', title, dayIndex: 3, startHour: 18, durationHours: 1, kind: 'session'},
  ];
};

