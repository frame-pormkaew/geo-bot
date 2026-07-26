// voiceHandler.js — เข้าห้องเสียง, ฟังคนพูด (มี silence detection), ส่งเสียงให้ Gemini ฟัง,
// แล้วพูดตอบกลับในห้องเสียง + ส่งข้อความเดียวกันเข้าเกม Minecraft ผ่าน bridge

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  EndBehaviorType,
  StreamType,
} from "@discordjs/voice";
import prism from "prism-media";
import { Readable } from "node:stream";
import ffmpegPath from "ffmpeg-static";
import { CONFIG } from "./config.js";
import { voiceReply, synthesizeSpeech } from "./gemini.js";
import { sendToMinecraft } from "./wsBridge.js";
import { pcmToWav } from "./wav.js";

// ให้ prism-media หา ffmpeg เจอโดยไม่ต้องพึ่งการติดตั้งระดับระบบ (สำคัญมากบน Replit)
process.env.FFMPEG_PATH = ffmpegPath;

/** @type {Map<string, {connection:any, player:any, textChannel:any, history:Array<{role:string,text:string}>, recordingUsers:Set<string>}>} */
const sessions = new Map();

let discordClient = null;
export function setDiscordClient(client) {
  discordClient = client;
}

export function hasSession(guildId) {
  return sessions.has(guildId);
}

export async function joinChannel(voiceChannel, textChannel) {
  const guildId = voiceChannel.guild.id;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false, // ต้องปิด deaf ไม่งั้นบอทจะไม่ได้ยินเสียงใครเลย
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  const player = createAudioPlayer();
  connection.subscribe(player);

  const session = {
    connection,
    player,
    textChannel,
    history: [],
    recordingUsers: new Set(),
  };
  sessions.set(guildId, session);

  connection.receiver.speaking.on("start", (userId) => {
    handleSpeakingStart(guildId, userId).catch((err) =>
      console.error("[voice] handleSpeakingStart error:", err)
    );
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    sessions.delete(guildId);
  });

  return session;
}

export function leaveChannel(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  session.connection.destroy();
  sessions.delete(guildId);
  return true;
}

async function handleSpeakingStart(guildId, userId) {
  const session = sessions.get(guildId);
  if (!session) return;

  const user = discordClient?.users.cache.get(userId);
  if (user?.bot) return; // ไม่ฟังเสียงของบอทตัวเอง/บอทอื่น
  if (session.recordingUsers.has(userId)) return; // กำลังอัดเสียงคนนี้อยู่แล้ว

  session.recordingUsers.add(userId);

  const opusStream = session.connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: CONFIG.silenceDurationMs },
  });
  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

  const chunks = [];
  opusStream.on("error", () => {});
  decoder.on("error", () => {});
  decoder.on("data", (chunk) => chunks.push(chunk));

  decoder.on("end", async () => {
    session.recordingUsers.delete(userId);
    const pcm = Buffer.concat(chunks);
    if (pcm.length < CONFIG.minRecordingBytes) return; // สั้นไป น่าจะเป็นเสียงรบกวน ไม่ใช่คำพูด

    try {
      await processRecording(guildId, userId, pcm);
    } catch (err) {
      console.error("[voice] processRecording error:", err);
      session.textChannel?.send("เอ๊ะ Geo งงๆ ประมวลผลเสียงไม่ผ่านอ่ะ ลองพูดใหม่อีกทีนะ").catch(() => {});
    }
  });

  opusStream.pipe(decoder);
}

async function processRecording(guildId, userId, pcm) {
  const session = sessions.get(guildId);
  if (!session) return;

  const username = discordClient?.users.cache.get(userId)?.username || "เพื่อน";
  const wav = pcmToWav(pcm, { sampleRate: 48000, channels: 2 });

  const replyText = await voiceReply(session.history, wav);
  if (!replyText) return;

  session.history.push({ role: "user", text: `[เสียงพูดจาก ${username}]` });
  session.history.push({ role: "model", text: replyText });
  session.history = session.history.slice(-CONFIG.maxHistoryTurns * 2);

  session.textChannel?.send(`💬 **Geo:** ${replyText}`).catch(() => {});
  sendToMinecraft(replyText);

  const speechWav = await synthesizeSpeech(replyText);
  playAudio(session, speechWav);
}

function playAudio(session, wavBuffer) {
  const readable = Readable.from(wavBuffer);
  const resource = createAudioResource(readable, { inputType: StreamType.Arbitrary });
  session.player.play(resource);
}

/**
 * ให้ Geo พูดข้อความที่มาจากที่อื่น (เช่น เหตุการณ์จากเกม Minecraft) ในห้องเสียงที่เข้าอยู่
 * ถ้ายังไม่ได้ !join ไว้ในกิลด์นั้น ฟังก์ชันนี้จะไม่ทำอะไร
 */
export async function speakInGuild(guildId, text) {
  const session = sessions.get(guildId);
  if (!session) return false;
  const speechWav = await synthesizeSpeech(text);
  playAudio(session, speechWav);
  return true;
}

export function getSession(guildId) {
  return sessions.get(guildId);
}
