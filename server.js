import express from "express";
import fetch from "node-fetch";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json());

// ---------- RATE LIMIT ----------

const speakLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 20,             // 20 запросов
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        status: "rate_limited",
      })
    );
    res.status(429).json({ error: "Too many requests" });
  },
});

// применяем ТОЛЬКО к /speak
app.post("/speak", speakLimiter);

// ---------- КОНФИГ ----------

const ALLOWED_VOICES = new Set([
  "alena",
  "oksana",
  "jane",
  "filipp",
  "ermil",
  "zahar",
]);

const ALLOWED_EMOTIONS = new Set([
  "neutral",
  "good",
  "evil",
]);

const DEFAULT_VOICE = "alena";
const DEFAULT_EMOTION = "neutral";
const DEFAULT_SPEED = 1.0;

const MIN_SPEED = 0.5;
const MAX_SPEED = 1.5;

const MAX_TEXT_CHARS = 300;

// ---------- УТИЛИТЫ ----------

function logEvent(data) {
  console.log(JSON.stringify(data));
}

function trimText(text, maxChars) {
  if (text.length <= maxChars) {
    return { text, trimmed: false };
  }

  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const safeText = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;

  return {
    text: safeText + "…",
    trimmed: true,
  };
}

// ---------- ENDPOINT ----------

app.post("/speak", async (req, res) => {
  const startedAt = Date.now();

  let { text, voice, emotion, speed } = req.body;

  const logData = {
    ts: new Date().toISOString(),
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    textLength: typeof text === "string" ? text.length : 0,
    trimmed: false,
    voice,
    emotion,
    speed,
    status: "unknown",
    durationMs: null,
  };

  try {
    // ---- text ----
    if (!text || typeof text !== "string" || !text.trim()) {
      logData.status = "bad_request";
      logEvent(logData);
      return res.status(400).json({ error: "No text provided" });
    }

    text = text.trim();

    const trimmed = trimText(text, MAX_TEXT_CHARS);
    text = trimmed.text;
    logData.trimmed = trimmed.trimmed;

    // ---- voice ----
    if (!ALLOWED_VOICES.has(voice)) {
      voice = DEFAULT_VOICE;
    }

    // ---- emotion ----
    if (!ALLOWED_EMOTIONS.has(emotion)) {
      emotion = DEFAULT_EMOTION;
    }

    // ---- speed ----
    speed = Number(speed);
    if (Number.isNaN(speed)) {
      speed = DEFAULT_SPEED;
    }
    speed = Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED);

    // ---- запрос к Яндексу ----
    const yandexRes = await fetch(
      "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize",
      {
        method: "POST",
        headers: {
          "Authorization": `Api-Key ${process.env.YANDEX_API_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          text,
          lang: "ru-RU",
          voice,
          emotion,
          speed: speed.toString(),
          format: "mp3",
        }),
      }
    );

    if (!yandexRes.ok) {
      const err = await yandexRes.text();
      logData.status = "yandex_error";
      logData.durationMs = Date.now() - startedAt;
      logEvent(logData);
      return res.status(500).json({ error: err });
    }

    const buffer = Buffer.from(await yandexRes.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);

    logData.status = "ok";
    logData.durationMs = Date.now() - startedAt;
    logData.voice = voice;
    logData.emotion = emotion;
    logData.speed = speed;

    logEvent(logData);
  } catch (e) {
    logData.status = "exception";
    logData.durationMs = Date.now() - startedAt;
    logEvent(logData);
    res.status(500).json({ error: e.message });
  }
});

// ---------- SERVER ----------

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("TTS proxy running on port", port);
});
