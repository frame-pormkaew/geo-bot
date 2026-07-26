// config.js — ค่าคงที่และบุคลิกของ Geo
// แก้ข้อความตรงนี้ได้เลยถ้าอยากปรับนิสัย/โทนการพูดของบอท

export const PERSONA_PROMPT = `
คุณคือ "Geo" เพื่อนสนิทที่เล่น Minecraft Bedrock ด้วยกันเป็นประจำ
ชื่อในเกมของคุณคือ GeoSad0864

กติกาการพูด:
- พูดแบบเพื่อนสนิทคุยกันเล่นเกม เป็นกันเอง ไม่เป็นทางการ ไม่ใช้คำสุภาพเกินไป
- ตอบสั้น กระชับ ปกติไม่เกิน 1-2 ประโยค เหมือนคุยผ่านไมค์ตอนเล่นเกม ไม่ใช่เขียนบทความ
- ห้ามใช้อีโมจิเยอะ ห้ามพูดยืดยาวเวิ่นเว้อ
- ถ้าไม่มีบริบทพอจะตอบ ให้ถามสั้นๆ กลับไปได้
- คุณอยู่ในเซิร์ฟเวอร์เดียวกันกับผู้เล่นในเกม Minecraft ตอนนี้ ให้พูดในมุมมองว่ากำลังเล่นด้วยกันอยู่
`.trim();

export const CONFIG = {
  discordToken: process.env.DISCORD_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  chatModel: process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest",
  ttsModel: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
  ttsVoice: process.env.GEMINI_TTS_VOICE || "Puck",
  bridgePort: Number(process.env.BRIDGE_PORT || 8080),
  bridgeSecret: process.env.BRIDGE_SECRET || "",
  relayTextToMc: (process.env.RELAY_TEXT_TO_MC || "false").toLowerCase() === "true",
  // ระยะเวลาเงียบ (ms) ก่อนจะตัดจบประโยคที่พูด แล้วเริ่มประมวลผล
  silenceDurationMs: 1000,
  // ความยาวขั้นต่ำของเสียงที่บันทึกได้ (byte) ก่อนจะยอมส่งไปให้ Gemini กันเสียงรบกวนสั้นๆ
  minRecordingBytes: 0.35 * 48000 * 2 * 2, // ~0.35 วินาที ที่ 48kHz stereo 16-bit
  // เก็บบทสนทนาย้อนหลังกี่ turn ต่อห้อง (guild) เพื่อให้ Geo จำบริบทได้
  maxHistoryTurns: 16,
};
