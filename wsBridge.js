// wsBridge.js — เปิดพอร์ตรอ Termux มาเชื่อมต่อ (WebSocket) + endpoint HTTP เล็กๆ สำหรับเช็คว่ายังตื่นอยู่
//
// โปรโตคอลง่ายๆ ระหว่าง Replit <-> Termux:
//   Termux -> Replit (ครั้งแรกหลังเชื่อมต่อ):  { type: "auth", secret: "..." }
//   Replit -> Termux:                          { type: "say", text: "..." }
//   Termux -> Replit (เมื่อมีคนพิมพ์แชทในเกม):  { type: "playerMessage", sender: "...", message: "..." }

import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "node:events";
import { CONFIG } from "./config.js";

export const bridgeEvents = new EventEmitter();

let termuxSocket = null;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(
    `Geo bridge ทำงานอยู่ ✅\nTermux เชื่อมต่ออยู่: ${termuxSocket ? "ใช่" : "ไม่"}\n`
  );
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  let authenticated = false;

  // ต้อง auth ภายใน 5 วิ ไม่งั้นตัด — กันคนแปลกหน้ามาเชื่อมต่อผ่าน URL สาธารณะของ Replit
  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      socket.close(4001, "auth timeout");
    }
  }, 5000);

  socket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!authenticated) {
      if (data.type === "auth" && data.secret === CONFIG.bridgeSecret && CONFIG.bridgeSecret) {
        authenticated = true;
        clearTimeout(authTimeout);
        // ถ้ามี Termux ตัวเก่าค้างอยู่ ให้ตัดทิ้งแล้วใช้ตัวใหม่แทน
        if (termuxSocket && termuxSocket.readyState === WebSocket.OPEN) {
          termuxSocket.close();
        }
        termuxSocket = socket;
        console.log("[bridge] Termux เชื่อมต่อสำเร็จ (auth ผ่าน)");
        socket.send(JSON.stringify({ type: "authOk" }));
      } else {
        socket.close(4003, "unauthorized");
      }
      return;
    }

    if (data.type === "playerMessage") {
      bridgeEvents.emit("playerMessage", {
        sender: data.sender,
        message: data.message,
      });
    }
  });

  socket.on("close", () => {
    if (socket === termuxSocket) {
      termuxSocket = null;
      console.log("[bridge] Termux หลุดการเชื่อมต่อ");
    }
  });
});

/**
 * ส่งข้อความให้ Geo พูดในเกม Minecraft ผ่าน Termux
 * @param {string} text
 * @returns {boolean} ส่งสำเร็จหรือไม่ (false ถ้า Termux ยังไม่ได้เชื่อมต่อ)
 */
export function sendToMinecraft(text) {
  if (!termuxSocket || termuxSocket.readyState !== WebSocket.OPEN) {
    console.warn("[bridge] ยังไม่มี Termux เชื่อมต่ออยู่ เลยส่งข้อความเข้าเกมไม่ได้:", text);
    return false;
  }
  termuxSocket.send(JSON.stringify({ type: "say", text }));
  return true;
}

export function startBridge() {
  httpServer.listen(CONFIG.bridgePort, () => {
    console.log(`[bridge] เปิดรอ Termux ที่พอร์ต ${CONFIG.bridgePort}`);
  });
}
