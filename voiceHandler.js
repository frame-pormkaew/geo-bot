import { 
  joinVoiceChannel, 
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  EndBehaviorType,
  StreamType,
  entersState
} from "@discordjs/voice";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prism from "prism-media";
import { pipeline, Readable } from "stream";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const sessions = new Map();

// Frame เสียงเงียบสำหรับ Warm-up ช่องสัญญาณ UDP ของ Discord
const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

export async function joinChannel(voiceChannel, textChannel) {
  if (!voiceChannel) throw new Error("ไม่พบห้องเสียง");

  let connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    // รอจนกว่าสถานะ Voice Connection จะ Ready จริงๆ
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    console.log(`[Voice System] เชื่อมต่อสถานะ Ready กับห้อง ${voiceChannel.name} สำเร็จ`);
  } catch (error) {
    console.error("[Voice System] เชื่อมต่อห้องเสียงล้มเหลว:", error);
    connection.destroy();
    throw error;
  }

  // ส่ง Silence Frame เพื่อกระตุ้นให้ Discord Voice Server เปิดรับ UDP Packet
  const player = createAudioPlayer();
  const silenceStream = new Readable({ read() { this.push(SILENCE_FRAME); this.push(null); } });
  const resource = createAudioResource(silenceStream, { inputType: StreamType.Opus });
  connection.subscribe(player);
  player.play(resource);

  const receiver = connection.receiver;

  // ดักจับเมื่อผู้ใช้เริ่มพูด
  receiver.speaking.on("start", (userId) => {
    console.log(`[Voice System] ตรวจพบการเปิดไมค์จาก User: ${userId}`);
    handleUserSpeaking(receiver, userId, voiceChannel.guild.id, textChannel);
  });

  sessions.set(voiceChannel.guild.id, {
    connection,
    textChannel,
    voiceChannel,
    isProcessing: false
  });

  return connection;
}

async function handleUserSpeaking(receiver, userId, guildId, textChannel) {
  const session = sessions.get(guildId);
  if (!session || session.isProcessing) return;

  session.isProcessing = true;
  console.log(`[Voice System] เริ่มอัดเสียงจาก User: ${userId}`);

  try {
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000, // ถือว่าพูดจบประโยคเมื่อเงียบไป 1 วินาที
      },
    });

    const pcmDecoder = new prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 16000 });
    const tempFilePath = path.join("/tmp", `user_${userId}_${Date.now()}.pcm`);
    const outStream = fs.createWriteStream(tempFilePath);

    pipeline(opusStream, pcmDecoder, outStream, async (err) => {
      if (err) {
        console.error("[Audio Pipeline Error]:", err);
        session.isProcessing = false;
        return;
      }

      try {
        if (!fs.existsSync(tempFilePath)) {
          session.isProcessing = false;
          return;
        }

        const audioBuffer = fs.readFileSync(tempFilePath);
        fs.unlinkSync(tempFilePath);

        console.log(`[Voice System] อัดเสียงสำเร็จ! ขนาด: ${audioBuffer.length} bytes`);

        // ถ้าไฟล์เสียงเล็กกว่า 4KB ให้ตัดออก (เสียงกดไมค์/ลมเข้าไมค์)
        if (audioBuffer.length < 4000) {
          console.log("[Voice System] เสียงสั้นเกินไป ข้ามการประมวลผล");
          session.isProcessing = false;
          return;
        }

        console.log(`[AI Thinking] กำลังส่งเสียงไปประมวลผลที่ Gemini...`);

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
        console.log(`[Gemini Answer]: ${replyText}`);

        if (replyText) {
          if (textChannel) {
            textChannel.send(`💬 **Gemini:** ${replyText}`).catch(() => {});
          }
          await speakInGuild(guildId, replyText);
        }
      } catch (error) {
        console.error("[Gemini Error]:", error);
      } finally {
        session.isProcessing = false;
      }
    });

  } catch (e) {
    console.error("[Subscribe Error]:", e);
    session.isProcessing = false;
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
    console.error("เกิดข้อผิดพลาดในการเล่นเสียงตอบกลับ:", error);
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
