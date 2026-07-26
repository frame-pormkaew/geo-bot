// actions.js — ⚠️ ส่วนทดลอง (EXPERIMENTAL) มากที่สุดในโปรเจกต์นี้
// การต่อย/ขุด ผ่านโปรโตคอลดิบมีรายละเอียดปลีกย่อยเยอะและเปลี่ยนบ่อยตามเวอร์ชันเกม
// โค้ดนี้ทำ "ท่าที่ควรได้ผล" ไว้ก่อน ถ้าไม่ติด (ตีไม่โดน/ขุดไม่แตก) ค่อยมาไล่ debug ด้วยกันทีหลัง
// อย่างน้อยที่สุด animate (ท่าเหวี่ยงแขน) ควรเห็นผลแน่ๆ เพราะเป็น packet ง่ายและเสถียรที่สุด

export function swingArm(client) {
  client.queue("animate", {
    action_id: "swing_arm",
    runtime_entity_id: client.entityId,
  });
}

export function attackEntity(client, targetRuntimeId) {
  swingArm(client);
  try {
    client.queue("inventory_transaction", {
      legacy_request_id: 0,
      legacy_slots: [],
      actions: [],
      transaction_type: "item_use_on_entity",
      // field ด้านล่างนี้ชื่อ/รูปแบบอาจไม่ตรงเป๊ะกับเวอร์ชันปัจจุบัน — จุดที่ต้อง debug ถ้าตีไม่โดน
      runtime_entity_id: targetRuntimeId,
      action_type: 1, // 1 มักหมายถึง "attack"
      hotbar_slot: 0,
      item: { network_id: 0 },
      from_position: { x: 0, y: 0, z: 0 },
      click_position: { x: 0, y: 0, z: 0 },
    });
  } catch (err) {
    console.warn("[actions] attackEntity ส่ง inventory_transaction ไม่สำเร็จ (ยังมี swing_arm ให้เห็นอยู่):", err.message);
  }
}

export function breakBlockAt(client, position, faceDirection = 1, holdMs = 600) {
  client.queue("player_action", {
    runtime_entity_id: client.entityId,
    action: "start_break",
    position,
    face: faceDirection,
  });

  setTimeout(() => {
    client.queue("player_action", {
      runtime_entity_id: client.entityId,
      action: "stop_break",
      position,
      face: faceDirection,
    });
  }, holdMs);
}

/** บล็อกที่อยู่ตรงหน้า ต่ำกว่าระดับสายตาเล็กน้อย (ประมาณตำแหน่งลำต้นไม้ถ้ายืนหน้าต้นไม้พอดี) */
export function blockInFrontOf(pos, yaw) {
  const rad = (yaw * Math.PI) / 180;
  const dx = -Math.sin(rad);
  const dz = Math.cos(rad);
  return {
    x: Math.floor(pos.x + dx),
    y: Math.floor(pos.y),
    z: Math.floor(pos.z + dz),
  };
}
