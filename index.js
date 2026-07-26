// index.js — จุดเริ่มต้นของบอท Geo
// รัน: npm start (หรือกดปุ่ม Run บน Replit)

import "dotenv/config";
import ffmpeg from "ffmpeg-static";
import { CONFIG } from "./config.js"; // <--- เพิ่มบรรทัดนี้เข้ามาครับ!
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { chatReply } from "./gemini.js";
import { startBridge, sendToMinecraft, bridgeEvents } from "./wsBridge.js";
import { joinChannel, leaveChannel, hasSession, speakInGuild, setDiscordClient } from "./voiceHandler.js";

if (!CONFIG.discordToken) throw new Error("ไม่พบ DISCORD_TOKEN ใน .env / Secrets");
if (!CONFIG.geminiApiKey) throw new Error("ไม่พบ GEMINI_API_KEY ใน .env / Secrets");
if (!CONFIG.bridgeSecret) throw new Error("ไม่พบ BRIDGE_SECRET ใน .env / Secrets (ห้ามปล่อยว่าง)");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

setDiscordClient(client);

// ประวัติแชทข้อความล้วน แยกตามห้อง (channel id) — คนละส่วนกับประวัติการคุยด้วยเสียง
const chatHistories = new Map();
function getHistory(channelId) {
  return chatHistories.get(channelId) || [];
}
function pushHistory(channelId, role, text) {
  const h = getHistory(channelId);
  h.push({ role, text });
  chatHistories.set(channelId, h.slice(-CONFIG.maxHistoryTurns * 2));
}

// จำห้องข้อความ/กิลด์ล่าสุดที่มีการคุยกัน ไว้ใช้ตอนมีเหตุการณ์จากเกม Minecraft ย้อนกลับมา
let lastGuildId = null;
let lastTextChannel = null;

client.once("clientReady", () => {
  console.log(`[discord] ล็อกอินสำเร็จ: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();

  // ----- คำสั่ง !join -----
  if (content === "!join") {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply("ต้องเข้า voice channel ก่อนนะ ค่อยพิมพ์ !join");
      return;
    }
    try {
      await joinChannel(voiceChannel, message.channel);
      lastGuildId = message.guild.id;
      lastTextChannel = message.channel;
      await message.reply(`เข้ามาละ 🎮 อยู่ห้อง **${voiceChannel.name}** พูดได้เลย`);
    } catch (err) {
      console.error("[discord] join error:", err);
      await message.reply("เข้าห้องเสียงไม่สำเร็จอ่ะ ลองเช็ค permission ของบอทดูอีกที");
    }
    return;
  }

  // ----- คำสั่ง !leave -----
  if (content === "!leave") {
    const ok = leaveChannel(message.guild.id);
    await message.reply(ok ? "ออกจากห้องเสียงแล้วนะ 👋" : "Geo ไม่ได้อยู่ในห้องเสียงอยู่แล้วนะ");
    return;
  }

  // ----- แชทข้อความปกติ: ต้อง mention บอท -----
  if (message.mentions.has(client.user)) {
    const text = content.replace(/<@!?\d+>/g, "").trim();
    if (!text) return;

    lastGuildId = message.guild.id;
    lastTextChannel = message.channel;

    try {
      const history = getHistory(message.channel.id);
      const reply = await chatReply(history, text);
      if (!reply) return;
      pushHistory(message.channel.id, "user", text);
      pushHistory(message.channel.id, "model", reply);
      await message.reply(reply);
      if (CONFIG.relayTextToMc) sendToMinecraft(reply);
    } catch (err) {
      console.error("[discord] chatReply error:", err);
      await message.reply("Gemini ตอบไม่ได้ตอนนี้อ่ะ ลองใหม่อีกทีนะ");
    }
  }
});

// ----- เหตุการณ์จากเกม Minecraft (ผ่าน Termux) ย้อนกลับมาที่ Discord -----
bridgeEvents.on("playerMessage", async ({ sender, message }) => {
  if (!lastTextChannel || !sender || !message) return;

  const prompt = `[ในเกม Minecraft] ${sender}: ${message}`;
  try {
    const history = getHistory(lastTextChannel.id);
    const reply = await chatReply(history, prompt);
    if (!reply) return;

    pushHistory(lastTextChannel.id, "user", prompt);
    pushHistory(lastTextChannel.id, "model", reply);

    await lastTextChannel.send(`🎮 **Geo:** ${reply}`);
    sendToMinecraft(reply);
    if (lastGuildId && hasSession(lastGuildId)) {
      speakInGuild(lastGuildId, reply).catch(() => {});
    }
  } catch (err) {
    console.error("[bridge] playerMessage handling error:", err);
  }
});

startBridge();
client.login(CONFIG.discordToken);
