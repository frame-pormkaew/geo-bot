import { 
  joinVoiceChannel, 
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  EndBehaviorType,
  StreamType
} from "@discordjs/voice";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prism from "prism-media";
import { pipeline } from "stream";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const sessions = new Map();

export async function joinChannel(voiceChannel, textChannel) {
  if (!voiceChannel) throw new Error("ไม่พบห้องเสียง");

  let connection = getVoiceConnection(voiceChannel.guild.id);

  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
  }

  const receiver = connection.receiver;

  // วิธีดักจับแบบบังคับ Subscribe ผู้ใช้ทุกคนในห้อง
  voiceChannel.members.forEach((member) => {
    if (!member.user.bot) {
      subscribeToUser(receiver, member.id, voiceChannel.guild.id, textChannel);
    }
  });

  // เมื่อมีคนใหม่กดเข้าห้องมา ให้ดักจับเพิ่มทันที
  receiver.speaking.on("start", (userId) => {
    subscribeToUser(receiver, userId, voiceChannel.guild.id, textChannel);
  });

  sessions.set(voiceChannel.guild.id, {
    connection,
    textChannel,
    voiceChannel,
    isProcessing: false,
    activeSubscribers: new Set()
  });

  console.log(`[Voice System] เข้าร่วมห้องเสียง ${voiceChannel.name} และเริ่มดักฟังสมาชิกทุกคนแล้ว`);
  return connection;
}

function subscribeToUser(receiver, userId, guildId, textChannel) {
  const session = sessions.get(guildId);
  if (!session) return;

  // ถ้าอัดเสียงผู้ใช้นี้อยู่แล้ว ให้ข้าม
  if (session.activeSubscribers.has(userId)) return;
  session.activeSubscribers.add(userId);

  console.log(`[Voice System] เริ่มสตรีมดักจับเสียงจาก User ID: ${userId}`);

  try {
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1200, // เงียบไป 1.2 วินาทีถือว่าจบประโยค
      },
    });

    const pcmDecoder = new prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 16000 });
    const tempFilePath = path.join("/tmp", `voice_${userId}_${Date.now()}.pcm`);
    const outStream = fs.createWriteStream(tempFilePath);

    pipeline(opusStream, pcmDecoder, outStream, async (err) => {
      session.activeSubscribers.delete(userId); // เคลียร์สถานะเพื่อให้จับเสียงครั้งถัดไปได้

      if (err) {
        console.error("[Voice Pipeline Error]:", err);
        return;
      }

      if (session.isProcessing) return; // ถ้า AI กำลังประมวลผลคำตอบอยู่ให้ข้าม

      try {
        if (!fs.existsSync(tempFilePath)) return;

        const audioBuffer = fs.readFileSync(tempFilePath);
        fs.unlinkSync(tempFilePath); // ลบไฟล์ temp

        console.log(`[Voice Debug] อ่านไฟล์เสียงสำเร็จ ขนาด: ${audioBuffer.length} bytes`);

        // ถ้าไฟล์เสียงเล็กกว่า 6KB แสดงว่าแค่เปิดไมค์ทิ้งไว้หรือมีเสียงรบกวนสั้นๆ
        if (audioBuffer.length < 6000) {
          console.log("[Voice Debug] เสียงสั้นเกินไป ข้าม");
          return;
        }

        session.isProcessing = true;
        console.log(`[AI Voice] กำลังส่งไฟล์เสียงให้ Gemini 1.5 Flash...`);

        const response = await model.generateContent([
          {
            inlineData: {
              mimeType: 'audio/pcm',
              data: audioBuffer.toString('base64')
            }
          },
          'ตอบคำถามจากเสียงนี้สั้นๆ กระชับ เป็นกันเอง ภาษาไทย'
        ]);

        const replyText = response.response.text();
        console.log(`[Gemini ตอบ]: ${replyText}`);

        if (replyText) {
          if (textChannel) {
            textChannel.send(`💬 **Gemini:** ${replyText}`).catch(() => {});
          }
          await speakInGuild(guildId, replyText);
        }
      } catch (error) {
        console.error("[Gemini Voice Error]:", error);
      } finally {
        session.isProcessing = false;
      }
    });

  } catch (e) {
    console.error("[Subscribe Error]:", e);
    session.activeSubscribers.delete(userId);
  }
}

export async function speakInGuild(guildId, text) {
  const session = sessions.get(guildId);
  if (!session) return;

  try {
    const encodedText = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodedText}`;

    const player = createAudioPlayer();
    const resource = createAudioResource(url, { inputType: StreamType.Arbitrary });

    session.connection.subscribe(player);
    player.play(resource);

    return new Promise((resolve) => {
      player.on(AudioPlayerStatus.Idle, () => resolve());
      player.on('error', (err) => {
        console.error("Audio player error:", err);
        resolve();
      });
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเล่นเสียง:", error);
  }
}

export function leaveChannel(guildId) {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    sessions.delete(guildId);
    return true;
  }
  return false;
}
