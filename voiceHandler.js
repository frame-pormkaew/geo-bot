import { 
  joinVoiceChannel, 
  getVoiceConnection, 
  VoiceConnectionStatus, 
  entersState 
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

    // รอการเชื่อมต่อภายใน 15 วินาที
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
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

export async function speakInGuild(guildId, text) {
  const session = sessions.get(guildId);
  if (!session) return;
}
