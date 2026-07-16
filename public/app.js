import { PitchTracker, midiToFreq, midiToNoteName } from "./pitch.js";

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

let listening = false;
let rafId = null;

// Conversation history sent to the coach each turn.
const history = [];

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

  const coachDiv = addMessage("coach", "…");
  let full = "";

  try {
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, context }),
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

    if (full) history.push({ role: "assistant", content: full });
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
