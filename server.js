import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/speak", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

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
          voice: "alena",
          format: "mp3",
        }),
      }
    );

    if (!yandexRes.ok) {
      const err = await yandexRes.text();
      return res.status(500).json({ error: err });
    }

    const buffer = await yandexRes.arrayBuffer();
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("TTS proxy running on port", port);
});
