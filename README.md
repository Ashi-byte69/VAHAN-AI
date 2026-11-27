# Vahan AI website prototype

This is the first Vahan AI website for the larger vehicle-care idea: a garage for cars, bikes, and scooters, vehicle history, a multilingual voice assistant, photo upload, insurance tracking, and a future challan lookup.

## Run it on your laptop

Use two VS Code terminals. Node.js must be installed.

**Terminal 1 — start the local data API**

```powershell
cd server
npm.cmd run dev
```

**Terminal 2 — start the website**

Open a second terminal in the main `vahan-ai` folder and run:

```powershell
npm.cmd run dev
```

Open the `localhost` address shown in Terminal 2, usually `http://localhost:5173`. Leave both terminals running while you use the site. The API uses built-in Node.js features, so it does not need a separate package installation or PostgreSQL setup.

## Turn on live AI replies and photo analysis

The site stays in demo mode until you add a Gemini API key. Create a key in [Google AI Studio](https://aistudio.google.com/app/apikey), staying on the Free Tier and skipping billing setup. In Terminal 1, stop the API with **Ctrl+C**, then from the `server` folder run:

```powershell
Copy-Item .env.example .env
```

Open `server/.env` in VS Code, paste your key after `GEMINI_API_KEY=`, save it, and start the API again with `npm.cmd run dev`. Keep the key private; `server/.env` is excluded from Git. The default model is `gemini-3.5-flash-lite`. Free-tier model access and request limits can change, so check the [Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing). Gemini free-tier prompts and responses may be used to improve Google products, so use sample or non-sensitive data for the college demo.

Photo analysis sends an image to Google Gemini only after the user checks the consent box and clicks **Analyze photo**. Vahan AI does not save the image on its local server. Use sample images for the team demo and cover personal details you do not need analyzed.

## Share a local demo with teammates

1. Start the API in Terminal 1 as above.
2. Start the website in Terminal 2 with:

   ```powershell
   npm.cmd run dev -- --host 0.0.0.0
   ```

3. Send teammates the **Network** address Vite prints, and have them join the same Wi-Fi as your computer. If Windows asks, allow access on private networks only.
4. Keep both terminals and your computer on. The page checks for shared changes every few seconds; refresh if someone’s changes do not appear.

This is a local demo without sign-in or access controls. Use sample information only. If you enabled AI, share the link only on a trusted private Wi-Fi: anyone who can open it can use your server’s API key and consume its free-tier quota. The first browser that connects fills a new shared demo with its current prototype data; changes are then saved to `server/data/workspace.json` on your computer. That file is excluded from Git.

## What works

- Dashboard, vehicle switching, and adding cars, bikes, and scooters
- Vehicle history for service, repair, fuel, odometer, and photo notes
- Save insurance policy details and an expiry date by vehicle
- Browser voice input and spoken replies in the selected language; AI text responses require the server key
- Photo preview and opt-in AI analysis; approved notes can be saved to vehicle history
- Shared local demo storage for vehicles, history, insurance details, and preferences through the Node.js API, with browser storage as a fallback
- Challan lookup and insurance renewal/payment actions are still marked as planned/demo

## Still to build

Sign-in and private user accounts, official challan lookup, insurance renewal actions, and hosted database storage are not connected. Saved insurance details are not verified with an insurer. The shared local JSON file is an early demo store, not a production database. Challan screens do not show live results or take payments. Confirm safety-related vehicle issues with a qualified mechanic.
