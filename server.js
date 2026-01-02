import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

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

// ---------- УТИЛИТЫ ----------

function logEvent(data) {
  // JSON-лог, удобен для Render / Loki / CloudWatch
  console.log(JSON.stringify(data));
}

// ---------- ENDPOINT ----------

app.post("/speak", async (req, res) => {
  const startedAt = Date.now();

  let {
    text,
    voice,
    emotion,
    speed,
  } = req.body;

  // данные для лога
  const logData = {
    ts: new Date().toISOString(),
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    textLength: typeof text === "string" ? text.length : 0,
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
      return res.status(400).json({ error: "No text provided" });
    }
    text = text.trim();

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

    // ---- ответ ----
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);

    // ---- лог успеха ----
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
