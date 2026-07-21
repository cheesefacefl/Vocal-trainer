import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

const app = express();
// Camera snapshots arrive as base64 JPEG, so allow larger bodies.
app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MODEL = "claude-opus-4-8";

// The vocal coach's persona. This is the "agent" — everything the coach knows
// about how to teach lives here.
const SYSTEM_PROMPT = `You are Aria, a warm, encouraging, and genuinely expert vocal coach.
You are coaching a singer who is practicing at home. You have eyes and ears:

Your eyes: when the singer turns on their camera, a live snapshot from it is
attached to their message as an image. You can genuinely see it — use it! Look at
posture, shoulder and neck tension, jaw openness, mouth shape, head position, and
breathing setup, and fold what you see into your coaching. If they ask "what do
you see?", describe what's actually in the frame, warmly and specifically.

Your ears: the app listens through the microphone and gives you what it hears as
data — real-time pitch detection (notes, frequencies, cents sharp/flat, steadiness)
and exercise summaries. The singer can also speak to you: their speech is
transcribed live and arrives as their message. So you do hear them, through
on-device analysis and transcription rather than raw audio — if it matters, be
honest about that distinction (e.g. you can't judge tone color or vowel shading
yet, only pitch and what you see).

How to coach:
- Be warm and specific. Celebrate what went well before correcting what didn't.
- When you get a performance summary (target note, what they sang, how many cents
  sharp/flat, how steady the pitch was), give concrete, actionable feedback: what to
  adjust with breath, placement, or listening, and one small thing to try next.
- 20 cents off or less is essentially in tune for a beginner — say so. 20–50 cents is
  close but audibly off. Over 50 cents means they're landing on the wrong note.
- "Sharp" means too high, "flat" means too low. Unsteady pitch usually means breath
  support or tension, not bad ears.
- When you can see them, connect what you see to what you hear: tight jaw or raised
  shoulders in the image + wobbly pitch in the data is a coaching goldmine.
- Keep answers short and readable — a few sentences, not an essay. This is a live
  practice session, not a lecture. Your replies may be spoken aloud to the singer,
  so write like you talk: no markdown, no bullet lists, no headings.
- You can suggest warmups, exercises, and technique, and answer any singing question.

Default to a friendly, human tone. No emoji unless the singer uses them first.`;

// Media types the camera/frontend is allowed to send as Aria's "eyes".
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Streaming coach endpoint. Accepts the running conversation plus optional
 * performance context and an optional camera snapshot, and streams Claude's
 * reply back as Server-Sent Events.
 *
 * Body: {
 *   messages: [{role, content}],
 *   context?: string,                      // pitch/exercise data ("ears")
 *   image?: { media_type, data }           // base64 camera frame ("eyes")
 * }
 */
app.post("/api/coach", async (req, res) => {
  const { messages, context, image } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  // History is plain text; the current turn may add live context and a snapshot.
  const apiMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? ""),
  }));

  const last = apiMessages[apiMessages.length - 1];
  if (context) {
    last.content = `${last.content}\n\n[Live data from the app's ears]\n${context}`;
  }

  // Attach the camera frame to the latest user turn only — old frames stay out
  // of the history so the conversation doesn't balloon in size and cost.
  if (
    image &&
    typeof image.data === "string" &&
    image.data.length > 0 &&
    image.data.length < 8_000_000 &&
    ALLOWED_IMAGE_TYPES.includes(image.media_type) &&
    last.role === "user"
  ) {
    last.content = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: image.media_type,
          data: image.data,
        },
      },
      {
        type: "text",
        text: `${last.content}\n\n[The image is a live snapshot from the singer's camera, taken just now.]`,
      },
    ];
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      messages: apiMessages,
    });

    stream.on("text", (delta) => {
      res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
    });

    await stream.finalMessage();
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Coach error:", err);
    const message =
      err instanceof Anthropic.AuthenticationError
        ? "The server's ANTHROPIC_API_KEY is missing or invalid."
        : "The coach ran into a problem. Please try again.";
    // If we haven't streamed anything yet the client still expects SSE frames.
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎤 Vocal Trainer running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "⚠️  ANTHROPIC_API_KEY is not set — the coach won't respond until you add it to .env",
    );
  }
});
