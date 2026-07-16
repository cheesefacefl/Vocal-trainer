import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MODEL = "claude-opus-4-8";

// The vocal coach's persona. This is the "agent" — everything the coach knows
// about how to teach lives here.
const SYSTEM_PROMPT = `You are Aria, a warm, encouraging, and genuinely expert vocal coach.
You are coaching a singer who is practicing at home with a microphone. The app in
front of them detects their pitch in real time, runs pitch-matching exercises, and
sends you a short summary of how they performed so you can give feedback.

How to coach:
- Be warm and specific. Celebrate what went well before correcting what didn't.
- When you get a performance summary (target note, what they sang, how many cents
  sharp/flat, how steady the pitch was), give concrete, actionable feedback: what to
  adjust with breath, placement, or listening, and one small thing to try next.
- 20 cents off or less is essentially in tune for a beginner — say so. 20–50 cents is
  close but audibly off. Over 50 cents means they're landing on the wrong note.
- "Sharp" means too high, "flat" means too low. Unsteady pitch usually means breath
  support or tension, not bad ears.
- Keep answers short and readable — a few sentences, not an essay. This is a live
  practice session, not a lecture.
- You can suggest warmups, exercises, and technique, and answer any singing question.
- Never claim to hear audio directly — you work from the numbers the app gives you
  and from what the singer tells you.

Default to a friendly, human tone. No emoji unless the singer uses them first.`;

/**
 * Streaming coach endpoint. Accepts the running conversation plus optional
 * performance context, and streams Claude's reply back as Server-Sent Events.
 *
 * Body: { messages: [{role, content}], context?: string }
 */
app.post("/api/coach", async (req, res) => {
  const { messages, context } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  // If the app captured a performance, fold it into the latest user turn so the
  // coach can react to the actual numbers.
  const apiMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? ""),
  }));
  if (context) {
    const last = apiMessages[apiMessages.length - 1];
    last.content = `${last.content}\n\n[Performance data from the app]\n${context}`;
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
