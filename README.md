# PulsePick — Indian Stock Predictor PWA V3 (Render hardcoded)

Fresh PWA architecture:

**GitHub Pages → fixed Render backend → public market/news data → PWA**

The Render backend URL is already built into the PWA:
`https://pulsepick-backend.onrender.com`

No Groww credentials are required for this V2 prototype.

## What it does

- Morning **Refresh today** snapshot.
- Enter budget, profit target and maximum holding period.
- Only shows stocks where the model estimates a positive return and acceptable downside.
- Builds a whole-share basket.
- Expected holding period, target and protection level.
- Paper cart and "I've bought" tracking.
- Local prediction history.
- PWA install support and proper icons.

## Important data note

The Render backend uses public Yahoo Finance chart URLs for prototype Indian price/history data and Google News RSS for news. This is **not a licensed real-time NSE feed**. It may be delayed, rate-limited or changed.

Use this V2 for the free 7/15/30-day testing and backtesting stage. Later, the Render backend can be changed to a licensed Indian market-data API (such as Groww) without changing the PWA interface.

---

# A. Deploy the Render backend

## 1. Create GitHub repository

Create a new repository, for example:

`pulsepick`

Upload all files from this project to the repository root.

The important backend files are:

`server/package.json`

`server/server.js`

## 2. Create Render service

Open:

https://render.com/

Create an account and connect GitHub.

Choose:

**New → Web Service**

Select your `pulsepick` repository.

Use:

- **Root Directory:** `server`
- **Environment:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Instance type:** Free (if available on your Render account)

Create the service and wait for deployment.

Render will give you a URL similar to:

`https://pulsepick-backend.onrender.com`

## 3. Test Render

Open:

`https://YOUR-RENDER-URL.onrender.com/health`

You should see:

`{"ok":true}`

Then test:

`https://YOUR-RENDER-URL.onrender.com/`

It should say the PulsePick backend is running.

---

# B. Connect the PWA to Render

1. Open `index.html` after the GitHub Pages site is live.
2. Tap the **⚙** settings button.
3. Paste the Render URL.
4. Tap **Save**.
5. Tap **Test data**.
6. It should report that prices were received.
7. Close settings.
8. Tap **Refresh today**.

The PWA will now call:

`YOUR-RENDER-URL/api/snapshot`

No Groww credentials are required.

---

# C. Deploy the PWA on GitHub Pages

In GitHub:

1. Open the `pulsepick` repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select:
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
4. Save.
5. GitHub will publish the site at a URL similar to:

`https://YOUR-GITHUB-USERNAME.github.io/pulsepick/`

Open that HTTPS URL on Android Chrome.

Use Chrome menu → **Add to Home screen / Install app**.

---

# D. Daily use

1. Open PulsePick from the phone home screen.
2. Tap **Refresh today**.
3. Enter budget, e.g. ₹5,000.
4. Enter profit target, e.g. ₹500.
5. Choose 7 / 15 / 30 days.
6. Tap **Find my stocks**.

The app returns only positive candidates.

It can also say:

**WAIT — no suitable opportunity today.**

That is intentional.

## Disclaimer

The displayed expected returns, target prices and holding periods are model estimates, not guarantees. The free public data bridge is for research/testing and is not an exchange-licensed real-time feed.


## Forced cache/update behavior

V5 is configured to check for a new service worker on app start, use `updateViaCache: "none"`, remove older PulsePick CacheStorage entries, activate the new worker immediately, and reload the PWA once after the new worker takes control.

This is designed to prevent users from staying on an old GitHub Pages build after you upload a new version.


## V6 deployment
Upload/replace **all files and folders**, including `server/` and `assets/`. The Render backend uses `server/`; GitHub Pages uses the root files and `assets/`. The new app icon is already included.
