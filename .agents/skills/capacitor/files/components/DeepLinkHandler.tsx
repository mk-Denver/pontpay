import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * Forwards OS-level deep-link opens into the React Router navigation stack.
 *
 * When the OS launches your app via a URL (a `https://your-domain.com/post/123`
 * universal link or a `myapp://post/123` custom-scheme link), Capacitor fires
 * an `appUrlOpen` event. This component listens for it and calls
 * `navigate(pathname + search + hash)` so the app lands on the intended
 * in-app route instead of staying on whatever page it was on.
 *
 * Must be rendered **inside** a `<BrowserRouter>` (so `useNavigate` works).
 * Safe to render unconditionally — on web it is a no-op.
 *
 * To enable deep links:
 *
 * **iOS (Universal Links):**
 * 1. Add your domain under *Signing & Capabilities → Associated Domains*
 *    as `applinks:your-domain.com`
 * 2. Host an `apple-app-site-association` file at
 *    `https://your-domain.com/.well-known/apple-app-site-association`
 *
 * **iOS (custom scheme):**
 * 1. Set `ios.scheme` in `capacitor.config.ts`
 * 2. Capacitor already registers the scheme in Info.plist's
 *    `CFBundleURLSchemes` during `npx cap sync`
 *
 * **Android (App Links):**
 * 1. Declare an `<intent-filter android:autoVerify="true">` with your
 *    domain in `android/app/src/main/AndroidManifest.xml`
 * 2. Host a `assetlinks.json` file at
 *    `https://your-domain.com/.well-known/assetlinks.json`
 *
 * **Android (custom scheme):**
 * 1. Add an `<intent-filter>` with `<data android:scheme="myapp" />` in
 *    the manifest
 *
 * @example
 *   // In AppRouter.tsx, inside BrowserRouter:
 *   <BrowserRouter>
 *     <DeepLinkHandler />
 *     <ScrollToTop />
 *     <Routes>...</Routes>
 *   </BrowserRouter>
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    async function setup() {
      const { App } = await import('@capacitor/app');

      // Handle URLs opened while the app is already running
      const listener = await App.addListener('appUrlOpen', (event) => {
        try {
          const url = new URL(event.url);
          const path = url.pathname + url.search + url.hash;
          if (path) {
            navigate(path);
          }
        } catch {
          // Invalid URL, ignore
        }
      });

      cleanup = () => listener.remove();
    }

    setup();

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  return null;
}
