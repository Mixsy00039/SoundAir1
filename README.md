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

ต้องติดตั้ง Docker พร้อม Compose plugin

1. คัดลอก `.env.docker.example` เป็น `.env` และตั้งรหัสผ่านฐานข้อมูล รวมถึง `MQTT_USER` และ `MQTT_PASS` ที่ปลอดภัย
2. สร้างและเริ่มระบบ: `docker compose up --build -d`
3. เปิด `http://localhost:4477`

Mosquitto จะเปิดพอร์ต `1883` สำหรับอุปกรณ์ที่เชื่อมจาก host และแอปใน Compose จะเชื่อม broker ผ่านชื่อ service `mosquitto` ใช้ `MQTT_USER`/`MQTT_PASS` ชุดเดียวกันทั้ง broker และแอป ส่วนแอปที่รันนอก Docker ให้ใช้ `MQTT_HOST=localhost` ข้อมูล MySQL และ Mosquitto เก็บใน volumes `mysql_data` และ `mosquitto_data`

หยุดระบบด้วย `docker compose down`
