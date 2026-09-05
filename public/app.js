import { PitchTracker, midiToFreq, midiToNoteName } from "./pitch.js";

// Register the service worker so Aria installs and loads like a native app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const tracker = new PitchTracker();

// DOM
const micBtn = document.getElementById("micBtn");
const noteEl = document.getElementById("note");
const freqEl = document.getElementById("freq");
const needleEl = document.getElementById("needle");
const centsEl = document.getElementById("cents");
const exerciseBtn = document.getElementById("exerciseBtn");
const exerciseStatus = document.getElementById("exerciseStatus");
const chatEl = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const camBtn = document.getElementById("camBtn");
const lookBtn = document.getElementById("lookBtn");
const camVideo = document.getElementById("camVideo");
const voiceBtn = document.getElementById("voiceBtn");
const speakToggle = document.getElementById("speakToggle");

let listening = false;
let rafId = null;

// Conversation history sent to the coach each turn (text only — snapshots are
// attached to the current turn, not stored).
const history = [];

// --- Aria's ears: rolling memory of what the mic heard -----------------------

// Voiced pitch readings from the last ~10 seconds, so Aria "hears" what you
// were just singing even when you didn't run a formal exercise.
const recentReadings = [];
const HEARING_WINDOW_MS = 10_000;

function rememberReading(reading) {
  const now = performance.now();
  recentReadings.push({ t: now, note: reading.note, freq: reading.freq });
  while (recentReadings.length && now - recentReadings[0].t > HEARING_WINDOW_MS) {
    recentReadings.shift();
  }
}

function hearingSummary() {
  if (!listening || recentReadings.length < 5) return null;
  const notes = [...new Set(recentReadings.map((r) => r.note))];
  const freqs = recentReadings.map((r) => r.freq);
  const min = Math.min(...freqs).toFixed(0);
  const max = Math.max(...freqs).toFixed(0);
  return (
    `In the last ~10 seconds the mic heard the singer voicing these notes: ` +
    `${notes.join(", ")} (range ${min}–${max} Hz, ${recentReadings.length} voiced frames).`
  );
}

// --- Live tuner loop ---------------------------------------------------------

function tick() {
  const reading = tracker.read();
  if (reading) {
    noteEl.textContent = reading.note;
    freqEl.textContent = `${reading.freq.toFixed(1)} Hz`;

    const cents = reading.cents;
    // Map -50..+50 cents onto 0..100% of the needle track.
    const pct = Math.max(0, Math.min(100, 50 + cents));
    needleEl.style.left = `${pct}%`;

    if (Math.abs(cents) <= 10) {
      noteEl.style.color = "var(--in-tune)";
      centsEl.textContent = "In tune ✓";
      centsEl.style.color = "var(--in-tune)";
    } else {
      const dir = cents > 0 ? "sharp" : "flat";
      noteEl.style.color = cents > 0 ? "var(--sharp)" : "var(--flat)";
      centsEl.textContent = `${Math.abs(cents)}¢ ${dir}`;
      centsEl.style.color = cents > 0 ? "var(--sharp)" : "var(--flat)";
    }

    rememberReading(reading);

    // Feed the current exercise, if one is running.
    if (activeExercise) activeExercise.sample(reading);
  }
  rafId = requestAnimationFrame(tick);
}

async function toggleMic() {
  if (listening) {
    tracker.stop();
    cancelAnimationFrame(rafId);
    listening = false;
    micBtn.textContent = "Start listening";
    micBtn.classList.remove("listening");
    exerciseBtn.disabled = true;
    noteEl.textContent = "—";
    freqEl.textContent = "Stopped";
    centsEl.textContent = "";
    needleEl.style.left = "50%";
    recentReadings.length = 0;
    return;
  }

  try {
    await tracker.start();
    listening = true;
    micBtn.textContent = "Stop listening";
    micBtn.classList.add("listening");
    exerciseBtn.disabled = false;
    freqEl.textContent = "Sing a note…";
    tick();
  } catch (err) {
    freqEl.textContent = "Microphone access denied.";
    console.error(err);
  }
}

micBtn.addEventListener("click", toggleMic);

// --- Aria's eyes: camera + snapshots -----------------------------------------

let camStream = null;

async function toggleEyes() {
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    camVideo.srcObject = null;
    camVideo.hidden = true;
    camBtn.textContent = "Open Aria's eyes";
    camBtn.classList.remove("listening");
    lookBtn.disabled = true;
    return;
  }

  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 } },
      audio: false,
    });
    camVideo.srcObject = camStream;
    camVideo.hidden = false;
    await camVideo.play();
    camBtn.textContent = "Close eyes";
    camBtn.classList.add("listening");
    lookBtn.disabled = false;
  } catch (err) {
    addMessage("system", "Camera access was denied — Aria can't see you.");
    console.error(err);
  }
}

// Grab the current frame as base64 JPEG, downscaled so requests stay small.
function captureFrame() {
  if (!camStream || !camVideo.videoWidth) return null;
  const w = camVideo.videoWidth;
  const h = camVideo.videoHeight;
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(camVideo, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: dataUrl.split(",")[1] };
}

camBtn.addEventListener("click", toggleEyes);

lookBtn.addEventListener("click", () => {
  askCoach(
    "Take a look at me — what do you see? Anything about my posture or setup I should fix before I sing?",
  );
});

// --- Aria's voice: speak replies aloud ---------------------------------------

function speakReply(text) {
  if (!speakToggle.checked || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1.05;
  // Prefer a natural-sounding English voice when one is available.
  const voice = speechSynthesis
    .getVoices()
    .find((v) => /en[-_]/.test(v.lang) && /female|samantha|karen|serena/i.test(v.name));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

// --- Talk to Aria: speech recognition ----------------------------------------

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let recognizing = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let transcript = "";
    let isFinal = false;
    for (const result of event.results) {
      transcript += result[0].transcript;
      if (result.isFinal) isFinal = true;
    }
    chatInput.value = transcript;
    if (isFinal && transcript.trim()) {
      chatInput.value = "";
      askCoach(transcript.trim());
    }
  };

  recognition.onend = () => {
    recognizing = false;
    voiceBtn.classList.remove("recording");
    voiceBtn.textContent = "🎙";
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed") {
      addMessage("system", "Microphone access for speech was denied.");
    }
  };

  voiceBtn.addEventListener("click", () => {
    if (recognizing) {
      recognition.stop();
      return;
    }
    // Don't let Aria's own voice get transcribed back at her.
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    recognition.start();
    recognizing = true;
    voiceBtn.classList.add("recording");
    voiceBtn.textContent = "◼";
    chatInput.placeholder = "Listening… speak to Aria";
  });
} else {
  voiceBtn.hidden = true;
}

// --- Pitch-match exercise ----------------------------------------------------

let activeExercise = null;

// Comfortable mid-range targets (MIDI): C4..G4-ish for a mixed voice.
const TARGET_MIDIS = [57, 60, 62, 64, 65, 67, 69]; // A3, C4, D4, E4, F4, G4, A4

class MatchExercise {
  constructor(targetMidi) {
    this.targetMidi = targetMidi;
    this.targetNote = midiToNoteName(targetMidi);
    this.samples = [];
    this.collecting = false;
  }

  start() {
    tracker.playTone(midiToFreq(this.targetMidi), 1500);
    exerciseStatus.textContent = `Listen… now sing ${this.targetNote} and hold it.`;
    // Give them a moment to hear the tone, then collect for ~3s.
    setTimeout(() => {
      this.collecting = true;
      exerciseStatus.textContent = `Recording — hold ${this.targetNote}…`;
      setTimeout(() => this.finish(), 3000);
    }, 1600);
  }

  sample(reading) {
    if (this.collecting) this.samples.push(reading);
  }

  finish() {
    this.collecting = false;
    activeExercise = null;
    exerciseBtn.disabled = false;
    exerciseBtn.textContent = "Play another note";

    if (this.samples.length < 5) {
      exerciseStatus.textContent = "Didn't hear enough — try again and sing out.";
      return;
    }

    // Summarize performance relative to the target.
    const centsFromTarget = this.samples.map(
      (s) => Math.round(1200 * Math.log2(s.freq / midiToFreq(this.targetMidi))),
    );
    const avg =
      centsFromTarget.reduce((a, b) => a + b, 0) / centsFromTarget.length;
    const min = Math.min(...centsFromTarget);
    const max = Math.max(...centsFromTarget);
    const spread = max - min; // steadiness: smaller is steadier

    const summary =
      `Exercise: match ${this.targetNote} (${midiToFreq(this.targetMidi).toFixed(1)} Hz).\n` +
      `Average pitch: ${avg >= 0 ? "+" : ""}${avg.toFixed(0)} cents ` +
      `(${avg > 0 ? "sharp" : avg < 0 ? "flat" : "on target"}).\n` +
      `Pitch steadiness: varied by ${spread} cents over the held note ` +
      `(${spread < 30 ? "very steady" : spread < 70 ? "fairly steady" : "wobbly"}).`;

    exerciseStatus.textContent = "Sending your take to Aria…";
    askCoach(
      `I just tried the "match the note" exercise. How did I do, and what should I work on?`,
      summary,
    );
  }
}

exerciseBtn.addEventListener("click", () => {
  if (!listening || activeExercise) return;
  const targetMidi =
    TARGET_MIDIS[Math.floor(Math.random() * TARGET_MIDIS.length)];
  activeExercise = new MatchExercise(targetMidi);
  exerciseBtn.disabled = true;
  activeExercise.start();
});

// --- Coach chat --------------------------------------------------------------

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

async function askCoach(userText, context) {
  addMessage("user", userText);
  history.push({ role: "user", content: userText });

  // Fold in whatever her ears just picked up alongside any exercise data.
  const heard = hearingSummary();
  const fullContext = [context, heard].filter(Boolean).join("\n") || undefined;

  // If her eyes are open, she sees you as you speak.
  const image = captureFrame() ?? undefined;
  if (image) {
    const last = history[history.length - 1];
    last.content += "\n[I had my camera on, so you could see me when I sent this.]";
  }

  const coachDiv = addMessage("coach", "…");
  let full = "";

  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, context: fullContext, image }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        const payload = JSON.parse(line.slice(5).trim());

        if (payload.text) {
          full += payload.text;
          coachDiv.textContent = full;
          chatEl.scrollTop = chatEl.scrollHeight;
        } else if (payload.error) {
          coachDiv.textContent = `⚠️ ${payload.error}`;
        }
      }
    }

    if (full) {
      history.push({ role: "assistant", content: full });
      speakReply(full);
    }
  } catch (err) {
    coachDiv.textContent = "⚠️ Couldn't reach the coach. Is the server running?";
    console.error(err);
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  askCoach(text);
});
