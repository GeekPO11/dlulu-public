import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import ResetPasswordPage from '../components/ResetPasswordPage';

const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSessionMock(),
      onAuthStateChange: (cb: any) => onAuthStateChangeMock(cb),
    },
  },
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('shows invalid session screen when no session is present', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    render(
      <ResetPasswordPage
        onUpdatePassword={vi.fn()}
        onBackToLanding={vi.fn()}
      />
    );

    expect(
      await screen.findByText(/link expired or invalid/i)
    ).toBeInTheDocument();
  });

  it('validates password mismatch', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: '1' } } } });

    const user = userEvent.setup();
    render(
      <ResetPasswordPage
        onUpdatePassword={vi.fn()}
        onBackToLanding={vi.fn()}
      />
    );

    const passwordInput = await screen.findByPlaceholderText(/^new password$/i);
    const confirmInput = screen.getByPlaceholderText(/^confirm new password$/i);

    await user.type(passwordInput, 'password123');
    await user.type(confirmInput, 'password456');

    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(
      await screen.findByText(/Passwords do not match/i)
    ).toBeInTheDocument();
  });

  it('updates password and redirects after success', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: '1' } } } });

    const onUpdatePassword = vi.fn().mockResolvedValue({ error: null });
    const onBackToLanding = vi.fn();

    const user = userEvent.setup();

    render(
      <ResetPasswordPage
        onUpdatePassword={onUpdatePassword}
        onBackToLanding={onBackToLanding}
      />
    );

    const passwordInput = await screen.findByPlaceholderText(/^new password$/i);
    const confirmInput = screen.getByPlaceholderText(/^confirm new password$/i);

    await user.type(passwordInput, 'password123');
    await user.type(confirmInput, 'password123');

    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(onUpdatePassword).toHaveBeenCalledWith('password123')
    );

    expect(
      await screen.findByText(/password updated/i)
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(onBackToLanding).toHaveBeenCalled(),
      { timeout: 3000 }
    );
  });
});
