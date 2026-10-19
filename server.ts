// @ts-ignore — Express is provided at runtime; allow builds without its type declarations.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore — Vite is provided at runtime; allow builds without its type declarations.
import { createServer as createViteServer } from 'vite';
import { initDatabase, getDbStatus, getDistinctNodes, getNodeHistory, getAllNodesHistory, getSensorRows, insertSensorData, getLatestPerNode } from './server/db.js';
import { initMqtt, getMqttStatus, getSnapshot, sseClients, processIncomingPayload, recentPackets, startLiveTelemetrySimulator, stopLiveTelemetrySimulator } from './server/mqttService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 4477;

const NODE_METADATA: Record<string, { name: string; location: string; warn: number; danger: number; max: number; lat: number; lon: number }> = {
  '01': { name: 'สถานี 01', location: 'จุดตรวจวัด 01', warn: 120, danger: 160, max: 250, lat: 20.1492, lon: 99.8540 },
  '02': { name: 'สถานี 02', location: 'จุดตรวจวัด 02', warn: 80, danger: 120, max: 200, lat: 20.1420, lon: 99.8495 },
  '03': { name: 'สถานี 03', location: 'จุดตรวจวัด 03', warn: 140, danger: 175, max: 260, lat: 20.1560, lon: 99.8610 },
  '04': { name: 'สถานี 04', location: 'จุดตรวจวัด 04', warn: 60, danger: 95, max: 180, lat: 20.1340, lon: 99.8380 }
};

// Registered default demo accounts (Only admin and user)
const USERS = [
  {
    id: 'usr-admin',
    username: 'admin',
    password: 'password123',
    name: 'ผู้ดูแลระบบ (Admin)',
    role: 'admin' as const,
    role_th: 'ผู้ดูแลระบบ (Admin)',
    department: 'ศูนย์ควบคุมและสั่งการเฝ้าระวังน้ำท่วม'
  },
  {
    id: 'usr-user',
    username: 'user',
    password: 'password123',
    name: 'ผู้ใช้งานทั่วไป / เจ้าหน้าที่',
    role: 'user' as const,
    role_th: 'ผู้ใช้งานทั่วไป (User)',
    department: 'หน่วยงานปฏิบัติการและติดตามสถานการณ์'
  }
];

async function startServer() {
  const app = express();
  app.use(express.json());

  // Initialize DB and MQTT
  await initDatabase();
  await initMqtt();

  // ----------------------------------------------------
  // Auth API Routes
  // ----------------------------------------------------
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้' });
    }

    const trimmedUser = String(username).trim().toLowerCase();
    const userMatch = USERS.find(u => u.username.toLowerCase() === trimmedUser);

    if (userMatch) {
      if (password && password !== userMatch.password && password !== '123456' && password !== 'password' && password !== 'admin') {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }
      const { password: _, ...userData } = userMatch;
      return res.json({
        success: true,
        user: { ...userData, last_login: new Date().toISOString() },
        token: `session_${userMatch.id}_${Date.now()}`
      });
    }

    // Allow flexible login if username is admin
    if (trimmedUser === 'admin') {
      const adminUser = {
        id: 'usr-admin',
        username: 'admin',
        name: 'ผู้ดูแลระบบ (Admin)',
        role: 'admin' as const,
        role_th: 'ผู้ดูแลระบบ (Admin)',
        department: 'ศูนย์ควบคุมและสั่งการเฝ้าระวังน้ำท่วม',
        last_login: new Date().toISOString()
      };
      return res.json({
        success: true,
        user: adminUser,
        token: `session_admin_${Date.now()}`
      });
    }

    // Allow custom login for other users
    const customUser = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      username: username,
      name: `${username}`,
      role: 'user' as const,
      role_th: 'ผู้ใช้งานทั่วไป (User)',
      department: 'ศูนย์ปฏิบัติการเฝ้าระวังน้ำ',
      last_login: new Date().toISOString()
    };

    return res.json({
      success: true,
      user: customUser,
      token: `session_${customUser.id}_${Date.now()}`
    });
  });

  app.get('/api/auth/me', (req, res) => {
    // Return sample default or unauthorized
    res.json({ success: true, message: 'Auth endpoint ready' });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  });

  // ----------------------------------------------------
  // API Routes
  // ----------------------------------------------------

  // 1. Real-time SSE Stream (MQTT latest per node pushed directly)
  app.get('/api/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();

    sseClients.add(res);
    // Send immediate current snapshot
    res.write(`data: ${JSON.stringify(getSnapshot())}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 2. Current live snapshot of all nodes
  app.get('/api/live', (req, res) => {
    res.json(getSnapshot());
  });

  // 3. List of known nodes with metadata
  app.get('/api/nodes', async (req, res) => {
    try {
      const distinct = await getDistinctNodes();
      // Combine with metadata
      const nodes = distinct.map(id => {
        const meta = NODE_METADATA[id] || {
          name: `สถานีตรวจวัด Node ${id}`,
          location: `จุดติดตั้งเซนเซอร์ #${id}`,
          warn: 50,
          danger: 100,
          max: 150,
          lat: 19.9100 + (parseInt(id, 10) || 1) * 0.005,
          lon: 99.8300 + (parseInt(id, 10) || 1) * 0.005
        };
        return {
          node_id: id,
          ...meta
        };
      });
      res.json(nodes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Historical telemetry for a specific node (MySQL) — supports ?hours=1|6|24|168
  app.get('/api/history/:nodeId', async (req, res) => {
    try {
      const nodeId = req.params.nodeId;
      const limit = parseInt(req.query.limit as string, 10) || 500;
      const hours = parseFloat(req.query.hours as string) || 24;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const rows = await getNodeHistory(nodeId, limit, hours, startDate, endDate);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4.1. Historical telemetry across all stations for comparison chart
  app.get('/api/history-all', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 120;
      const rows = await getAllNodesHistory(limit);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Raw log records with search, filter, pagination (MySQL)
  app.get('/api/rows', async (req, res) => {
    try {
      const nodeId = req.query.node_id as string;
      const limit = parseInt(req.query.limit as string, 10) || 100;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const search = req.query.search as string;

      const result = await getSensorRows({ nodeId, limit, startDate, endDate, search });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. System status & health inspector
  app.get('/api/system/status', (req, res) => {
    const dbStatus = getDbStatus();
    const mqttStatus = getMqttStatus();
    res.json({
      db: dbStatus,
      mqtt: mqttStatus,
      recentPackets: recentPackets.slice(0, 15),
      timestamp: new Date().toISOString()
    });
  });

  // 7–8. Simulation disabled — production uses real MQTT only
  app.post('/api/simulate/publish', (_req, res) => {
    res.status(403).json({
      success: false,
      error: 'Simulator ปิดแล้ว — ระบบรับเฉพาะข้อมูลจริงจาก MQTT topic sensor/water/level/raw'
    });
  });

  app.post('/api/simulate/toggle', (_req, res) => {
    stopLiveTelemetrySimulator();
    res.json({
      isSimulationActive: false,
      message: 'Simulator ปิดถาวร — ใช้เฉพาะข้อมูลจริงจาก gateway / MySQL'
    });
  });

  // 9. Export CSV of historical data
  app.get('/api/export/csv', async (req, res) => {
    try {
      const nodeId = req.query.node_id as string;
      const { rows } = await getSensorRows({ nodeId, limit: 1000 });

      let csv = 'ID,Node ID,Mic (dB),NH3 (ppm),CO (ppm),NO2 (ppm),GPS Lat,GPS Lon,Sequence,RSSI (dBm),SNR (dB),Packet,Gateway,Recorded At\n';
      rows.forEach(r => {
        csv += `"${r.id}","${r.node_id}","${r.mic_db ?? ''}","${r.nh3_ppm ?? ''}","${r.co_ppm ?? ''}","${r.no2_ppm ?? ''}","${r.gps_lat ?? ''}","${r.gps_lon ?? ''}","${r.seq ?? ''}","${r.rssi ?? ''}","${r.snr ?? ''}","${r.packet ?? ''}","${r.gateway ?? ''}","${r.recorded_at}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="flood-sensor-data-${nodeId || 'all'}-${Date.now()}.csv"`);
      res.send('\uFEFF' + csv); // Include UTF-8 BOM for Excel support
    } catch (err: any) {
      res.status(500).send('Error exporting CSV: ' + err.message);
    }
  });

  // ----------------------------------------------------
  // Vite Integration for Dev / Production
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌊 Flood Monitoring Server running on http://localhost:${PORT}`);
  });
}

startServer();
