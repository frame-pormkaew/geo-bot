// bot.js — รันบน Termux (ต้องอยู่วง LAN เดียวกับเกม)
// เชื่อมเข้าโลก Minecraft เป็นผู้เล่นจริงชื่อ GeoSad0864 + เชื่อมไป geo-brain บน Render

import "dotenv/config";
import bedrock from "bedrock-protocol";
import { WebSocket } from "ws";
import { createMovement } from "./movement.js";
import { createBehaviorLoop } from "./behaviors.js";

const BRAIN_WS_URL = process.env.BRAIN_WS_URL;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;
const MC_HOST = process.env.MC_HOST || "127.0.0.1";
const MC_PORT = Number(process.env.MC_PORT || 19132);
const MC_OFFLINE = (process.env.MC_OFFLINE || "true").toLowerCase() === "true";
const BOT_USERNAME = process.env.BOT_USERNAME || "GeoSad0864";
const DEBUG_PACKETS = (process.env.DEBUG_PACKETS || "false").toLowerCase() === "true";

if (!BRAIN_WS_URL) throw new Error("ไม่พบ BRAIN_WS_URL ใน .env");
if (!BRIDGE_SECRET) throw new Error("ไม่พบ BRIDGE_SECRET ใน .env");

// ================= เชื่อมไป geo-brain (Render) =================

let brainSocket = null;

function connectToBrain() {
  console.log(`[brain] กำลังเชื่อมต่อไป ${BRAIN_WS_URL} ...`);
  const socket = new WebSocket(BRAIN_WS_URL);

  socket.on("open", () => {
    socket.send(JSON.stringify({ type: "auth", secret: BRIDGE_SECRET }));
  });

  socket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (data.type === "authOk") {
      console.log("[brain] auth ผ่าน ✅");
      brainSocket = socket;
    } else if (data.type === "say" && typeof data.text === "string") {
      sendChat(data.text);
    }
  });

  socket.on("close", () => {
    if (socket === brainSocket) brainSocket = null;
    console.warn("[brain] หลุดการเชื่อมต่อ จะลองใหม่ใน 5 วิ...");
    setTimeout(connectToBrain, 5000);
  });

  socket.on("error", (err) => console.error("[brain] error:", err.message));
}

function sendToBrain(obj) {
  if (!brainSocket || brainSocket.readyState !== WebSocket.OPEN) return false;
  brainSocket.send(JSON.stringify(obj));
  return true;
}

function sendEvent(event, data) {
  console.log(`[behavior] ${event}`);
  sendToBrain({ type: "event", event, data });
}

// ================= เชื่อมเข้าเกม Minecraft =================

console.log(`[mc] กำลังต่อเข้า ${MC_HOST}:${MC_PORT} ในชื่อ ${BOT_USERNAME} (offline=${MC_OFFLINE})`);

const client = bedrock.createClient({
  host: MC_HOST,
  port: MC_PORT,
  username: BOT_USERNAME,
  offline: MC_OFFLINE,
});

if (DEBUG_PACKETS) {
  client.on("packet", (packet) => {
    console.log("[packet]", packet?.data?.name || "(unknown)");
  });
}

/** @type {Map<string, {runtimeId:any, username:string, position:{x:number,y:number,z:number}}>} */
const players = new Map();
const healthByRuntimeId = new Map();

function sendChat(text) {
  client.queue("text", {
    type: "chat",
    needs_translation: false,
    source_name: BOT_USERNAME,
    xuid: "",
    platform_chat_id: "",
    message: text,
  });
}

client.on("join", () => {
  console.log("[mc] เข้าโลกสำเร็จ ✅ Geo อยู่ในเกมแล้ว");
});

client.on("spawn", () => {
  console.log("[mc] spawn เรียบร้อย เริ่มพฤติกรรมอัตโนมัติ");
  const movement = createMovement(client);

  const behaviors = createBehaviorLoop({
    client,
    movement,
    sendEvent,
    sendChat,
    getNearestPlayer: () => {
      let nearest = null;
      let minDist = Infinity;
      for (const p of players.values()) {
        const d = movement.distanceTo(p.position);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      }
      return nearest;
    },
    getPlayerHealth: () => {
      // best-effort: มักไม่มีข้อมูลเลือดผู้เล่นคนอื่นส่งมาให้ client ที่ไม่ใช่เจ้าของ
      // ถ้า healthByRuntimeId ว่างเปล่าตลอด แปลว่าต้องหาวิธีอื่น (เช่น scoreboard) มาช่วยแทน
      const values = [...healthByRuntimeId.values()];
      return values.length ? Math.min(...values) : null;
    },
  });

  process.on("SIGINT", () => {
    behaviors.stop();
    movement.stop();
    process.exit(0);
  });
});

client.on("text", (packet) => {
  if (packet.type !== "chat") return;
  if (packet.source_name === BOT_USERNAME) return;
  console.log(`[mc] ${packet.source_name}: ${packet.message}`);
  sendToBrain({ type: "playerMessage", sender: packet.source_name, message: packet.message });
});

// ติดตามผู้เล่นคนอื่นที่เข้ามาในระยะมองเห็น (ใช้หาตำแหน่งไว้แกล้ง/คุยด้วย)
client.on("add_player", (packet) => {
  players.set(String(packet.runtime_id), {
    runtimeId: packet.runtime_id,
    username: packet.username,
    position: packet.position || { x: 0, y: 0, z: 0 },
  });
});

client.on("move_player", (packet) => {
  const p = players.get(String(packet.runtime_id));
  if (p && packet.position) p.position = packet.position;
});

client.on("remove_entity", (packet) => {
  players.delete(String(packet.runtime_id ?? packet.entity_id_self));
});

client.on("update_attributes", (packet) => {
  const healthAttr = packet.attributes?.find((a) => a.name === "minecraft:health");
  if (healthAttr) healthByRuntimeId.set(String(packet.runtime_entity_id), healthAttr.current);
});

client.on("disconnect", (packet) => {
  console.error("[mc] ถูกตัดการเชื่อมต่อ:", packet?.message || packet);
});

client.on("error", (err) => {
  console.error("[mc] error:", err.message);
});

connectToBrain();
