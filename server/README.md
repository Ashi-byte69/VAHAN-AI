# Vahan AI local API

The API shares the prototype’s vehicle, history, and settings data between browsers using the local demo link. It uses Node.js built-in modules and stores the demo workspace in `server/data/workspace.json`.

## Start

From this folder, run:

```powershell
npm.cmd run dev
```

The API listens at `http://localhost:4000`. Start the website separately from the project root. Vite forwards `/api` requests to this server.

## Enable AI

Create a free-tier key in [Google AI Studio](https://aistudio.google.com/app/apikey), copy `.env.example` to `.env`, add your `GEMINI_API_KEY`, then restart the API. Stay on the Free Tier and skip billing setup. You can change `GEMINI_MODEL` in that file. Keep `.env` private. The site works in sample-reply mode when the key is absent.

## Routes

- `GET /api/health` — API status
- `GET /api/state` — current shared demo workspace
- `PUT /api/state` — save vehicles, history, selected vehicle, and profile preferences
- `POST /api/assistant` — send a vehicle question to Gemini `generateContent`
- `POST /api/photo-analysis` — analyze an image after the user opts in

This API has no sign-in or access controls and is only for a local prototype. AI requests use the Gemini API key on this server and consume its free-tier quota. Free-tier prompts and responses may be used to improve Google products. Do not expose a keyed demo to an untrusted network or upload sensitive images. Images are sent to Gemini for analysis and are not written to this server's data file. Replace the file store with a secured database and add user authentication before deploying publicly.
