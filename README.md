# Cloudguessr ☁️🛰️

A **GeoGuessr-style game played from moving overhead footage**. You watch a slow
aerial/satellite/drone shot looking straight down, then drop a pin on the world
map where you think it is. You score on **accuracy** (how close your pin is) and
**speed** (how fast you answered).

No build step, no API keys, no dependencies to install — it's a static site that
runs anywhere and deploys to GitHub Pages as-is.

## Play locally

```bash
npm run serve     # → http://localhost:4173
```

(Or open `index.html` through any static file server. Leaflet loads from a CDN,
so you need an internet connection for the maps and satellite tiles.)

## How it works

```
index.html          App shell + the four screens (start / game / result / final).
assets/flyover.js   The "synthesized" footage type — orbits Esri satellite tiles.
assets/app.js       Game engine: round loop, scoring, guess map, result map.
assets/styles.css   Look & feel.
data/rounds.json    The round pool + game config (THE file you edit to add content).
scripts/serve.js    Zero-dependency local preview server.
.github/workflows/  GitHub Pages deploy (static, no build).
```

### The three footage types

Every round in `data/rounds.json` declares a `type`. Mixing them is what gives a
game its variety:

| `type`        | What it is                                            | Source / licensing |
|---------------|-------------------------------------------------------|---------------------|
| `synthesized` | A slow orbiting "drone" pass over **Esri World Imagery** satellite tiles. Fully controllable, exact coordinates, no API key. | Esri (free tiles, attribution required) |
| `youtube`     | An embedded YouTube clip (real drone/aerial footage). | You curate embeddable clips + verify their location |
| `video`       | A direct `<video>` file (mp4/webm).                   | Best with **public-domain / CC** clips (NASA, Wikimedia Commons, USGS) |

The shipped pool is mostly `synthesized` (it always works), plus one **disabled
example** each for `youtube` and `video` showing the exact shape to fill in.

### Adding a location

Append to the `rounds` array in `data/rounds.json`.

**Synthesized** (easiest — only needs coordinates):

```json
{
  "id": "petra",
  "type": "synthesized",
  "lat": 30.3285, "lng": 35.4444,
  "startZoom": 17, "driftZoom": 16.2,
  "label": "Petra — Jordan",
  "credit": "Imagery © Esri, Maxar, Earthstar Geographics"
}
```

- `startZoom` is the close-in opening altitude; `driftZoom` is where it eases out
  to. Higher numbers = closer. Use ~17 for a single building, ~14 for a mountain.
- `label` and `credit` are shown **only on the reveal**, never during play.

**YouTube** (curate real footage):

```json
{
  "id": "iceland-rift",
  "type": "youtube",
  "videoId": "dQw4w9WgXcQ",
  "start": 12,
  "lat": 64.1466, "lng": -21.9426,
  "label": "Reykjavík — Iceland",
  "credit": "Drone footage: <channel/author>"
}
```

> Pick clips whose owner allows embedding, and **verify the real coordinates**
> yourself — don't trust the title. Set `"disabled": true` to keep one in the
> file without putting it into rotation.

**Video** (public-domain / CC files):

```json
{
  "id": "dc-flyover",
  "type": "video",
  "src": "https://upload.wikimedia.org/.../Aerial_view.webm",
  "lat": 38.8895, "lng": -77.0353,
  "label": "Washington, D.C. — USA",
  "credit": "Public domain — NASA / Wikimedia Commons"
}
```

Good public-domain / openly-licensed sources for `video`:

- **Wikimedia Commons** — filter by public-domain / CC license; many have a
  documented location.
- **NASA** (nasa.gov, images.nasa.gov) and **ISS Earth-viewing** passes — public
  domain.
- **USGS / EROS**, **Sentinel/Copernicus**, **Landsat** time-lapses.

### Game config

Top of `data/rounds.json`:

```json
"config": {
  "roundsPerGame": 5,
  "roundTimeLimit": 90,
  "maxAccuracyScore": 5000,
  "maxSpeedBonus": 1000
}
```

### Scoring

- **Accuracy** = `5000 · e^(−distance_km / 2000)` — 5000 at the bullseye, ~halves
  every ~1,400 km. Tune the falloff in `accuracyScore()` in `assets/app.js`.
- **Speed bonus** = up to 1000, scaling linearly from full (instant) to zero (at
  the time limit). Running out of time with no pin scores 0 for the round.

## Deploy

Pushing to `main` triggers `.github/workflows/pages.yml`, which publishes the
static site to **GitHub Pages**. Enable it once under
**Settings → Pages → Source: GitHub Actions**.

## Licensing note

Map tiles are © OpenStreetMap contributors; satellite imagery is © Esri and its
providers — both are used here under their standard attribution terms (shown
in-app). If you add `youtube`/`video` rounds, make sure you have the right to use
that footage. Prefer public-domain and Creative-Commons sources.
