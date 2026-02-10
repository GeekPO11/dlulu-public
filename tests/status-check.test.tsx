import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import StatusCheck, { type GoalContext } from '../components/StatusCheck';

describe('StatusCheck', () => {
  it('collects prerequisite completion and comments', async () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();

    const user = userEvent.setup();
    render(
      <StatusCheck
        goals={[
          {
            title: 'Run a marathon',
            originalInput: 'Run a marathon',
            category: 'health',
            timeline: '12 weeks',
            estimatedWeeks: 12,
            prerequisites: [
              { id: 'p1', label: 'Buy shoes', order: 1, isCompleted: false },
            ],
          },
        ]}
        onComplete={onComplete}
        onBack={onBack}
      />
    );

    await user.click(screen.getByRole('button', { name: /Buy shoes/i }));
    await user.type(
      screen.getByPlaceholderText(/Describe what you did/i),
      'Bought running shoes'
    );
    await user.click(screen.getByRole('button', { name: /Done/i }));

    await user.type(
      screen.getByPlaceholderText(/Add any specific requirements/i),
      'Need a 12-week plan'
    );

    await user.click(screen.getByRole('button', { name: /Generate Blueprint/i }));

    expect(onComplete).toHaveBeenCalledWith([
      {
        goalTitle: 'Run a marathon',
        completedPrerequisites: ['Buy shoes'],
        skippedPrerequisites: [],
        additionalNotes: 'Need a 12-week plan',
        prerequisiteComments: { p1: 'Bought running shoes' },
      } as GoalContext,
    ]);
  });

  it('calls onBack when pressing Back on the first goal', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();

    render(
      <StatusCheck
        goals={[
          {
            title: 'Launch a startup',
            originalInput: 'Launch a startup',
            category: 'career',
            timeline: '8 weeks',
            estimatedWeeks: 8,
            prerequisites: [],
          },
        ]}
        onComplete={vi.fn()}
        onBack={onBack}
      />
    );

    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
