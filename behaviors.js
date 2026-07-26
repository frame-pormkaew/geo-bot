// behaviors.js — สมองส่วน "นิสัย" ของ Geo ทำงานอัตโนมัติ ไม่ต้องรอ Discord/Gemini
// สุ่มเลือกพฤติกรรมเป็นช่วงๆ เวลาไม่มีอะไรทำ (ว่าง) แล้วสั่ง movement/actions ให้ทำจริงในเกม

import { attackEntity, breakBlockAt, blockInFrontOf } from "./actions.js";

const IDLE_TICK_MS = 6000; // ทุกกี่ ms ที่จะสุ่มตัดสินใจใหม่ตอนว่าง
const TROLL_RANGE = 4; // ระยะ (บล็อก) ที่ถือว่า "ใกล้พอจะแกล้งได้"
const LOW_HEALTH_THRESHOLD = 8; // จาก 20 (ครึ่งเดียว) — งดแกล้งถ้าต่ำกว่านี้

// น้ำหนักของแต่ละพฤติกรรมตอนว่างๆ (ยิ่งเลขเยอะยิ่งสุ่มได้บ่อย)
const WEIGHTS = {
  wander: 5,
  chop_wood: 3,
  sing: 2,
  sneak_attack: 3,
  crouch_spam: 2,
};

function pickWeighted(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    if (r < w) return key;
    r -= w;
  }
  return entries[0][0];
}

export function createBehaviorLoop({ client, movement, sendEvent, sendChat, getNearestPlayer, getPlayerHealth }) {
  let busy = false;
  let currentTarget = null;

  function isTrollAllowed() {
    const hp = getPlayerHealth();
    // hp === null แปลว่ายังไม่รู้ค่าจริง (โปรโตคอลอาจไม่ส่งเลือดผู้เล่นอื่นมาให้) — เผื่อไว้ก่อนแบบระวังสุด
    if (hp === null) return true;
    return hp > LOW_HEALTH_THRESHOLD;
  }

  async function doWander() {
    const pos = movement.getPosition();
    const target = {
      x: pos.x + (Math.random() * 16 - 8),
      y: pos.y,
      z: pos.z + (Math.random() * 16 - 8),
    };
    movement.walkTowards(target);
    setTimeout(() => movement.stopWalking(), 3000 + Math.random() * 2000);
  }

  async function doChopWood() {
    await doWander();
    setTimeout(() => {
      const pos = movement.getPosition();
      const blockPos = blockInFrontOf(pos, movement.state.yaw);
      breakBlockAt(client, blockPos);
      sendEvent("chop_wood");
    }, 2500);
  }

  function doSing() {
    // ห้ามใช้เนื้อเพลงจริงเพราะติดลิขสิทธิ์ — แต่งทำนองสั้นๆ เอง
    const hums = ["ลาลาลา~ ลันลันลา~", "ฮึมฮึม~ อารมณ์ดีจัง~", "ดื่ดื้อ ดื่ดื้อ ลันลาลา~"];
    sendChat(hums[Math.floor(Math.random() * hums.length)]);
    sendEvent("sing");
  }

  function doCrouchSpam(nearestPlayer) {
    movement.walkTowards(nearestPlayer.position);
    let count = 0;
    const spam = setInterval(() => {
      movement.setSneak(count % 2 === 0);
      count++;
      if (count > 10) {
        clearInterval(spam);
        movement.setSneak(false);
        movement.stopWalking();
      }
    }, 250);
  }

  function doSneakAttackAndFlee(nearestPlayer) {
    movement.walkTowards(nearestPlayer.position);
    const approachTimer = setInterval(() => {
      const dist = movement.distanceTo(nearestPlayer.position);
      if (dist <= TROLL_RANGE) {
        clearInterval(approachTimer);
        attackEntity(client, nearestPlayer.runtimeId);
        sendEvent("sneak_attack");
        movement.stopWalking();

        // วิ่งหนีไปทิศตรงข้ามกับผู้เล่น (จำลองการ "หลบไปแอบ")
        const pos = movement.getPosition();
        const dx = pos.x - nearestPlayer.position.x;
        const dz = pos.z - nearestPlayer.position.z;
        const fleeTarget = { x: pos.x + dx * 3, y: pos.y, z: pos.z + dz * 3 };
        setTimeout(() => {
          movement.walkTowards(fleeTarget);
          setTimeout(() => movement.stopWalking(), 3000);
        }, 200);
      }
    }, 400);

    // เลิกพยายามถ้าเดินตามนานเกินไปแล้วยังไม่ถึง
    setTimeout(() => clearInterval(approachTimer), 8000);
  }

  async function tick() {
    if (busy) return;
    const nearestPlayer = getNearestPlayer();
    let action = pickWeighted(WEIGHTS);

    if ((action === "sneak_attack" || action === "crouch_spam") && (!nearestPlayer || !isTrollAllowed())) {
      action = "wander"; // ไม่มีเป้าหมาย หรือเลือดผู้เล่นน้อยอยู่ -> เปลี่ยนเป็นเดินเล่นแทน
    }

    busy = true;
    try {
      switch (action) {
        case "wander":
          await doWander();
          break;
        case "chop_wood":
          await doChopWood();
          break;
        case "sing":
          doSing();
          break;
        case "sneak_attack":
          doSneakAttackAndFlee(nearestPlayer);
          break;
        case "crouch_spam":
          doCrouchSpam(nearestPlayer);
          break;
      }
    } finally {
      setTimeout(() => (busy = false), 2000);
    }
  }

  const interval = setInterval(tick, IDLE_TICK_MS);
  return { stop: () => clearInterval(interval) };
}
