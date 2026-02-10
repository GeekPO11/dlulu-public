import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import FloatingDock from '../components/FloatingDock';

describe('FloatingDock layout', () => {
  it('uses safe-area bottom spacing and constrained mobile width classes', () => {
    render(
      <FloatingDock
        activeTab="dashboard"
        onNavigateToDashboard={vi.fn()}
        onNavigateToGoals={vi.fn()}
        onNavigateToCalendar={vi.fn()}
        onNavigateToSettings={vi.fn()}
        onNavigateToChat={vi.fn()}
      />
    );

    const dockSurface = document.querySelector('.glass-dock') as HTMLElement | null;
    expect(dockSurface).toBeTruthy();
    expect(dockSurface?.className).toContain('w-[min(94vw,760px)]');
    expect(dockSurface?.className).toContain('max-w-[94vw]');

    const fixedContainer = dockSurface?.parentElement as HTMLElement | null;
    expect(fixedContainer?.style.bottom).toContain('env(safe-area-inset-bottom)');
  });
});
