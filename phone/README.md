# Eclipse on your phone (Phase 45)

A small Eclipse page you save to your iPhone home screen. It reads your library straight from your Google Drive folder, wherever you are, with no computer on. You can look through your library (with where things stream), tick episodes, search and add titles, and go through recommendations one at a time.

**How it stays safe:** the phone never changes `library.json`. Everything you do on the phone goes into its own file next to it, `from-phone.json`. Next time Eclipse opens on your PC or Mac (or while it's open, as soon as Drive syncs the file in), it adds those changes to your library. If something clashes, for example an episode ticked on both on different days, it asks you which to keep. Until then the phone's top bar says "N waiting for your computer".

**What's online:** only the page itself, on GitHub Pages (free). Your library goes straight from Google Drive to your phone, and your TMDB key stays on the phone.

## One-time setup

You do this once. It takes about 10 minutes. Nothing here is secret, so it's fine to paste the three things you copy into the Claude thread.

### 1. Google Cloud (in Orbit's project)

1. Open [console.cloud.google.com](https://console.cloud.google.com) and sign in. In the project picker at the top, choose the project Orbit uses.
2. **Turn on the APIs.** Menu (☰) → **APIs & Services → Library**. Search **Google Drive API**: if it says *Manage*, it's already on; if it says *Enable*, press it. Do the same for **Google Picker API** and **YouTube Data API v3**.
3. **Allow "only the files you pick".** Type **OAuth consent screen** in the console's search bar, then **Data access** (on older screens: *APIs & Services → OAuth consent screen → Edit app → Scopes*). Press **Add or remove scopes**, tick the one ending in **`/auth/drive.file`** ("See, edit, create and delete only the specific Google Drive files you use with this app"), then **Update** and **Save**. It's a "non-sensitive" permission, so Google doesn't need to review anything.
4. **Make sure you're allowed to sign in.** Menu → **Google Auth Platform → Audience**. If it says *Testing*, check your Google account is in **Test users** (add it if not).
5. **Make the phone's sign-in client.** Menu → **Google Auth Platform → Clients** (or *APIs & Services → Credentials*) → **Create client** (*Create credentials → OAuth client ID*).
   - Application type: **Web application**
   - Name: `Eclipse phone`
   - Authorised JavaScript origins → **Add URI**: `https://looby758.github.io`
   - Authorised redirect URIs → **Add URI**: `https://looby758.github.io/Eclipse/` (with the slash at the end)
   - Press **Create**, and copy the **Client ID** (it ends in `.apps.googleusercontent.com`). Leave the client secret alone: the page doesn't use one.
6. **Make a key for Google's file picker.** Menu → **APIs & Services → Credentials → Create credentials → API key**. When it's made, press **Edit API key** (or the key's name):
   - Name: `Eclipse phone picker`
   - Application restrictions: **None** (Google's picker runs inside a Google page, so a website restriction stops it working)
   - API restrictions: **Restrict key**, and tick **Google Picker API**, **Google Drive API** and **YouTube Data API v3** (the picker quietly uses all three; without them it says "The API developer key is invalid"). If YouTube Data API v3 isn't listed, enable it first under *APIs & Services → Library*.
   - It's safe without a website restriction: the key can only open the picker, and nothing in your Drive can be read without your own Google sign-in.
   - **Save**, then copy the key (it starts with `AIza`).
7. **Find the project number.** Menu → **Cloud overview → Dashboard** (or *IAM & Admin → Settings*). Copy the **Project number** (only digits, not the project ID).

Send Claude the **Client ID**, the **API key** and the **project number**. They go in `phone/src/config.ts`.

### 2. GitHub Pages

On GitHub, open the Eclipse repository → **Settings → Pages**. Under *Build and deployment*, set **Source** to **GitHub Actions**. That's all: the page publishes itself whenever main changes (see *Actions → Phone page*), at **https://looby758.github.io/Eclipse/**.

### 3. On your iPhone

1. Open **https://looby758.github.io/Eclipse/** in **Safari**.
2. Press **Share** (the square with the arrow) → **Add to Home Screen** → **Add**.
3. Open Eclipse from the home screen:
   - **Sign in with Google** (the account with your Eclipse folder).
   - **Pick my Eclipse folder**: find the folder your computer uses for Eclipse in Drive and select it.
   - **Pick library.json**: tap the file called `library.json` inside it.
   - **Paste your TMDB key** (the same one as on your computer: themoviedb.org → Settings → API).

After that it just opens. Google may ask you to sign in again now and then; the page goes back to Google by itself, and you only need to tap if Google wants you to choose your account.

## For developers

- `npm run dev:phone` runs it at http://localhost:5174/Eclipse/ (add `http://localhost:5174` and `http://localhost:5174/Eclipse/` to the sign-in client to sign in there).
- `npm run build:phone` builds it into `phone/dist`.
- It's React plus `src/core` (the same library, TMDB and recommendation code as the desktop app). The phone's changes and how they're folded in are in `src/core/phone.ts`; the computer's side is `src/main/phone.ts` and the question in the window is `src/renderer/src/components/PhoneAsk.tsx`.
- Sign-in is Google's OAuth "web page" flow (an access token in the address, renewed quietly with `prompt=none`), with only the `drive.file` permission. Google's file picker is what grants the page the folder and `library.json`; the page makes `from-phone.json` itself.
