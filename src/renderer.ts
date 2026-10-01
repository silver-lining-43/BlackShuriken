import './index.css';
import { supabase } from './supabase';

type AuthMode = 'login' | 'signup';

type Channel = {
  id: string;
  name: string;
  locked?: boolean;
  temporary?: boolean;
};

const SAFETY = {
  maxMessageLength: 150,
  messageCooldownMs: 750,

  rapidMessageLimit: 6,
  rapidMessageResetMs: 2500,

  timeoutMs: 2 * 60 * 1000,

  similarMessageWindow: 5,

  ticketLimit: 2,
  ticketWindowMs: 10 * 60 * 1000,
};

const channels: Channel[] = [
  {
    id: 'general',
    name: 'general',
  },
  {
    id: 'announcements',
    name: 'announcements',
    locked: true,
  },
  {
    id: 'info',
    name: 'black-shuriken-info',
  },
  {
    id: 'rules',
    name: 'rules',
  },
  {
    id: 'reports',
    name: 'report-a-user',
  },
];

let authMode: AuthMode = 'login';
let ticketNumber = 1;

let lastMessageAt = 0;
let rapidMessageStreak = 0;
let timedOutUntil = 0;

let recentMessages: string[] = [];
let ticketTimestamps: number[] = [];

let timeoutInterval: number | undefined;

const AUTH_STYLES = `
  :root {
    --bs-bg: #090a0d;
    --bs-panel: rgba(20, 22, 28, 0.86);
    --bs-panel-solid: #15171d;
    --bs-border: rgba(255, 255, 255, 0.075);
    --bs-border-strong: rgba(255, 255, 255, 0.12);

    --bs-text: #f5f7fa;
    --bs-text-soft: #a9adb7;
    --bs-text-muted: #707580;

    --bs-input: rgba(10, 11, 15, 0.78);
    --bs-input-hover: rgba(15, 17, 22, 0.92);

    --bs-white: #ffffff;

    --bs-shadow:
      0 30px 90px rgba(0, 0, 0, 0.55),
      0 10px 30px rgba(0, 0, 0, 0.35);
  }

  .auth-screen {
    position: relative;

    display: flex;

    width: 100%;
    height: 100vh;

    align-items: center;
    justify-content: center;

    overflow: hidden;

    background:
      radial-gradient(
        circle at 20% 15%,
        rgba(255, 255, 255, 0.045),
        transparent 30%
      ),
      radial-gradient(
        circle at 80% 85%,
        rgba(255, 255, 255, 0.035),
        transparent 28%
      ),
      var(--bs-bg);
  }

  .auth-screen::before {
    content: "";

    position: absolute;

    width: 620px;
    height: 620px;

    top: -300px;
    left: -260px;

    border-radius: 50%;

    background: rgba(255, 255, 255, 0.025);

    filter: blur(10px);

    pointer-events: none;
  }

  .auth-screen::after {
    content: "";

    position: absolute;

    width: 500px;
    height: 500px;

    right: -250px;
    bottom: -250px;

    border-radius: 50%;

    background: rgba(255, 255, 255, 0.018);

    filter: blur(12px);

    pointer-events: none;
  }

  .auth-window {
    position: relative;
    z-index: 1;

    display: grid;

    grid-template-columns: 1fr 1fr;

    width: min(860px, calc(100% - 48px));
    min-height: 540px;

    border: 1px solid var(--bs-border-strong);
    border-radius: 22px;

    background: var(--bs-panel);

    box-shadow: var(--bs-shadow);

    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);

    overflow: hidden;
  }

  .auth-brand-side {
    position: relative;

    display: flex;
    flex-direction: column;

    justify-content: space-between;

    padding: 44px;

    background:
      linear-gradient(
        155deg,
        rgba(255, 255, 255, 0.045),
        rgba(255, 255, 255, 0.012)
      );

    border-right: 1px solid var(--bs-border);
  }

  .auth-brand-side::before {
    content: "";

    position: absolute;

    width: 260px;
    height: 260px;

    right: -110px;
    top: -110px;

    border-radius: 50%;

    border: 1px solid rgba(255, 255, 255, 0.035);
  }

  .auth-brand-side::after {
    content: "";

    position: absolute;

    width: 340px;
    height: 340px;

    left: -220px;
    bottom: -220px;

    border-radius: 50%;

    border: 1px solid rgba(255, 255, 255, 0.025);
  }

  .auth-brand-content {
    position: relative;
    z-index: 1;
  }

  .auth-logo-large {
    display: grid;
    place-items: center;

    width: 72px;
    height: 72px;

    margin-bottom: 26px;

    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 20px;

    background:
      linear-gradient(
        145deg,
        #2d3037,
        #1d1f25
      );

    color: white;

    font-size: 30px;
    font-weight: 800;

    box-shadow:
      0 12px 30px rgba(0, 0, 0, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .auth-brand-title {
    margin: 0;

    color: var(--bs-text);

    font-size: 34px;
    line-height: 1.08;
    letter-spacing: -0.035em;
    font-weight: 750;
  }

  .auth-brand-description {
    max-width: 310px;

    margin: 16px 0 0;

    color: var(--bs-text-soft);

    font-size: 14px;
    line-height: 1.7;
  }

  .auth-brand-footer {
    position: relative;
    z-index: 1;

    color: var(--bs-text-muted);

    font-size: 11px;
    line-height: 1.6;
  }

  .auth-form-side {
    display: flex;
    flex-direction: column;

    justify-content: center;

    padding: 48px;
  }

  .auth-form-heading {
    margin: 0;

    color: var(--bs-text);

    font-size: 24px;
    line-height: 1.2;
    letter-spacing: -0.025em;
  }

  .auth-form-subheading {
    margin: 8px 0 30px;

    color: var(--bs-text-muted);

    font-size: 13px;
    line-height: 1.5;
  }

  .auth-form {
    display: flex;
    flex-direction: column;

    gap: 17px;
  }

  .auth-field {
    display: flex;
    flex-direction: column;

    gap: 8px;
  }

  .auth-field-label {
    color: #c7cad1;

    font-size: 11px;
    font-weight: 700;

    letter-spacing: 0.045em;
    text-transform: uppercase;
  }

  .auth-input-wrap {
    position: relative;
  }

  .auth-input {
    width: 100%;
    height: 46px;

    padding: 0 14px;

    border: 1px solid var(--bs-border-strong);
    border-radius: 10px;

    outline: none;

    background: var(--bs-input);
    color: var(--bs-text);

    font-size: 13px;

    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }

  .auth-input:hover {
    background: var(--bs-input-hover);
  }

  .auth-input:focus {
    border-color: rgba(255, 255, 255, 0.22);

    background: var(--bs-input-hover);

    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.035);
  }

  .auth-input::placeholder {
    color: #575c67;
  }

  .auth-password-input {
    padding-right: 48px;
  }

  .auth-password-toggle {
    position: absolute;

    top: 50%;
    right: 7px;

    display: grid;
    place-items: center;

    width: 32px;
    height: 32px;

    transform: translateY(-50%);

    border-radius: 7px;

    background: transparent;
    color: #686d78;

    font-size: 13px;

    cursor: pointer;
  }

  .auth-password-toggle:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .auth-password-toggle svg {
    width: 16px;
    height: 16px;
  }

  .auth-submit {
    width: 100%;
    height: 46px;

    margin-top: 5px;

    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;

    background:
      linear-gradient(
        180deg,
        #f4f5f7,
        #dfe1e5
      );

    color: #111318;

    font-size: 13px;
    font-weight: 750;

    cursor: pointer;

    transition:
      transform 0.12s ease,
      filter 0.15s ease,
      box-shadow 0.15s ease;
  }

  .auth-submit:hover {
    filter: brightness(1.045);

    box-shadow:
      0 10px 28px rgba(0, 0, 0, 0.28);
  }

  .auth-submit:active {
    transform: translateY(1px);
  }

  .auth-submit:disabled {
    cursor: wait;

    opacity: 0.55;

    box-shadow: none;
  }

  .auth-error {
    min-height: 18px;

    margin-top: -3px;

    color: #b9bdc6;

    font-size: 11px;
    line-height: 1.5;

    text-align: center;
  }

  .auth-switch {
    width: 100%;

    margin-top: 10px;

    padding: 9px;

    border-radius: 8px;

    background: transparent;
    color: #818691;

    font-size: 11px;

    cursor: pointer;

    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .auth-switch:hover {
    background: rgba(255, 255, 255, 0.035);
    color: #ffffff;
  }

  .auth-rules {
    display: flex;
    align-items: center;
    gap: 7px;

    margin-top: 24px;

    color: #5f646e;

    font-size: 10px;
    line-height: 1.5;
  }

  .auth-rules-dot {
    width: 5px;
    height: 5px;

    border-radius: 50%;

    background: #454952;
  }

  @media (max-width: 760px) {
    .auth-window {
      grid-template-columns: 1fr;

      width: min(470px, calc(100% - 30px));
      min-height: auto;
    }

    .auth-brand-side {
      padding: 30px;

      border-right: 0;
      border-bottom: 1px solid var(--bs-border);
    }

    .auth-brand-title {
      font-size: 28px;
    }

    .auth-brand-description,
    .auth-brand-footer {
      display: none;
    }

    .auth-form-side {
      padding: 30px;
    }
  }
`;

function injectAuthStyles() {
  const existing = document.querySelector('#blackshuriken-auth-styles');

  if (existing) {
    existing.remove();
  }

  const style = document.createElement('style');
  style.id = 'blackshuriken-auth-styles';
  style.textContent = AUTH_STYLES;

  document.head.appendChild(style);
}

async function ensureSupabaseSession() {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const { data, error } =
      await supabase.auth.signInAnonymously();

    if (error) {
      throw error;
    }

    session = data.session;
  }

  if (!session) {
    throw new Error('Could not create a Supabase session.');
  }

  return session;
}

function eyeIcon(hidden: boolean) {
  if (hidden) {
    return `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 3l18 18"></path>
        <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"></path>
        <path d="M9.9 4.3A10.8 10.8 0 0 1 12 4c5 0 8.8 4 10 8-0.5 1.7-1.4 3.2-2.7 4.4"></path>
        <path d="M6.6 6.7C4.8 7.9 3.6 9.7 2 12c1.2 4 5 8 10 8 1.2 0 2.3-.2 3.3-.6"></path>
      </svg>
    `;
  }

  return `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path>
      <circle cx="12" cy="12" r="2.5"></circle>
    </svg>
  `;
}

function showAuthScreen(mode: AuthMode = 'login') {
  authMode = mode;

  injectAuthStyles();

  const isLogin = mode === 'login';

  document.body.innerHTML = `
    <div class="auth-screen">

      <div class="auth-window">

        <section class="auth-brand-side">

          <div class="auth-brand-content">

            <div class="auth-logo-large">
              B
            </div>

            <h1 class="auth-brand-title">
              BlackShuriken
            </h1>

            <p class="auth-brand-description">
              A small, private place to talk with friends.
              Built for Windows and macOS.
            </p>

          </div>

          <div class="auth-brand-footer">
            BlackShuriken Community Server<br />
            Private • Fast • Independent
          </div>

        </section>

        <section class="auth-form-side">

          <h2 class="auth-form-heading">
            ${isLogin ? 'Welcome back' : 'Create your account'}
          </h2>

          <p class="auth-form-subheading">
            ${
              isLogin
                ? 'Log in to continue to BlackShuriken.'
                : 'Choose a username and password to get started.'
            }
          </p>

          <form
            id="auth-form"
            class="auth-form"
            autocomplete="on"
          >

            <div class="auth-field">

              <label
                class="auth-field-label"
                for="auth-username"
              >
                Username
              </label>

              <div class="auth-input-wrap">
                <input
                  id="auth-username"
                  class="auth-input"
                  type="text"
                  minlength="3"
                  maxlength="24"
                  autocomplete="username"
                  spellcheck="false"
                  required
                  placeholder="Enter your username"
                />
              </div>

            </div>

            <div class="auth-field">

              <label
                class="auth-field-label"
                for="auth-password"
              >
                Password
              </label>

              <div class="auth-input-wrap">

                <input
                  id="auth-password"
                  class="auth-input auth-password-input"
                  type="password"
                  minlength="8"
                  maxlength="128"
                  autocomplete="${
                    isLogin
                      ? 'current-password'
                      : 'new-password'
                  }"
                  required
                  placeholder="${
                    isLogin
                      ? 'Enter your password'
                      : 'Create a password'
                  }"
                />

                <button
                  id="password-toggle"
                  class="auth-password-toggle"
                  type="button"
                  title="Show password"
                  aria-label="Show password"
                >
                  ${eyeIcon(true)}
                </button>

              </div>

            </div>

            <button
              class="auth-submit"
              type="submit"
            >
              ${isLogin ? 'Log In' : 'Create Account'}
            </button>

            <div
              id="auth-error"
              class="auth-error"
              role="alert"
              aria-live="polite"
            ></div>

          </form>

          <button
            id="auth-switch"
            class="auth-switch"
            type="button"
          >
            ${
              isLogin
                ? "Don't have an account? Create one"
                : 'Already have an account? Log in'
            }
          </button>

          <div class="auth-rules">
            <span class="auth-rules-dot"></span>
            <span>Username: 3–24 characters</span>
          </div>

        </section>

      </div>

    </div>
  `;

  const form =
    document.querySelector<HTMLFormElement>('#auth-form');

  const switchButton =
    document.querySelector<HTMLButtonElement>('#auth-switch');

  const error =
    document.querySelector<HTMLDivElement>('#auth-error');

  const usernameInput =
    document.querySelector<HTMLInputElement>('#auth-username');

  const passwordInput =
    document.querySelector<HTMLInputElement>('#auth-password');

  const passwordToggle =
    document.querySelector<HTMLButtonElement>(
      '#password-toggle',
    );

  if (
    !form ||
    !switchButton ||
    !error ||
    !usernameInput ||
    !passwordInput ||
    !passwordToggle
  ) {
    throw new Error(
      'Authentication screen failed to initialize.',
    );
  }

  let passwordVisible = false;

  passwordToggle.addEventListener('click', () => {
    passwordVisible = !passwordVisible;

    passwordInput.type = passwordVisible
      ? 'text'
      : 'password';

    passwordToggle.innerHTML =
      eyeIcon(!passwordVisible);

    passwordToggle.title = passwordVisible
      ? 'Hide password'
      : 'Show password';

    passwordToggle.setAttribute(
      'aria-label',
      passwordVisible
        ? 'Hide password'
        : 'Show password',
    );
  });

  switchButton.addEventListener('click', () => {
    showAuthScreen(
      authMode === 'login'
        ? 'signup'
        : 'login',
    );
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    error.textContent = '';

    const username =
      usernameInput.value.trim();

    const password =
      passwordInput.value;

    if (
      username.length < 3 ||
      username.length > 24
    ) {
      error.textContent =
        'Username must be between 3 and 24 characters.';
      return;
    }

    if (
      !/^[A-Za-z0-9_-]+$/.test(username)
    ) {
      error.textContent =
        'Username can only contain letters, numbers, underscores, and hyphens.';
      return;
    }

    if (
      password.length < 8 ||
      password.length > 128
    ) {
      error.textContent =
        'Password must be between 8 and 128 characters.';
      return;
    }

    const submitButton =
      form.querySelector<HTMLButtonElement>(
        '.auth-submit',
      );

    if (submitButton) {
      submitButton.disabled = true;

      submitButton.textContent =
        isLogin
          ? 'Logging in...'
          : 'Creating account...';
    }

    try {
      await ensureSupabaseSession();

      const functionName =
        isLogin
          ? 'login_blackshuriken_account'
          : 'register_blackshuriken_account';

      const { error: rpcError } =
        await supabase.rpc(
          functionName,
          {
            p_username: username,
            p_password: password,
          },
        );

      if (rpcError) {
        throw rpcError;
      }

      window.location.reload();
    } catch (err) {
      error.textContent =
        err instanceof Error
          ? err.message
          : 'Something went wrong.';

      if (submitButton) {
        submitButton.disabled = false;

        submitButton.textContent =
          isLogin
            ? 'Log In'
            : 'Create Account';
      }
    }
  });

  usernameInput.focus();
}

function showSafetyNotice(
  text: string,
  duration = 3000,
) {
  document
    .querySelector('.safety-toast')
    ?.remove();

  const toast =
    document.createElement('div');

  toast.className = 'safety-toast';
  toast.textContent = text;

  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, duration);
}

function normalizeMessage(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBigrams(text: string) {
  const result = new Set<string>();

  for (let i = 0; i < text.length - 1; i += 1) {
    result.add(text.slice(i, i + 2));
  }

  return result;
}

function areSimilarMessages(
  a: string,
  b: string,
) {
  const first = normalizeMessage(a);
  const second = normalizeMessage(b);

  if (!first || !second) {
    return false;
  }

  if (first === second) {
    return true;
  }

  if (
    first.length < 8 ||
    second.length < 8
  ) {
    return false;
  }

  const firstBigrams =
    getBigrams(first);

  const secondBigrams =
    getBigrams(second);

  let intersection = 0;

  for (const bigram of firstBigrams) {
    if (secondBigrams.has(bigram)) {
      intersection += 1;
    }
  }

  const union = new Set([
    ...firstBigrams,
    ...secondBigrams,
  ]).size;

  if (union === 0) {
    return false;
  }

  return (
    intersection / union >= 0.85
  );
}

function isTimedOut() {
  return Date.now() < timedOutUntil;
}

function clearTimeoutState() {
  timedOutUntil = 0;

  if (timeoutInterval !== undefined) {
    window.clearInterval(timeoutInterval);
    timeoutInterval = undefined;
  }

  const input =
    document.querySelector<HTMLInputElement>(
      '#message-input',
    );

  const form =
    document.querySelector<HTMLFormElement>(
      '#message-form',
    );

  if (input) {
    input.disabled = false;
  }

  const sendButton =
    form?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );

  if (sendButton) {
    sendButton.disabled = false;
  }

  document
    .querySelector('.timeout-banner')
    ?.remove();
}

function startTimeout() {
  timedOutUntil =
    Date.now() +
    SAFETY.timeoutMs;

  const input =
    document.querySelector<HTMLInputElement>(
      '#message-input',
    );

  const form =
    document.querySelector<HTMLFormElement>(
      '#message-form',
    );

  if (input) {
    input.disabled = true;
  }

  const sendButton =
    form?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );

  if (sendButton) {
    sendButton.disabled = true;
  }

  document
    .querySelector('.timeout-banner')
    ?.remove();

  const banner =
    document.createElement('div');

  banner.className =
    'timeout-banner';

  document.body.appendChild(banner);

  const updateBanner = () => {
    const remaining =
      timedOutUntil - Date.now();

    if (remaining <= 0) {
      clearTimeoutState();
      return;
    }

    const seconds =
      Math.ceil(remaining / 1000);

    banner.textContent =
      `You have been timed out for ${seconds} more seconds.`;
  };

  updateBanner();

  timeoutInterval =
    window.setInterval(
      updateBanner,
      250,
    );
}

function checkMessageSafety(
  text: string,
) {
  if (isTimedOut()) {
    const remaining =
      Math.ceil(
        (timedOutUntil - Date.now()) /
          1000,
      );

    showSafetyNotice(
      `You are timed out. Please wait ${remaining} seconds.`,
    );

    return false;
  }

  if (
    text.length >
    SAFETY.maxMessageLength
  ) {
    showSafetyNotice(
      `Messages cannot be longer than ${SAFETY.maxMessageLength} characters.`,
    );

    return false;
  }

  const now = Date.now();

  if (
    lastMessageAt !== 0 &&
    now - lastMessageAt <
      SAFETY.messageCooldownMs
  ) {
    const remaining =
      Math.ceil(
        (
          SAFETY.messageCooldownMs -
          (now - lastMessageAt)
        ) / 100,
      ) / 10;

    showSafetyNotice(
      `Slow down. Wait ${remaining.toFixed(1)} seconds before sending another message.`,
    );

    return false;
  }

  const isSimilar =
    recentMessages.some(
      (previousMessage) =>
        areSimilarMessages(
          text,
          previousMessage,
        ),
    );

  if (isSimilar) {
    showSafetyNotice(
      'That message is too similar to something you recently sent.',
    );

    return false;
  }

  if (
    lastMessageAt !== 0 &&
    now - lastMessageAt <=
      SAFETY.rapidMessageResetMs
  ) {
    rapidMessageStreak += 1;
  } else {
    rapidMessageStreak = 1;
  }

  lastMessageAt = now;

  if (
    rapidMessageStreak >=
    SAFETY.rapidMessageLimit
  ) {
    recentMessages = [];
    rapidMessageStreak = 0;

    showSafetyNotice(
      'You are sending messages too quickly. You have been timed out for 2 minutes.',
      5000,
    );

    startTimeout();

    return false;
  }

  recentMessages.push(text);

  if (
    recentMessages.length >
    SAFETY.similarMessageWindow
  ) {
    recentMessages.shift();
  }

  return true;
}

function checkTicketSafety() {
  const now = Date.now();

  ticketTimestamps =
    ticketTimestamps.filter(
      (timestamp) =>
        now - timestamp <
        SAFETY.ticketWindowMs,
    );

  if (
    ticketTimestamps.length >=
    SAFETY.ticketLimit
  ) {
    const oldestTicket =
      ticketTimestamps[0];

    const remaining =
      Math.ceil(
        (
          SAFETY.ticketWindowMs -
          (now - oldestTicket)
        ) / 60000,
      );

    showSafetyNotice(
      `Ticket limit reached. You can create another ticket in about ${remaining} minute${
        remaining === 1 ? '' : 's'
      }.`,
      5000,
    );

    return false;
  }

  ticketTimestamps.push(now);

  return true;
}

async function startBlackShuriken() {
  document.body.innerHTML = `
    <div class="app">

      <aside class="sidebar">

        <div class="brand">
          <div class="brand-icon">B</div>

          <div class="brand-text">
            <span class="brand-name">
              BlackShuriken
            </span>

            <span class="brand-subtitle">
              Community Server
            </span>
          </div>
        </div>

        <div class="channel-section">

          <div class="section-heading">
            TEXT CHANNELS
          </div>

          <div id="channel-list"></div>

        </div>

      </aside>

      <main class="main">

        <header class="topbar">

          <div class="channel-header">

            <div class="channel-symbol">
              #
            </div>

            <div>
              <h1 id="channel-title">
                general
              </h1>

              <p id="channel-subtitle">
                Talk with everyone.
              </p>
            </div>

          </div>

          <div class="account-controls">
            <div class="status">
              <span class="status-dot connected"></span>
              <span id="account-username">Connected</span>
            </div>

            <button
              id="logout-button"
              class="logout-button"
              type="button"
            >
              Log Out
            </button>
          </div>

        </header>

        <section
          class="messages"
          id="messages"
        ></section>

        <form
          class="message-box"
          id="message-form"
        >

          <input
            id="message-input"
            type="text"
            placeholder="Message #general"
            autocomplete="off"
            maxlength="150"
          />

          <button type="submit">
            Send
          </button>

        </form>

      </main>

    </div>
  `;

  const channelList =
    document.querySelector<HTMLDivElement>(
      '#channel-list',
    );

  const messages =
    document.querySelector<HTMLElement>(
      '#messages',
    );

  const form =
    document.querySelector<HTMLFormElement>(
      '#message-form',
    );

  const input =
    document.querySelector<HTMLInputElement>(
      '#message-input',
    );

  const channelTitle =
    document.querySelector<HTMLHeadingElement>(
      '#channel-title',
    );

  const channelSubtitle =
    document.querySelector<HTMLParagraphElement>(
      '#channel-subtitle',
    );

  const messageBox =
    document.querySelector<HTMLElement>(
      '.message-box',
    );

  if (
    !channelList ||
    !messages ||
    !form ||
    !input ||
    !channelTitle ||
    !channelSubtitle ||
    !messageBox
  ) {
    throw new Error(
      'BlackShuriken failed to initialize.',
    );
  }

  const logoutButton =
  document.querySelector<HTMLButtonElement>(
    '#logout-button',
  );

const accountUsername =
  document.querySelector<HTMLSpanElement>(
    '#account-username',
  );

if (!logoutButton || !accountUsername) {
  throw new Error(
    'Account controls failed to initialize.',
  );
}

const {
  data: { session },
} = await supabase.auth.getSession();

if (session) {
  const { data: account, error } =
    await supabase.rpc(
      'get_current_blackshuriken_account',
    );

  if (error) {
    throw error;
  }

  if (account?.username) {
    accountUsername.textContent =
      account.username;
  }
}

logoutButton.addEventListener(
  'click',
  async () => {
    logoutButton.disabled = true;
    logoutButton.textContent =
      'Logging out...';

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        'Logout failed:',
        error,
      );

      logoutButton.disabled = false;
      logoutButton.textContent =
        'Log Out';

      return;
    }

    window.location.reload();
  },
);

  function createChannelButton(
    channel: Channel,
  ) {
    const button =
      document.createElement('button');

    button.type = 'button';
    button.className =
      'channel-button';

    button.dataset.channel =
      channel.id;

    const symbol =
      document.createElement('span');

    symbol.className =
      'channel-button-symbol';

    symbol.textContent = '#';

    const name =
      document.createElement('span');

    name.className =
      'channel-button-name';

    name.textContent =
      channel.name;

    button.append(
      symbol,
      name,
    );

    if (channel.locked) {
      const lock =
        document.createElement('span');

      lock.className =
        'channel-lock';

      lock.textContent =
        '🔒';

      button.appendChild(lock);
    }

    button.addEventListener(
      'click',
      () => {
        openChannel(channel.id);
      },
    );

    channelList.appendChild(button);
  }

  function createTicketChannel(
    channel: Channel,
  ) {
    channels.push(channel);
    createChannelButton(channel);
  }

  function clearMessages() {
    messages.innerHTML = '';
  }

  function addInfoMessage(
    title: string,
    paragraphs: string[],
    options?: {
      numberedRules?: string[];
      buttons?: boolean;
    },
  ) {
    clearMessages();

    const panel =
      document.createElement('div');

    panel.className =
      'info-panel';

    const heading =
      document.createElement('h2');

    heading.textContent =
      title;

    panel.appendChild(
      heading,
    );

    for (const paragraph of paragraphs) {
      const p =
        document.createElement('p');

      p.textContent =
        paragraph;

      panel.appendChild(p);
    }

    if (options?.numberedRules) {
      const list =
        document.createElement('ol');

      list.className =
        'rules-list';

      for (const rule of options.numberedRules) {
        const item =
          document.createElement('li');

        item.textContent =
          rule;

        list.appendChild(item);
      }

      panel.appendChild(list);
    }

    if (options?.buttons) {
      const ticketActions =
        document.createElement('div');

      ticketActions.className =
        'ticket-actions';

      const normalButton =
        document.createElement('button');

      normalButton.type = 'button';
      normalButton.className =
        'ticket-button';

      normalButton.textContent =
        'Make a normal ticket';

      normalButton.addEventListener(
        'click',
        () => {
          createTicket(false);
        },
      );

      const anonymousButton =
        document.createElement('button');

      anonymousButton.type = 'button';
      anonymousButton.className =
        'ticket-button secondary';

      anonymousButton.textContent =
        'Make an anonymous ticket';

      anonymousButton.addEventListener(
        'click',
        () => {
          createTicket(true);
        },
      );

      ticketActions.append(
        normalButton,
        anonymousButton,
      );

      panel.appendChild(
        ticketActions,
      );
    }

    messages.appendChild(panel);
  }

  function addWelcomeMessage() {
    clearMessages();

    const welcome =
      document.createElement('div');

    welcome.className =
      'welcome';

    const icon =
      document.createElement('div');

    icon.className =
      'welcome-icon';

    icon.textContent = 'B';

    const heading =
      document.createElement('h2');

    heading.textContent =
      'Welcome to BlackShuriken';

    const text =
      document.createElement('p');

    text.textContent =
      'Send your first message below.';

    welcome.append(
      icon,
      heading,
      text,
    );

    messages.appendChild(
      welcome,
    );
  }

  function addSystemLockedMessage() {
    clearMessages();

    const panel =
      document.createElement('div');

    panel.className =
      'locked-panel';

    const lock =
      document.createElement('div');

    lock.className =
      'locked-icon';

    lock.textContent =
      '🔒';

    const heading =
      document.createElement('h2');

    heading.textContent =
      'Restricted channel';

    const text =
      document.createElement('p');

    text.textContent =
      'Only members with the appropriate special role can post announcements. Database permissions will enforce this later.';

    panel.append(
      lock,
      heading,
      text,
    );

    messages.appendChild(
      panel,
    );
  }

  function addTicketMessage(
    channel: Channel,
  ) {
    clearMessages();

    const panel =
      document.createElement('div');

    panel.className =
      'ticket-panel';

    const icon =
      document.createElement('div');

    icon.className =
      'ticket-icon';

    icon.textContent =
      channel.name.startsWith('anon-')
        ? 'A'
        : 'T';

    const heading =
      document.createElement('h2');

    heading.textContent =
      channel.name;

    const text =
      document.createElement('p');

    if (
      channel.name.startsWith(
        'anon-',
      )
    ) {
      text.textContent =
        'This is a private anonymous report channel. In the finished app, only the reporting user and moderators will be able to access it.';
    } else {
      text.textContent =
        'This is a private report channel. In the finished app, only the reporting user and moderators will be able to access it.';
    }

    const status =
      document.createElement('div');

    status.className =
      'ticket-status';

    status.textContent =
      'Private ticket';

    panel.append(
      icon,
      heading,
      text,
      status,
    );

    messages.appendChild(
      panel,
    );

    messageBox.style.display =
      'none';
  }

  function addMessage(
    text: string,
  ) {
    const message =
      document.createElement('div');

    message.className =
      'message';

    const avatar =
      document.createElement('div');

    avatar.className =
      'message-avatar';

    avatar.textContent =
      'Y';

    const content =
      document.createElement('div');

    content.className =
      'message-content';

    const header =
      document.createElement('div');

    header.className =
      'message-header';

    const username =
      document.createElement('span');

    username.className =
      'message-username';

    username.textContent =
      'You';

    const time =
      document.createElement('span');

    time.className =
      'message-time';

    time.textContent =
      new Date().toLocaleTimeString(
        [],
        {
          hour: 'numeric',
          minute: '2-digit',
        },
      );

    const body =
      document.createElement('div');

    body.className =
      'message-text';

    body.textContent =
      text;

    const deleteButton =
      document.createElement('button');

    deleteButton.className =
      'delete-message';

    deleteButton.type =
      'button';

    deleteButton.title =
      'Delete message';

    deleteButton.setAttribute(
      'aria-label',
      'Delete message',
    );

    deleteButton.textContent =
      '×';

    deleteButton.addEventListener(
      'click',
      () => {
        message.remove();
      },
    );

    header.append(
      username,
      time,
    );

    content.append(
      header,
      body,
      deleteButton,
    );

    message.append(
      avatar,
      content,
    );

    messages.appendChild(
      message,
    );

    messages.scrollTop =
      messages.scrollHeight;
  }

  function createTicket(
    anonymous: boolean,
  ) {
    if (!checkTicketSafety()) {
      return;
    }

    const number =
      String(ticketNumber)
        .padStart(3, '0');

    const channelName =
      anonymous
        ? `anon-ticket#${number}`
        : `ticket#${number}`;

    ticketNumber += 1;

    const newChannel: Channel = {
      id: channelName,
      name: channelName,
      temporary: true,
    };

    createTicketChannel(
      newChannel,
    );

    openChannel(
      channelName,
    );
  }

  function setActiveChannel(
    channelId: string,
  ) {
    const buttons =
      channelList.querySelectorAll<HTMLButtonElement>(
        '.channel-button',
      );

    buttons.forEach(
      (button) => {
        button.classList.toggle(
          'active',
          button.dataset.channel ===
            channelId,
        );
      },
    );
  }

  function openChannel(
    channelId: string,
  ) {
    const channel =
      channels.find(
        (item) =>
          item.id === channelId,
      );

    if (!channel) {
      return;
    }

    setActiveChannel(
      channelId,
    );

    channelTitle.textContent =
      channel.name;

    if (channel.id === 'general') {
      channelSubtitle.textContent =
        'Talk with everyone.';

      messageBox.style.display =
        'flex';

      input.placeholder =
        'Message #general';

      addWelcomeMessage();

      input.focus();

      return;
    }

    if (
      channel.id ===
      'announcements'
    ) {
      channelSubtitle.textContent =
        'Official announcements only.';

      messageBox.style.display =
        'none';

      addSystemLockedMessage();

      return;
    }

    if (channel.id === 'info') {
      channelSubtitle.textContent =
        'About BlackShuriken.';

      messageBox.style.display =
        'none';

      addInfoMessage(
        'Welcome to BlackShuriken!',
        [
          'Thanks for downloading and joining BlackShuriken. BlackShuriken is a Electron based application for Windows / MacOS, a very small indie substitute for Discord.',
          'Talk to everyone and anyone in #general. Want to report someone breaking the #rules? Go to #report-a-user and keep BlackShuriken safe!',
        ],
      );

      return;
    }

    if (channel.id === 'rules') {
      channelSubtitle.textContent =
        'Rules for everyone.';

      messageBox.style.display =
        'none';

      addInfoMessage(
        'Rules for BlackShuriken:',
        [],
        {
          numberedRules: [
            'Do not harass or dox anyone',
            'Do not say anything racist, homophobic, transphobic, or sexist in global #general. Do not say slurs ANYWHERE.',
            'Do not sell, share, or give away your account',
            'Do not ban evade',
            'Do not spam or make false tickets',
          ],
        },
      );

      return;
    }

    if (
      channel.id ===
      'reports'
    ) {
      channelSubtitle.textContent =
        'Keep BlackShuriken safe.';

      messageBox.style.display =
        'none';

      addInfoMessage(
        "Hello! And welcome to BlackShuriken's report system.",
        [
          'Below you can open a normal or anonymous ticket to report a user:',
        ],
        {
          buttons: true,
        },
      );

      return;
    }

    if (channel.temporary) {
      channelSubtitle.textContent =
        'Private report channel.';

      addTicketMessage(
        channel,
      );

      return;
    }
  }

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();

      const text =
        input.value.trim();

      if (!text) {
        return;
      }

      if (
        !checkMessageSafety(text)
      ) {
        return;
      }

      addMessage(text);

      input.value = '';

      input.focus();
    },
  );

  for (const channel of channels) {
    createChannelButton(
      channel,
    );
  }

  openChannel('general');
}

async function initializeBlackShuriken() {
  try {
    await ensureSupabaseSession();

    const { data: account, error } =
      await supabase.rpc(
        'get_current_blackshuriken_account',
      );

    if (error) {
      throw error;
    }

    console.log(
      'BlackShuriken account:',
      account,
    );

    if (account) {
      await startBlackShuriken();
      return;
    }

    showAuthScreen('login');
  } catch (error) {
    console.error(
      'BlackShuriken initialization failed:',
      error,
    );

    document.body.innerHTML = `
      <div class="auth-screen">

        <div class="auth-window"
             style="
               display:flex;
               align-items:center;
               justify-content:center;
               max-width:520px;
               min-height:0;
               padding:48px;
             "
        >

          <div style="text-align:center; width:100%;">

            <div class="auth-logo-large"
                 style="margin:0 auto 24px;"
            >
              !
            </div>

            <h1 class="auth-brand-title"
                style="font-size:28px;"
            >
              Connection Error
            </h1>

            <p
              class="auth-brand-description"
              style="max-width:none; margin:14px auto 0;"
            >
              BlackShuriken could not connect to its backend.
            </p>

            <p
              style="
                margin:18px 0 0;
                color:#9ea3ad;
                font-size:11px;
                line-height:1.6;
                word-break:break-word;
              "
            >
              ${
                error instanceof Error
                  ? error.message
                  : 'Unknown error'
              }
            </p>

          </div>

        </div>

      </div>
    `;

    injectAuthStyles();
  }
}

void initializeBlackShuriken();