# PulsePick V1 — Upstox

## Architecture

**Android PWA (GitHub Pages) → Render backend → Upstox Analytics Token → Indian market data**

The browser never receives your Upstox token. Put the token only in the Render environment variable.

Upstox's current Analytics Token is long-lived (1 year), read-only, and supports Market Quote, Historical Data and WebSocket APIs. It does not support order placement. citeturn779656search1turn779656search6

Upstox's market-data API supports full quotes for up to 500 instruments in one request. citeturn779656search0

The Upstox instrument master contains NSE/BSE equity instruments with `instrument_key` values designed for the APIs. citeturn878502search0

## Step 1 — Upstox account

You need an Upstox account. Use the same Upstox account that will be used to generate the API analytics token.

## Step 2 — Create the Analytics Token

Go to the Upstox Developer Apps page:

https://account.upstox.com/developer/apps

Open the **Analytics** tab.

Click **Generate Token** and confirm.

Copy the complete Analytics Token.

Upstox says the Analytics Token is:
- read-only
- valid for 1 year
- generated directly from the Developer Apps page
- intended for market data/analytics
- not able to place or modify orders. citeturn779656search1turn779656search2

**Do not paste the token into GitHub or into the PWA.**

## Step 3 — GitHub

Create a GitHub repository, for example:

`pulsepick`

Upload the **contents of this ZIP** to the repository root.

Keep these folders:

- `assets/`
- `server/`

The important server files are:

`server/package.json`
`server/server.js`

## Step 4 — Render backend

Go to:

https://render.com/

Create/login to Render with GitHub.

Choose:

**New + → Web Service**

Select the `pulsepick` GitHub repository.

Use:

**Name**
`pulsepick-backend`

**Branch**
`main`

**Root Directory**
`server`

**Runtime**
Node

**Build Command**
`npm install`

**Start Command**
`npm start`

Choose **Free** where available and deploy.

Your backend URL should be:

`https://pulsepick-backend.onrender.com`

The PWA already has this exact URL hardcoded.

## Step 5 — Put the Upstox token into Render

After the Render service is created:

Open your Render service.

Go to:

**Environment**

Add an environment variable:

**Key**
`UPSTOX_ANALYTICS_TOKEN`

**Value**
Paste the complete Upstox Analytics Token.

Save changes.

Render will redeploy/restart the backend.

**Never put the token in GitHub.**

## Step 6 — Test Render

Open:

`https://pulsepick-backend.onrender.com/health`

It should return something showing:

`ok: true`

and `upstoxConfigured: true`.

Then open the PWA and go:

**⚙ → Connect / Test**

The app will check the Render service and Upstox market data.

You should see something like:

> **Connected ✓**
>
> Upstox is connected. XXXX NSE equity instruments available; sample prices received.

## Step 7 — GitHub Pages

In GitHub:

**Settings → Pages**

Choose:

**Deploy from a branch**

Branch:

`main`

Folder:

`/ (root)`

Save.

GitHub will publish the PWA at a URL similar to:

`https://YOUR-USERNAME.github.io/pulsepick/`

Open it on Android Chrome.

Then:

**Chrome menu → Add to Home screen / Install app**

The included icons and manifest make it install as a PWA.

## Step 8 — Daily workflow

Open PulsePick.

Tap:

**Refresh today**

Then enter:

**Budget:** ₹5,000

**Profit target:** ₹500

**Hold up to:** 30 days

Tap:

**Find my stocks**

The app scans the available Upstox NSE equity universe, combines the latest quote data with recent daily historical candles and news, then filters the universe.

It may return:

> HCLTECH × 1  
> BAJFINANCE × 2  
> SBIN × 1
>
> Expected hold: 8–24 days
>
> Target: ₹XXX
>
> Possible profit: ₹XXX–₹XXX

It can also say:

> **WAIT — No suitable opportunity today.**

It does not force a trade.

## Step 9 — Trading

The PWA does **not place trades**.

You continue buying/selling manually in Groww.

The Upstox Analytics Token is read-only and cannot place orders. citeturn779656search1

## Data behavior

For the morning scan:

1. Load the current Upstox NSE equity instrument master.
2. Request full market quotes in batches of up to 500 instruments. citeturn779656search0
3. Rank candidates.
4. Fetch daily historical candles for the strongest candidates.
5. Calculate recent momentum/trend/volume features.
6. Apply the positive-return/downside filter.
7. Build the best whole-share mix for the requested budget.
8. Save the prediction locally for later checks.

Upstox's Historical Candle V3 provides daily data back to January 2000, subject to the API's retrieval limits. citeturn315633search1turn315633search2

## Important limitations

This V1 is a **research/prediction tool**, not a profit guarantee.

The app deliberately hides stocks where the model does not expect a positive result, but unexpected market moves can still produce losses.

The news portion currently uses public Google News RSS through the Render backend.

The Upstox market data is the key upgrade: the app no longer relies on Yahoo for stock prices.

## Updating the app

For later PWA changes:

1. Replace the GitHub repository contents with the new version.
2. Render automatically redeploys `server/` when GitHub changes.
3. The PWA service worker checks for a new version at startup and removes older PulsePick caches.
4. Do not delete/recreate the Render service.

## Security

Never publish:
- Upstox Analytics Token
- Upstox API secret
- Groww API secret
- Groww access token
- Render environment values

The Upstox token belongs only in Render's Environment settings.
