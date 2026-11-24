import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, signInAnonymously, type User } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getRemoteConfig, fetchAndActivate, getNumber } from 'firebase/remote-config';
import { firebaseConfig, isFirebaseConfigured, recaptchaSiteKey } from './firebase-config';
import { DEFAULT_TOKEN_MARGIN } from './routing';

export interface Backend {
  app: FirebaseApp;
  db: Firestore;
  user: User | null;
  /** value of Remote Config `device_token_margin`, or the default when unavailable */
  tokenMargin: number;
  notes: string[];
}

let cached: Promise<Backend | null> | undefined;

/** Starts Firebase once. Resolves to null when no Firebase values are configured. */
export function startFirebase(): Promise<Backend | null> {
  if (!isFirebaseConfigured) return Promise.resolve(null);
  cached ??= (async () => {
    const notes: string[] = [];
    const app = initializeApp(firebaseConfig);

    // App Check must exist before AI calls. The debug token is read from the browser console, never from code.
    if (import.meta.env.DEV) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    if (import.meta.env.DEV || recaptchaSiteKey) {
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey ?? 'debug-placeholder'),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (e) {
        notes.push(`App Check failed: ${(e as Error).message}`);
      }
    } else {
      notes.push('App Check is not configured (VITE_RECAPTCHA_SITE_KEY missing).');
    }

    let user: User | null = null;
    try {
      user = (await signInAnonymously(getAuth(app))).user;
    } catch (e) {
      notes.push(`Anonymous sign-in failed: ${(e as Error).message}`);
    }

    let tokenMargin = DEFAULT_TOKEN_MARGIN;
    try {
      const rc = getRemoteConfig(app);
      rc.defaultConfig = { device_token_margin: DEFAULT_TOKEN_MARGIN };
      rc.settings.minimumFetchIntervalMillis = 3600_000;
      await fetchAndActivate(rc);
      const v = getNumber(rc, 'device_token_margin');
      if (v > 0 && v <= 1) tokenMargin = v;
    } catch (e) {
      notes.push(`Remote Config unavailable, using default margin ${DEFAULT_TOKEN_MARGIN}: ${(e as Error).message}`);
    }

    return { app, db: getFirestore(app), user, tokenMargin, notes };
  })();
  return cached;
}
