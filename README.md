# 🎤 Aria — AI Vocal Trainer & Coach

An AI vocal coach with **eyes and ears**. Aria detects your pitch in real time
right in the browser, sees you through your camera, listens as you talk to her,
and gives you warm, specific feedback powered by Claude.

- 🎯 **Live tuner** — sing a note and see exactly which note it is and whether
  you're sharp or flat, down to the cent.
- 👁 **Aria's eyes** — open your camera and Aria genuinely sees you (via Claude
  vision): posture, jaw tension, mouth shape. Ask her "what do you see?"
- 👂 **Aria's ears** — she hears what you just sang (a rolling 10-second pitch
  memory rides along with every message), and you can tap the mic and *talk* to
  her — your speech is transcribed live.
- 🗣 **Aria's voice** — flip a toggle and she speaks her replies aloud.
- 🎵 **Match-the-note exercises** — Aria plays a target note; you sing it back
  and she scores your accuracy and steadiness.
- 💬 **Coaching chat** — ask Aria anything about breathing, warmups, range, or
  technique, and get feedback tailored to how you just performed.

Your raw audio **never leaves your device** — pitch detection and speech
transcription happen locally in the browser; only the resulting numbers and text
are sent to the coach. Camera snapshots are only sent while you keep her eyes
open, and only attached to the message you're currently sending.

## How it works

```
Browser (mic → pitch detection, speech-to-text;
         camera → snapshot)          ──▶  Aria's feedback appears in chat
        │                                        ▲        (or is spoken aloud)
        │  pitch summary + snapshot + questions  │
        ▼                                        │
   Node server  ──────────────────▶  Claude API (vision + the coaching "agent")
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
