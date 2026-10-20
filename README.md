# Flood Monitoring Dashboard

ระบบติดตามคุณภาพอากาศและเสียงสำหรับพื้นที่อำเภอแม่จัน แสดงข้อมูลจาก MQTT และ MySQL แบบเรียลไทม์

## เทคโนโลยี

- Next.js App Router และ React สำหรับหน้าเว็บและ API
- TypeScript
- Tailwind CSS
- MySQL สำหรับเก็บข้อมูลเซนเซอร์
- MQTT สำหรับรับข้อมูลสด

## เริ่มใช้งานในเครื่อง

ต้องติดตั้ง Node.js 22 และ MySQL ก่อน

1. ติดตั้ง dependencies: `npm install`
2. คัดลอก `.env.example` เป็น `.env` แล้วกำหนดค่าการเชื่อมต่อ MySQL และ MQTT
3. เริ่มโหมดพัฒนา: `npm run dev`
4. เปิด `http://localhost:4477`

คำสั่งที่ใช้บ่อย:

- `npm run lint` ตรวจ TypeScript
- `npm run build` สร้าง production build
- `npm start` เริ่ม production server

หากเชื่อมต่อ MySQL ไม่ได้ ระบบจะใช้ in-memory storage ชั่วคราวตามเดิม

## ใช้งานด้วย Docker

ต้องติดตั้ง Docker Engine พร้อม Compose plugin และเตรียมโดเมนสำหรับ MQTT ที่ชี้มายัง server รวมถึงใบรับรอง TLS ที่ถูกต้อง

1. คัดลอก `.env.docker.example` เป็น `.env` แล้วตั้งรหัสผ่านที่ไม่ซ้ำกันสำหรับ `DB_ROOT_PASS`, `DB_PASS` และ `MQTT_PASS`
2. วางใบรับรอง TLS แบบ PEM ชื่อ `fullchain.pem` และ private key ชื่อ `privkey.pem` ใน `mosquitto/certs/` ตรวจสอบว่า container ของ Mosquitto (UID 1883) อ่าน private key ได้ และรีสตาร์ต broker หลังต่ออายุใบรับรอง
3. เปิดพอร์ต TCP `8883` บน firewall และชี้ DNS ของ broker มาที่ server
4. สร้างและเริ่มระบบ: `docker compose up --build -d`
5. ตั้ง reverse proxy ที่มี HTTPS สำหรับเว็บให้ส่งต่อไปยัง `127.0.0.1:4477`

อุปกรณ์ MQTT ภายนอกเชื่อมต่อที่ `broker-domain:8883` ด้วย TLS และใช้ `MQTT_USER`/`MQTT_PASS` ส่วนแอปเชื่อมต่อ broker ผ่าน network ภายใน Docker ที่พอร์ต `1883` ซึ่งไม่ได้ publish ออกสู่ host ฐานข้อมูลใช้บัญชี `DB_USER` แยกจาก root และเก็บข้อมูลไว้ใน volume `mysql_data` ข้อมูล broker อยู่ใน `mosquitto_data`

พอร์ตเว็บ `4477` ถูก bind ไว้ที่ loopback เท่านั้น ให้วาง reverse proxy/TLS หน้าแอปและอย่าเปิดพอร์ตนี้สู่ internet โดยตรง ไม่ควรเปิดพอร์ต `1883` สู่ internet เช่นกัน

ข้อควรระวังก่อนเปิดเว็บสู่สาธารณะ: ระบบ login ในแอปยังเป็น demo และไม่ใช่ authentication ที่ปลอดภัยสำหรับ production การวาง reverse proxy/TLS อย่างเดียวไม่แก้ข้อจำกัดนี้ ควรจำกัดการเข้าถึงเว็บไว้หลัง VPN หรือระบบ SSO จนกว่าจะเปลี่ยนระบบ login

หยุดระบบด้วย `docker compose down` (อย่าใช้ `-v` หากต้องการเก็บข้อมูล) และสำรอง volumes `mysql_data` กับ `mosquitto_data` เป็นประจำ หากใช้ MySQL volume เดิม ให้ตั้ง `DB_ROOT_PASS` ให้ตรงกับ root password ที่ใช้อยู่ และสร้างบัญชี `DB_USER` พร้อมสิทธิ์เฉพาะฐานข้อมูล `DB_NAME` ก่อน deploy เพราะ MySQL จะไม่สร้างบัญชีใหม่ให้บน volume ที่ initialize ไปแล้ว
