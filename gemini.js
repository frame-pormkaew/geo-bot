// gemini.js — รวมทุกอย่างที่คุยกับ Gemini: แชทข้อความ, ฟังเสียงแล้วตอบ, และพูด (TTS)

import { GoogleGenAI } from "@google/genai";
import { CONFIG, PERSONA_PROMPT } from "./config.js";
import { pcmToWav } from "./wav.js";

const ai = new GoogleGenAI({ apiKey: CONFIG.geminiApiKey });

/**
 * แชทตอบข้อความล้วน โดยอิงประวัติการคุยที่ส่งมา
 * @param {Array<{role:'user'|'model', text:string}>} history
 * @param {string} userText
 * @returns {Promise<string>}
 */
export async function chatReply(history, userText) {
  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: userText }] },
  ];

  const response = await ai.models.generateContent({
    model: CONFIG.chatModel,
    contents,
    config: { systemInstruction: PERSONA_PROMPT },
  });

  return (response.text || "").trim();
}

/**
 * ฟังเสียงที่อัดมาจาก Discord (WAV buffer) แล้วให้ Geo ตอบกลับเป็นข้อความ
 * Gemini เข้าใจเสียงได้โดยตรง ไม่ต้องแปลงเป็นข้อความเองก่อน
 * @param {Array<{role:'user'|'model', text:string}>} history
 * @param {Buffer} wavBuffer
 * @returns {Promise<string>}
 */
export async function voiceReply(history, wavBuffer) {
  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: "audio/wav",
            data: wavBuffer.toString("base64"),
          },
        },
        {
          text: "นี่คือคลิปเสียงที่เพื่อนพูดผ่านไมค์ในดิสคอร์ด ฟังแล้วตอบกลับตามบุคลิกของคุณ",
        },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: CONFIG.chatModel,
    contents,
    config: { systemInstruction: PERSONA_PROMPT },
  });

  return (response.text || "").trim();
}

/**
 * แปลงข้อความเป็นเสียงพูด (WAV, 24kHz mono) ด้วย Gemini TTS
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function synthesizeSpeech(text) {
  const response = await ai.models.generateContent({
    model: CONFIG.ttsModel,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: CONFIG.ttsVoice },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const inline = part?.inlineData;
  if (!inline?.data) {
    throw new Error("Gemini TTS ไม่คืนค่าเสียงกลับมา (ตรวจ GEMINI_TTS_MODEL/โควต้า)");
  }

  const pcm = Buffer.from(inline.data, "base64");
  // Gemini TTS คืนค่าเป็น raw PCM 16-bit, มักเป็น mono 24kHz (mime: audio/L16;rate=24000)
  const rateMatch = /rate=(\d+)/.exec(inline.mimeType || "");
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

  return pcmToWav(pcm, { sampleRate, channels: 1 });
}
