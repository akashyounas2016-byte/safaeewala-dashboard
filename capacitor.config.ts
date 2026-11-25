import type { CapacitorConfig } from '@capacitor/cli'

/**
 * R-APP-01: Safaeewala Duties — the Android test app. It opens the live CRM (crm.safaeewala.com/my-duties), so every
 * deploy reaches the phones without a new APK. The app adds what a website cannot: location in the background
 * (phone locked / app closed to the side) through a foreground service with a notification.
 * Push notifications come later (owner, 25 Nov). The APK is built on GitHub (.github/workflows/android-apk.yml).
 */
const config: CapacitorConfig = {
  appId: 'com.safaeewala.duties',
  appName: 'Safaeewala Duties',
  // shown only when the live site cannot be reached (no internet)
  webDir: 'app-shell',
  server: {
    url: 'https://crm.safaeewala.com/my-duties',
    allowNavigation: ['crm.safaeewala.com'],
    errorPath: 'index.html',
  },
  android: {
    // background-geolocation: keeps updates going after 5 minutes in the background
    useLegacyBridge: true,
  },
  plugins: {
    // WebView requests are slowed down in the background — send them natively instead
    CapacitorHttp: { enabled: true },
  },
}

export default config
