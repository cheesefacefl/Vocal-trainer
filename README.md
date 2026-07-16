# 🎤 Aria — AI Vocal Trainer & Coach

An AI vocal coach that **listens to you sing**. Aria detects your pitch in real
time right in the browser, runs pitch-matching exercises, and gives you warm,
specific feedback powered by Claude.

- 🎯 **Live tuner** — sing a note and see exactly which note it is and whether
  you're sharp or flat, down to the cent.
- 🎵 **Match-the-note exercises** — Aria plays a target note; you sing it back
  and she scores your accuracy and steadiness.
- 💬 **Coaching chat** — ask Aria anything about breathing, warmups, range, or
  technique, and get feedback tailored to how you just performed.

Your audio **never leaves your device** — all pitch detection happens locally in
the browser. Only short performance summaries (numbers like "12 cents sharp") are
sent to the coach.

## How it works

```
Browser (mic → pitch detection)  ──▶  Aria's feedback appears in chat
        │                                        ▲
        │  performance summary + your questions  │
        ▼                                        │
   Node server  ──────────────────▶  Claude API (the coaching "agent")
   (keeps your API key safe)
```

- **Frontend** (`public/`): Web Audio API captures the mic and an autocorrelation
  algorithm (`pitch.js`) estimates your pitch every frame. No audio is uploaded.
- **Backend** (`server.js`): a tiny Express server that holds your Anthropic API
  key and streams the coach's replies. The coach's whole persona lives in the
  system prompt — that's the "agent."

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) 18 or newer.

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key
cp .env.example .env
#   then edit .env and paste your key (from console.anthropic.com)

# 3. Start the app
npm start
```

Open **http://localhost:3000**, click **Start listening**, allow microphone
access, and sing!

> Use headphones for the pitch-matching exercise so the reference tone doesn't
> leak into your mic.

## Deploy it (use it from your phone — no computer needed)

You can host Aria for free on [Render](https://render.com) straight from your
phone's browser, then open her at a web link:

1. Go to **render.com** and sign up (use "Sign in with GitHub").
2. Tap **New → Blueprint**.
3. Pick the **Vocal-trainer** repository. Render reads `render.yaml` automatically.
4. When prompted, paste your **`ANTHROPIC_API_KEY`** (from
   [console.anthropic.com](https://console.anthropic.com/settings/keys)). It's
   stored securely on Render — never in the repo.
5. Tap **Apply** and wait a couple of minutes for the first build.
6. Open the `https://…onrender.com` URL Render gives you in **Safari**, tap
   **Start listening**, and allow the microphone. 🎤

> The free tier goes to sleep after a while of no use, so the first visit after
> a break can take ~30–60 seconds to wake up. After that it's snappy.

## Project layout

| File | What it does |
|------|--------------|
| `server.js` | Express server + streaming `/api/coach` endpoint (defines Aria's persona) |
| `public/index.html` | The single-page UI |
| `public/style.css` | Styling |
| `public/pitch.js` | Browser-side pitch detection (autocorrelation) |
| `public/app.js` | Wires the mic, tuner, exercises, and chat together |

## Ideas for next steps

- Scales and interval exercises (do-re-mi, octave jumps)
- Track progress over time and chart your accuracy
- Let Aria design a warmup routine and walk you through it live
- Record takes so you can play them back

Built with the [Claude API](https://docs.claude.com/).
