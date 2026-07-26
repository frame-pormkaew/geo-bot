import { 
  joinVoiceChannel, 
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} from "@discordjs/voice";

let discordClient = null;
const sessions = new Map();

export function setDiscordClient(client) {
  discordClient = client;
}

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

  sessions.set(voiceChannel.guild.id, {
    connection,
    textChannel,
    voiceChannel,
  });

  return connection;
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

export function hasSession(guildId) {
  return sessions.has(guildId);
}

// ฟังก์ชันสั่งให้บอทพูดเสียงภาษาไทยในห้อง
export async function speakInGuild(guildId, text) {
  const session = sessions.get(guildId);
  if (!session) return;

  try {
    // สร้าง Google Translate TTS URL โดยตรงแบบไม่ต้องงึ่งไลบรารีภายนอก
    const encodedText = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=th&client=tw-ob`;

    const player = createAudioPlayer();
    const resource = createAudioResource(url);

    session.connection.subscribe(player);
    player.play(resource);

    return new Promise((resolve) => {
      player.on(AudioPlayerStatus.Idle, () => {
        resolve();
      });
      player.on('error', (error) => {
        console.error('Audio Player Error:', error);
        resolve();
      });
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเล่นเสียง:", error);
  }
}
