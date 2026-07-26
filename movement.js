// movement.js — ⚠️ ส่วนทดลอง (EXPERIMENTAL)
//
// Bedrock ใช้ระบบ "server-authoritative movement": เราแค่ "ขอ" ขยับทุก tick ผ่าน
// แพ็กเก็ต player_auth_input แล้วเซิร์ฟเวอร์เป็นคนตัดสินใจตำแหน่งจริง โครงสร้างแพ็กเก็ตนี้
// เปลี่ยนตามเวอร์ชันเกมอยู่เรื่อยๆ โค้ดด้านล่างเป็น "ค่าที่น่าจะใช้ได้" ไม่ใช่ค่าที่ยืนยัน 100%
//
// ถ้าตัวละครไม่ขยับ/โดนเตะ/ค้าง ให้เปิด DEBUG_PACKETS=true ใน .env แล้วดู log เทียบกับ
// ไฟล์จริงที่ node_modules/bedrock-protocol/data/<เวอร์ชัน>/proto.yml (มี field ล่าสุดเป๊ะๆ)

const TICK_MS = 50; // เกมรันที่ 20 tick/วินาที
const MOVE_SPEED = 0.15; // หน่วยบล็อกต่อ tick (ประมาณเดินปกติ)

export function createMovement(client) {
  const state = {
    x: 0,
    y: 64,
    z: 0,
    yaw: 0,
    pitch: 0,
    headYaw: 0,
    tick: 0n,
    moveX: 0,
    moveZ: 0,
    jump: false,
    sneak: false,
    ready: false,
  };

  // ตำแหน่งเริ่มต้น: พยายามอ่านจาก start_game (ชื่อ field เดาไว้หลายแบบเผื่อเวอร์ชันต่างกัน)
  client.once("start_game", (packet) => {
    const pos = packet.player_position || packet.playerPosition || packet.position;
    if (pos) {
      state.x = pos.x;
      state.y = pos.y;
      state.z = pos.z;
    }
    state.ready = true;
    console.log("[movement] ตำแหน่งเริ่มต้น:", state.x, state.y, state.z);
  });

  // ถ้าเซิร์ฟเวอร์ส่งค่าตำแหน่งที่ถูกต้องกลับมาแก้ไข ให้ sync ตามนั้น (ชื่อ packet เดาไว้)
  client.on("correct_player_move_prediction", (packet) => {
    if (packet?.position) {
      state.x = packet.position.x;
      state.y = packet.position.y;
      state.z = packet.position.z;
    }
  });

  client.on("move_player", (packet) => {
    // บาง server ยังส่ง move_player ของตัวเองกลับมา ใช้ sync ตำแหน่งเผื่อไว้
    if (packet?.runtime_id === client.entityId && packet?.position) {
      state.x = packet.position.x;
      state.y = packet.position.y;
      state.z = packet.position.z;
    }
  });

  const interval = setInterval(() => {
    if (!state.ready) return;
    state.tick += 1n;

    // เดินแบบเดาตำแหน่งเอง (dead reckoning) ไปก่อน เดี๋ยว correction packet จะแก้ให้เอง
    if (state.moveX !== 0 || state.moveZ !== 0) {
      const rad = (state.yaw * Math.PI) / 180;
      state.x += (state.moveZ * Math.cos(rad) - state.moveX * Math.sin(rad)) * MOVE_SPEED;
      state.z += (state.moveZ * Math.sin(rad) + state.moveX * Math.cos(rad)) * MOVE_SPEED;
    }

    const inputData = [];
    if (state.jump) inputData.push("jumping", "start_jumping");
    if (state.sneak) inputData.push("sneaking", "start_sneaking");

    client.queue("player_auth_input", {
      pitch: state.pitch,
      yaw: state.yaw,
      position: { x: state.x, y: state.y, z: state.z },
      move_vector: { x: state.moveX, z: state.moveZ },
      head_yaw: state.headYaw,
      input_data: inputData,
      input_mode: "mouse",
      play_mode: "normal",
      interact_rotation: { x: 0, y: 0 },
      tick: state.tick,
      delta: { x: 0, y: 0, z: 0 },
      analogue_move_vector: { x: state.moveX, z: state.moveZ },
    });
  }, TICK_MS);

  return {
    state,
    stop: () => clearInterval(interval),

    lookAt(target) {
      const dx = target.x - state.x;
      const dz = target.z - state.z;
      const dy = target.y - state.y;
      state.yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
      state.headYaw = state.yaw;
      const dist = Math.sqrt(dx * dx + dz * dz);
      state.pitch = (Math.atan2(-dy, dist) * 180) / Math.PI;
    },

    walkTowards(target) {
      this.lookAt(target);
      state.moveX = 0;
      state.moveZ = 1; // เดินหน้าตามทิศที่หันไปแล้ว (lookAt ตั้ง yaw ให้แล้ว)
    },

    stopWalking() {
      state.moveX = 0;
      state.moveZ = 0;
    },

    setJump(v) {
      state.jump = v;
    },

    setSneak(v) {
      state.sneak = v;
    },

    distanceTo(pos) {
      const dx = pos.x - state.x;
      const dy = pos.y - state.y;
      const dz = pos.z - state.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    getPosition() {
      return { x: state.x, y: state.y, z: state.z };
    },
  };
}
