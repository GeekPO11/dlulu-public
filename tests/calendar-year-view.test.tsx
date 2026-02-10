import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import CalendarView from '../components/CalendarView';
import type { CalendarEvent } from '../constants/calendarTypes';

const YearViewHarness = ({ events }: { events: CalendarEvent[] }) => {
  const [selectedDate, setSelectedDate] = useState(new Date('2026-02-08T09:00:00'));

  return (
    <CalendarView
      events={events}
      goals={[]}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
      onEventClick={() => undefined}
      onTimeSlotClick={() => undefined}
      onCreateEvent={() => undefined}
      hideHeader
      embedded
    />
  );
};

describe('Calendar year view', () => {
  it('renders year month cards and booked-day markers when switched to year mode', async () => {
    const user = userEvent.setup();

    const events: CalendarEvent[] = [
      {
        id: 'event-1',
        summary: 'Deep work block',
        start: { dateTime: '2026-02-10T09:00:00' },
        end: { dateTime: '2026-02-10T10:00:00' },
        eventType: 'goal_session',
      } as CalendarEvent,
    ];

    render(<YearViewHarness events={events} />);

    const yearButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim().toLowerCase() === 'year'
    ) as HTMLButtonElement | undefined;

    expect(yearButton).toBeTruthy();
    await user.click(yearButton as HTMLButtonElement);

    expect(document.querySelectorAll('[data-wt="calendar-year-month-card"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-wt="calendar-year-marker"]').length).toBeGreaterThan(0);
  });
});
