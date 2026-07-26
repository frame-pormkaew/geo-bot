import { 
  joinVoiceChannel, 
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  EndBehaviorType,
  StreamType
} from "@discordjs/voice";
import { Endianness } from "@prism-media/prism";
import pipeline from "stream";
import fs from "fs";

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

  // ดักจับเสียงคนพูดในห้อง (Receiver)
  const receiver = connection.receiver;

  receiver.speaking.on("start", (userId) => {
    // เมื่อมีคนเริ่มพูดในห้องเสียง
    listenToUser(receiver, userId, voiceChannel.guild.id, textChannel);
  });

  sessions.set(voiceChannel.guild.id, {
    connection,
    textChannel,
    voiceChannel,
  });

  return connection;
}

// ฟังก์ชันอัดเสียงคนพูดเมื่อหยุดพูดเกิน 1 วินาที
function listenToUser(receiver, userId, guildId, textChannel) {
  const audioStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1000, // เงียบไป 1 วินาที ถือว่าพูดจบประโยค
    },
  });

  console.log(`[Voice] กำลังฟังเสียงจาก User: ${userId}...`);

  // แปลง Audio Stream เป็นไฟล์พร้อมส่งให้ AI
  // (จุดนี้จะถูกส่งไปที่ STT -> Gemini AI -> ตอบกลับด้วยเสียง)
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
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเล่นเสียง:", error);
  }
}
