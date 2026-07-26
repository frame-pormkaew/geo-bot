# geo-brain (deploy บน Render)

Discord bot + Gemini AI ของ Geo — คุยข้อความ/เสียงแบบธรรมชาติ และรับเหตุการณ์จากเกมมาคอมเมนต์

## เตรียมของ
1. สร้างบอท Discord ที่ https://discord.com/developers/applications ตั้งชื่อ "Geo"
   เปิด **Message Content Intent**, เก็บ Token ไว้
2. เชิญบอทเข้าเซิร์ฟเวอร์ผ่าน OAuth2 URL Generator (scope `bot`, permission: View Channels,
   Send Messages, Connect, Speak, Use Voice Activity)
3. เอา Gemini API key จาก https://aistudio.google.com/apikey

## Deploy บน Render
1. Push โฟลเดอร์ `geo-brain/` ขึ้น GitHub
2. บน Render: New → **Background Worker** (ไม่ใช่ Web Service เต็มรูปแบบ แต่เนื่องจากเราเปิดพอร์ต
   HTTP ไว้ให้ geo-body เชื่อมด้วย ใช้ **Web Service** ก็ได้เหมือนกัน เลือกอันไหนก็ได้ที่ Render
   plan ของคุณรองรับการรันต่อเนื่อง)
3. ตั้งค่า:
   - Root Directory: `geo-brain`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. ใส่ Environment Variables ตาม `.env.example` (DISCORD_TOKEN, GEMINI_API_KEY, BRIDGE_SECRET
   ตั้งรหัสยาวๆ เอง, BRIDGE_PORT ปล่อยว่างได้ Render จะกำหนด `PORT` มาให้เอง — ถ้า Render บังคับ
   ใช้ตัวแปร `PORT` ของตัวเอง ให้แก้ `config.js` ให้อ่าน `process.env.PORT` แทน/ควบคู่ `BRIDGE_PORT`)
5. Deploy แล้วดู log ว่าขึ้น `[discord] ล็อกอินสำเร็จ` และ `[bridge] เปิดรอ geo-body ที่พอร์ต ...`
6. เอา URL ของ service (เช่น `https://geo-brain.onrender.com`) ไปใส่ในฝั่ง Termux โดยเปลี่ยน
   `https://` เป็น `wss://`

⚠️ Render free tier บาง plan จะ "sleep" เมื่อไม่มีการเชื่อมต่อ ถ้าอยากให้ออนไลน์ตลอดต้องใช้ paid
instance หรือใช้บริการ ping ภายนอกกระตุ้นเป็นระยะ

## คำสั่งในดิสคอร์ด
- `!join` — เข้าห้องเสียงมาคุยด้วยเสียง
- `!leave` — ออกจากห้องเสียง
- พิมพ์ **@Geo** — คุยข้อความ
