// index.js — จุดเริ่มต้นของ geo-brain (รันบน Render)

import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { CONFIG, EVENT_FLAVOR } from "./config.js";
import { chatReply } from "./gemini.js";
import { startBridge, sendToMinecraft, bridgeEvents } from "./wsBridge.js";
import { joinChannel, leaveChannel, hasSession, speakInGuild, setDiscordClient } from "./voiceHandler.js";

if (!CONFIG.discordToken) throw new Error("ไม่พบ DISCORD_TOKEN");
if (!CONFIG.geminiApiKey) throw new Error("ไม่พบ GEMINI_API_KEY");
if (!CONFIG.bridgeSecret) throw new Error("ไม่พบ BRIDGE_SECRET (ห้ามปล่อยว่าง)");

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

const chatHistories = new Map();
function getHistory(id) {
  return chatHistories.get(id) || [];
}
function pushHistory(id, role, text) {
  const h = getHistory(id);
  h.push({ role, text });
  chatHistories.set(id, h.slice(-CONFIG.maxHistoryTurns * 2));
}

let lastGuildId = null;
let lastTextChannel = null;

client.once("clientReady", () => {
  console.log(`[discord] ล็อกอินสำเร็จ: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();

  if (content === "!join") {
    const vc = message.member?.voice?.channel;
    if (!vc) return void (await message.reply("เข้า voice channel ก่อนแล้วค่อยพิมพ์ !join นะ"));
    try {
      await joinChannel(vc, message.channel);
      lastGuildId = message.guild.id;
      lastTextChannel = message.channel;
      await message.reply(`เข้ามาละ 🎮 อยู่ห้อง **${vc.name}**`);
    } catch (err) {
      console.error("[discord] join error:", err);
      await message.reply("เข้าห้องเสียงไม่สำเร็จอ่ะ เช็ค permission หน่อย");
    }
    return;
  }

  if (content === "!leave") {
    const ok = leaveChannel(message.guild.id);
    await message.reply(ok ? "ออกจากห้องเสียงละ 👋" : "Geo ไม่ได้อยู่ในห้องเสียงอยู่แล้ว");
    return;
  }

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
    } catch (err) {
      console.error("[discord] chatReply error:", err);
      await message.reply("Gemini ตอบไม่ได้ตอนนี้อ่ะ ลองใหม่นะ");
    }
  }
});

// ----- แชทจากผู้เล่นในเกม (ผ่าน geo-body) -----
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
    if (lastGuildId && hasSession(lastGuildId)) speakInGuild(lastGuildId, reply).catch(() => {});
  } catch (err) {
    console.error("[bridge] playerMessage error:", err);
  }
});

// ----- พฤติกรรมที่ geo-body ทำเอง (เดินเล่น/ขุดไม้/แกล้ง/ร้องเพลง) -----
// ส่งข้อความสั้นๆ ประกอบให้ดูมีชีวิตชีวาใน Discord โดยไม่ต้องรอเรียก Gemini ทุกครั้ง
bridgeEvents.on("geoEvent", async ({ event }) => {
  if (!lastTextChannel) return;
  const options = EVENT_FLAVOR[event];
  if (!options) return;
  const text = options[Math.floor(Math.random() * options.length)];
  lastTextChannel.send(`🎮 **Geo:** ${text}`).catch(() => {});
});

startBridge();
client.login(CONFIG.discordToken);
