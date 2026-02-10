import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { vi } from 'vitest';

import LandingPage from '../components/LandingPage';

const setup = (overrides: Partial<ComponentProps<typeof LandingPage>> = {}) => {
  const {
    onStartOnboarding = vi.fn(),
    onSignUp = vi.fn().mockResolvedValue({ error: null }),
    onSignIn = vi.fn().mockResolvedValue({ error: null }),
    onResetPassword = vi.fn().mockResolvedValue({ error: null }),
    ...restOverrides
  } = overrides;

  const user = userEvent.setup();

  const view = render(
    <LandingPage
      onStartOnboarding={onStartOnboarding}
      onSignUp={onSignUp}
      onSignIn={onSignIn}
      onResetPassword={onResetPassword}
      {...restOverrides}
    />
  );

  return { user, onStartOnboarding, onSignUp, onSignIn, onResetPassword, ...view };
};

describe('LandingPage', () => {
  it('shows hero content and opens signup modal', async () => {
    const { user } = setup();

    expect(
      screen.getByRole('heading', { name: /Turn Delusion into Execution/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Get Started/i }));

    expect(
      screen.getByRole('heading', { name: /Start Your Journey/i })
    ).toBeInTheDocument();
  });

  it('signs up and starts onboarding with ambition text', async () => {
    const { user, onSignUp, onStartOnboarding, container } = setup();

    await user.type(screen.getByPlaceholderText(/I want to/i), 'Run a marathon');
    await user.click(screen.getByRole('button', { name: /Get Started/i }));

    await user.type(
      screen.getByPlaceholderText(/name@company\.com/i),
      'jane@example.com'
    );

    const passwordInputs = container.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const confirmPasswordInput = passwordInputs[1] as HTMLInputElement;

    await user.type(passwordInput, 'password123');
    await user.type(confirmPasswordInput, 'password123');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: /Join Now/i }));

    await waitFor(() =>
      expect(onSignUp).toHaveBeenCalledWith(
        'jane@example.com',
        'password123',
        'jane',
        'Run a marathon'
      )
    );

    await waitFor(() =>
      expect(onStartOnboarding).toHaveBeenCalledWith('Run a marathon')
    );
  });

  it('shows validation error when passwords do not match', async () => {
    const { user, onSignUp, container } = setup();

    await user.click(screen.getByRole('button', { name: /Get Started/i }));
    await user.type(
      screen.getByPlaceholderText(/name@company\.com/i),
      'jane@example.com'
    );

    const passwordInputs = container.querySelectorAll('input[type="password"]');
    const passwordInput = passwordInputs[0] as HTMLInputElement;
    const confirmPasswordInput = passwordInputs[1] as HTMLInputElement;

    await user.type(passwordInput, 'password123');
    await user.type(confirmPasswordInput, 'password456');

    await user.click(screen.getByRole('button', { name: /Join Now/i }));

    expect(
      await screen.findByText(/Passwords do not match/i)
    ).toBeInTheDocument();
    expect(onSignUp).not.toHaveBeenCalled();
  });

  it('signs in and starts onboarding', async () => {
    const { user, onSignIn, onStartOnboarding, container } = setup();

    await user.type(screen.getByPlaceholderText(/I want to/i), 'Launch a startup');
    await user.click(screen.getByRole('button', { name: /Login/i }));

    await user.type(
      screen.getByPlaceholderText(/name@company\.com/i),
      'jane@example.com'
    );

    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    await user.type(passwordInput, 'password123');

    const submitButton = container.querySelector('form button[type="submit"]') as HTMLButtonElement;
    await user.click(submitButton);

    await waitFor(() =>
      expect(onSignIn).toHaveBeenCalledWith(
        'jane@example.com',
        'password123',
        'Launch a startup'
      )
    );

    await waitFor(() =>
      expect(onStartOnboarding).toHaveBeenCalledWith('Launch a startup')
    );
  });

  it('sends a reset password email and shows confirmation', async () => {
    const { user, onResetPassword } = setup();

    await user.click(screen.getByRole('button', { name: /Login/i }));
    await user.click(screen.getByRole('button', { name: /Forgot\?/i }));

    await user.type(
      screen.getByPlaceholderText(/Your email address/i),
      'jane@example.com'
    );

    await user.click(screen.getByRole('button', { name: /Send Reset Link/i }));

    await waitFor(() =>
      expect(onResetPassword).toHaveBeenCalledWith('jane@example.com')
    );

    expect(
      await screen.findByText(/Check Your Inbox/i)
    ).toBeInTheDocument();
  });

  it('shows email verification prompt after sign up', async () => {
    const { user, onSignUp, container } = setup({
      onSignUp: vi.fn().mockResolvedValue({ error: null, needsEmailVerification: true }),
    });

    await user.click(screen.getByRole('button', { name: /Get Started/i }));
    await user.type(
      screen.getByPlaceholderText(/name@company\.com/i),
      'jane@example.com'
    );

    const passwordInputs = container.querySelectorAll('input[type="password"]');
    await user.type(passwordInputs[0] as HTMLInputElement, 'password123');
    await user.type(passwordInputs[1] as HTMLInputElement, 'password123');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: /Join Now/i }));

    await waitFor(() =>
      expect(onSignUp).toHaveBeenCalled()
    );

    expect(
      await screen.findByText(/Check Your Inbox/i)
    ).toBeInTheDocument();
  });

  it('shows sign in errors', async () => {
    const { user, onSignIn, container } = setup({
      onSignIn: vi.fn().mockResolvedValue({ error: 'Invalid login' }),
    });

    await user.click(screen.getByRole('button', { name: /Login/i }));
    await user.type(
      screen.getByPlaceholderText(/name@company\.com/i),
      'jane@example.com'
    );

    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    await user.type(passwordInput, 'password123');

    const submitButton = container.querySelector('form button[type="submit"]') as HTMLButtonElement;
    await user.click(submitButton);

    expect(
      await screen.findByText(/Invalid login/i)
    ).toBeInTheDocument();
    expect(onSignIn).toHaveBeenCalled();
  });

  it('shows sign up errors', async () => {
    const { user, container } = setup({
      onSignUp: vi.fn().mockResolvedValue({ error: 'Email already used' }),
    });

    await user.click(screen.getByRole('button', { name: /Get Started/i }));
    await user.type(
      screen.getByPlaceholderText(/name@company\.com/i),
      'jane@example.com'
    );

    const passwordInputs = container.querySelectorAll('input[type="password"]');
    await user.type(passwordInputs[0] as HTMLInputElement, 'password123');
    await user.type(passwordInputs[1] as HTMLInputElement, 'password123');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: /Join Now/i }));

    expect(
      await screen.findByText(/Email already used/i)
    ).toBeInTheDocument();
  });

  it('handles Google sign-in errors', async () => {
    const { user } = setup({
      onSignInWithGoogle: vi.fn().mockResolvedValue({ error: 'Popup closed' }),
    });

    await user.click(screen.getByRole('button', { name: /Get Started/i }));
    await user.click(screen.getByRole('button', { name: /Continue with Google/i }));

    expect(
      await screen.findByText(/Popup closed/i)
    ).toBeInTheDocument();
  });

  it('opens terms and privacy modals', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /Terms & Conditions/i }));
    expect(
      screen.getByRole('heading', { name: /Terms & Conditions/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));

    await user.click(screen.getByRole('button', { name: /Privacy Policy/i }));
    expect(
      screen.getByRole('heading', { name: /Privacy Policy/i })
    ).toBeInTheDocument();
  });

  it('submits the contact form successfully', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /^Contact$/i }));

    await user.type(screen.getByPlaceholderText(/Your name/i), 'Jane');
    await user.type(screen.getByPlaceholderText(/your@email\.com/i), 'jane@example.com');
    await user.selectOptions(screen.getByRole('combobox'), 'Bug Report');
    await user.type(screen.getByPlaceholderText(/Tell us what's on your mind/i), 'Hello!');

    await user.click(screen.getByRole('button', { name: /Send Message/i }));

    expect(
      await screen.findByText(/Message Sent/i)
    ).toBeInTheDocument();

    globalThis.fetch = originalFetch;
  });

  it('shows an error when contact submission fails', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /^Contact$/i }));

    await user.type(screen.getByPlaceholderText(/Your name/i), 'Jane');
    await user.type(screen.getByPlaceholderText(/your@email\.com/i), 'jane@example.com');
    await user.selectOptions(screen.getByRole('combobox'), 'Bug Report');
    await user.type(screen.getByPlaceholderText(/Tell us what's on your mind/i), 'Hello!');

    await user.click(screen.getByRole('button', { name: /Send Message/i }));

    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();

    globalThis.fetch = originalFetch;
  });
});
