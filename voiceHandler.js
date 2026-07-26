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

  // ดักฟังเวลาคนเริ่มพูดในห้องเสียง
  receiver.speaking.on("start", (userId) => {
    listenAndReply(receiver, userId, voiceChannel.guild.id, textChannel);
  });

  sessions.set(voiceChannel.guild.id, {
    connection,
    textChannel,
    voiceChannel,
    isProcessing: false
  });

  return connection;
}

// อัดเสียง อัปโหลดไป Gemini แล้วแปลงคำตอบเป็นเสียงพูดกลับมา
async function listenAndReply(receiver, userId, guildId, textChannel) {
  const session = sessions.get(guildId);
  if (!session || session.isProcessing) return; 

  session.isProcessing = true; // ล็อกไว้ไม่ให้อัดเสียงซ้ำซ้อนขณะกำลังประมวลผล

  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1200, // เงียบไป 1.2 วินาทีถือว่าพูดจบประโยค
    },
  });

  const pcmDecoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
  const tempFilePath = path.join("/tmp", `user_voice_${Date.now()}.pcm`);
  const outStream = fs.createWriteStream(tempFilePath);

  pipeline(opusStream, pcmDecoder, outStream, async (err) => {
    if (err) {
      console.error("Audio pipeline error:", err);
      session.isProcessing = false;
      return;
    }

    try {
      const audioBuffer = fs.readFileSync(tempFilePath);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath); // ลบไฟล์ชั่วคราวทิ้ง
      }

      // ถ้าไฟล์เสียงสั้นเกินไป (ไม่มีเสียงพูดจริง) ให้ข้าม
      if (audioBuffer.length < 10000) {
        session.isProcessing = false;
        return;
      }

      console.log("[AI Voice] กำลังส่งเสียงไปให้ Gemini คิดคำตอบ...");

      // ส่งไฟล์เสียงตรงให้ Gemini 1.5 Flash ประมวลผล
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
        await speakInGuild(guildId, replyText);
      }
    } catch (error) {
      console.error("Error processing voice with Gemini:", error);
    } finally {
      session.isProcessing = false;
    }
  });
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
      player.on(AudioPlayerStatus.Idle, () => {
        resolve();
      });
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
