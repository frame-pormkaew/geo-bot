// wsBridge.js — เปิดพอร์ตรอ geo-body (Termux) มาเชื่อมต่อ + endpoint HTTP เช็คสถานะ
//
// โปรโตคอล geo-brain (Render) <-> geo-body (Termux):
//   body -> brain (แรกสุด):     { type: "auth", secret: "..." }
//   brain -> body:               { type: "say", text: "..." }        (ให้ Geo พิมพ์แชทในเกม)
//   body -> brain:                { type: "playerMessage", sender, message }  (ผู้เล่นพิมพ์แชทในเกม)
//   body -> brain:                { type: "event", event: "sneak_attack"|"chop_wood"|..., data? }

import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "node:events";
import { CONFIG } from "./config.js";

export const bridgeEvents = new EventEmitter();

let bodySocket = null;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`Geo brain ทำงานอยู่ ✅\ngeo-body เชื่อมต่ออยู่: ${bodySocket ? "ใช่" : "ไม่"}\n`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  let authenticated = false;

  const authTimeout = setTimeout(() => {
    if (!authenticated) socket.close(4001, "auth timeout");
  }, 5000);

  socket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!authenticated) {
      if (data.type === "auth" && CONFIG.bridgeSecret && data.secret === CONFIG.bridgeSecret) {
        authenticated = true;
        clearTimeout(authTimeout);
        if (bodySocket && bodySocket.readyState === WebSocket.OPEN) bodySocket.close();
        bodySocket = socket;
        console.log("[bridge] geo-body เชื่อมต่อสำเร็จ (auth ผ่าน)");
        socket.send(JSON.stringify({ type: "authOk" }));
      } else {
        socket.close(4003, "unauthorized");
      }
      return;
    }

    if (data.type === "playerMessage") {
      bridgeEvents.emit("playerMessage", { sender: data.sender, message: data.message });
    } else if (data.type === "event") {
      bridgeEvents.emit("geoEvent", { event: data.event, data: data.data });
    }
  });

  socket.on("close", () => {
    if (socket === bodySocket) {
      bodySocket = null;
      console.log("[bridge] geo-body หลุดการเชื่อมต่อ");
    }
  });
});

export function sendToMinecraft(text) {
  if (!bodySocket || bodySocket.readyState !== WebSocket.OPEN) {
    console.warn("[bridge] ยังไม่มี geo-body เชื่อมต่ออยู่ ส่งข้อความเข้าเกมไม่ได้:", text);
    return false;
  }
  bodySocket.send(JSON.stringify({ type: "say", text }));
  return true;
}

export function startBridge() {
  httpServer.listen(CONFIG.bridgePort, () => {
    console.log(`[bridge] เปิดรอ geo-body ที่พอร์ต ${CONFIG.bridgePort}`);
  });
}
