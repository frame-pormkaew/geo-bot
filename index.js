import "dotenv/config";
import ffmpeg from "ffmpeg-static";
import { CONFIG } from "./config.js";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { joinChannel, leaveChannel, speakInGuild } from "./voiceHandler.js";
import WebSocket, { WebSocketServer } from "ws";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// สร้าง WebSocket Server รอ Termux ต่อเข้ามา
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });
let termuxSocket = null;

wss.on("connection", (ws) => {
  console.log("[bridge] มีการเชื่อมต่อเข้ามา...");

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === "auth" && data.secret === CONFIG.bridgeSecret) {
        termuxSocket = ws;
        console.log("[bridge] Termux เชื่อมต่อสำเร็จ (auth ผ่าน)");
        ws.send(JSON.stringify({ type: "authOk" }));
      }
    } catch (e) {
      console.error("[bridge] เกิดข้อผิดพลาด:", e);
    }
  });

  ws.on("close", () => {
    if (termuxSocket === ws) termuxSocket = null;
    console.log("[bridge] Termux หลุดการเชื่อมต่อ");
  });
});

client.on("ready", () => {
  console.log(`[discord] ล็อกอินสำเร็จ: ${client.user.tag}`);
});

// ดักจับคำสั่งพิมพ์ใน Discord
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const text = message.content.trim();

  // คำสั่งเข้าห้องเสียง
  if (text === "!join") {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply("คุณต้องเข้าห้องเสียงก่อนสั่งบอทนะ!");
    }
    try {
      await joinChannel(voiceChannel, message.channel);
      message.reply(`เข้ามาละ 🎶 อยู่ห้อง **${voiceChannel.name}** พูดได้เลย`);
    } catch (err) {
      console.error(err);
      message.reply("เข้าห้องเสียงไม่สำเร็จอ่ะ ลองเช็ค permission ของบอทดูอีกที");
    }
  }

  // คำสั่งออกห้องเสียง
  if (text === "!leave") {
    if (leaveChannel(message.guild.id)) {
      message.reply("ออกจากห้องเสียงเรียบร้อยครับ!");
    }
  }

  // คำสั่งสั่งให้บอทพูดเสียงภาษาไทย!
  if (text.startsWith("!say ")) {
    const sayText = text.replace("!say ", "").trim();
    if (!sayText) return;

    try {
      await speakInGuild(message.guild.id, sayText);
      message.react("🔊"); // กดรีแอคชันรูปลำโพงเมื่อพูดสำเร็จ
    } catch (err) {
      console.error(err);
      message.reply("พูดไม่สำเร็จอ่ะ เกิดข้อผิดพลาดในระบบเสียง");
    }
  }
});

client.login(CONFIG.discordToken);
