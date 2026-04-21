import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import express = require("express");
import cors = require("cors");
import { generateDailyMessage, generateDailyImage, formatGeminiErrorForLog, PeriodId } from "./gemini.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.post("/api/generate-message", async (req, res) => {
  try {
    const result = await generateDailyMessage(req.body.period as PeriodId);
    res.json(result);
  } catch (error) {
    logger.error("Erro message:", formatGeminiErrorForLog(error));
    res.status(500).json({ error: "Falha no texto" });
  }
});

app.post("/api/generate-image", async (req, res) => {
  try {
    const result = await generateDailyImage(req.body.period as PeriodId);
    res.json({ dataUrl: result });
  } catch (error) {
    logger.error("Erro image:", formatGeminiErrorForLog(error));
    res.status(500).json({ error: "Falha na imagem" });
  }
});

export const api = onRequest({ secrets: ["GEMINI_API_KEY"], memory: "512MiB", invoker: "public" }, app);