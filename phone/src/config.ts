/**
 * The Google Cloud details the phone page signs in with (Phase 45). None of these are secrets:
 * they're meant to be in a web page, and Google only accepts them from the page's own address
 * (set when the sign-in client and the browser key were made in Google Cloud). There's no client
 * secret here, and never should be.
 *
 * They come from Orbit's Google Cloud project (see phone/README.md for where to find each one).
 */
export const GOOGLE = {
  /** APIs & Services → Credentials → "Eclipse phone" (Web application) → Client ID. Ends in .apps.googleusercontent.com */
  clientId: '',
  /** APIs & Services → Credentials → the browser key for the Picker. Starts with AIza */
  apiKey: '',
  /** The project number (Cloud overview / dashboard). Only digits. Lets the file picker give the page access to what you pick. */
  projectNumber: ''
}

export const isConfigured = (): boolean => !!(GOOGLE.clientId && GOOGLE.apiKey && GOOGLE.projectNumber)
