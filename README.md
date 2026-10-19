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

1. คัดลอก `.env.docker.example` เป็น `.env` และตั้งรหัสผ่านฐานข้อมูลที่ปลอดภัย รวมถึงค่า MQTT หากต้องการรับ telemetry สด
2. สร้างและเริ่มระบบ: `docker compose up --build -d`
3. เปิด `http://localhost:4477`

หยุดระบบด้วย `docker compose down` ข้อมูล MySQL เก็บอยู่ใน volume `mysql_data`
