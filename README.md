# TrialBridge

Find clinical trials you can actually understand. TrialBridge searches official registry records, rewrites eligibility criteria in plain language, compares studies, and tells you when a saved trial changes.

> TrialBridge explains trials; it does not give medical advice or decide eligibility. Always confirm with the study team and your doctor.

## Features

**Design**: an iOS-style *Liquid Glass* interface: translucent blurred layers with specular edges over an ambient colour field, a floating tab bar on phones, bottom sheets with a drag handle, segmented controls and iOS switches. Light, dark and auto themes, three text sizes, and a "Reduce transparency" switch (also honours the OS setting). Installable as a PWA with offline shell, app icons and share-card image.

- **Discover**: search ClinicalTrials.gov by condition, place and status, or **near me** (25–200 km) with real distances to the nearest site. Sort, filter by phase, hide trials your age or sex rule out, and see charts of status, phase, cities and accepted ages.
- **My profile** (age, sex, notes) kept on-device for the fit check and AI matching.
- **Plain-language eligibility** with a built-in glossary, plus an interactive **self-check** (Yes / No / Not sure per criterion) that flags what may not fit. Optional **AI explanations** in English, Hindi, Tamil, Bengali, Marathi and Telugu.
- **Visit plan** per trial: next-steps checklist (add your own), questions to ask, one-tap **calendar reminder (.ics)**, call/email the study team, and native **Share**.
- **Follow searches**: get told when new trials appear for a saved search. **Recent searches** for one-tap reruns.
- **Compare** up to three trials side by side (persists across reloads).
- **Saved trials with change tracking**: status, site, age/sex and criteria changes, private notes, progress stats, Copy summary and Print.
- **Web research (TinyFish)** for hospital and news pages beyond the registry.
- **Your data**: export everything as JSON, or delete it all (device and server).
- Shareable deep links (`/#/trial/NCT…`), keyboard accessible, `/` jumps to search.

## Run it

Needs Node.js 18 or newer. No `npm install` required.

```
cp .env.example .env      # Windows: copy .env.example .env
# edit .env and add your keys
node server.js            # open http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `TINYFISH_API_KEY` | Enables web research. Free at agent.tinyfish.ai/api-keys |
| `ANTHROPIC_API_KEY` | Optional. Enables AI explanations and matching |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-sonnet-4-6`) |
| `PORT` | Port to listen on (default 3000) |

Run the tests with `node --test` (unit tests plus a server smoke test).

`CTG_BASE` (override the registry URL, handy for testing) and `TB_DATA_FILE` (store location) are also supported.

## Deploy

`render.yaml` (with health check) and a `Dockerfile` are included. Create a Render web service from this repo (start command `node server.js`) and add the keys as environment variables. Saved trials are kept in `data/store.json`, which free hosting wipes on restart. For a durable deployment, replace `lib/store.js` with Supabase/Postgres.

## Structure

```
server.js          HTTP server, routes, rate limits, security headers
lib/ctg.js         ClinicalTrials.gov search, normalisation, change detection
lib/tinyfish.js    TinyFish Search + Fetch research
lib/ai.js          Optional AI explanations and profile matching
lib/store.js       JSON-file store for saved trials
public/            index.html, app.css (glass design system), app.js, charts.js, boot.js,
                   sw.js + manifest.webmanifest (PWA), icons/ (logo, app icons, share card)
brand/             1024px app icon master for App Store / Play listings
test/              unit tests
```

## API

`GET /healthz` · `GET /api/config` · `GET /api/trials?q=&loc=&status=&page=&geo=lat,lon,km` · `GET /api/trial/:id` · `GET /api/research?id=` · `POST /api/explain` · `GET|POST /api/saved` · `DELETE /api/saved` (erase all) · `DELETE /api/saved/:id` · `POST /api/saved/:id/ack` · `PUT /api/saved/:id/note`

## Privacy

Saved trials and notes are tied to an anonymous browser ID, not an account. Profile details are sent to the AI provider only when you press "Explain this trial" and are not stored by TrialBridge.

## Known limits

- No user accounts or push notifications yet; followed searches are checked when you open the app.
- Saved trials use a JSON file. Move `lib/store.js` to Postgres before real traffic.
- Trial coverage is ClinicalTrials.gov; India’s CTRI is not integrated yet.
- AI output can be wrong. It is labelled as a rough screen, not an eligibility decision.
