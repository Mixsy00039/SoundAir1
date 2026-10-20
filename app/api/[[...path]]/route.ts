import { NextRequest, NextResponse } from 'next/server';
import {
  getAllNodesHistory,
  getDbStatus,
  getDistinctNodes,
  getNodeHistory,
  getSensorRows
} from '../../../server/db';
import {
  getMqttStatus,
  getSnapshot,
  recentPackets,
  sseClients,
  stopLiveTelemetrySimulator
} from '../../../server/mqttService';
import { initializeServices } from '../../../server/startup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NODE_METADATA: Record<string, {
  name: string;
  location: string;
  warn: number;
  danger: number;
  max: number;
  lat: number;
  lon: number;
}> = {
  '01': { name: 'สถานี 01', location: 'จุดตรวจวัด 01', warn: 120, danger: 160, max: 250, lat: 20.1492, lon: 99.854 },
  '02': { name: 'สถานี 02', location: 'จุดตรวจวัด 02', warn: 80, danger: 120, max: 200, lat: 20.142, lon: 99.8495 },
  '03': { name: 'สถานี 03', location: 'จุดตรวจวัด 03', warn: 140, danger: 175, max: 260, lat: 20.156, lon: 99.861 },
  '04': { name: 'สถานี 04', location: 'จุดตรวจวัด 04', warn: 60, danger: 95, max: 180, lat: 20.134, lon: 99.838 }
};

const jsonError = (error: unknown) =>
  NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });

function createStreamResponse() {
  const encoder = new TextEncoder();
  let client: { write: (chunk: string) => void } | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      client = {
        write(chunk) {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            sseClients.delete(client);
          }
        }
      };
      sseClients.add(client);
      client.write(`data: ${JSON.stringify(getSnapshot())}\n\n`);
    },
    cancel() {
      if (client) sseClients.delete(client);
    }
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.searchParams;
  const historyMatch = pathname.match(/^\/api\/history\/([^/]+)$/);
  const needsServices = pathname === '/api/stream'
    || pathname === '/api/live'
    || pathname === '/api/nodes'
    || historyMatch !== null
    || pathname === '/api/history-all'
    || pathname === '/api/rows'
    || pathname === '/api/system/status'
    || pathname === '/api/export/csv';

  if (needsServices) await initializeServices();

  if (pathname === '/api/stream') return createStreamResponse();
  if (pathname === '/api/live') return NextResponse.json(getSnapshot());

  if (pathname === '/api/nodes') {
    try {
      const distinct = await getDistinctNodes();
      return NextResponse.json(distinct.map(id => ({
        node_id: id,
        ...(NODE_METADATA[id] || {
          name: `สถานีตรวจวัด Node ${id}`,
          location: `จุดติดตั้งเซนเซอร์ #${id}`,
          warn: 50,
          danger: 100,
          max: 150,
          lat: 19.91 + (parseInt(id, 10) || 1) * 0.005,
          lon: 99.83 + (parseInt(id, 10) || 1) * 0.005
        })
      })));
    } catch (error) {
      return jsonError(error);
    }
  }

  if (historyMatch) {
    try {
      const nodeId = decodeURIComponent(historyMatch[1]);
      const limit = parseInt(search.get('limit') || '', 10) || 500;
      const hours = parseFloat(search.get('hours') || '') || 24;
      return NextResponse.json(await getNodeHistory(
        nodeId,
        limit,
        hours,
        search.get('startDate') || undefined,
        search.get('endDate') || undefined
      ));
    } catch (error) {
      return jsonError(error);
    }
  }

  if (pathname === '/api/history-all') {
    try {
      const limit = parseInt(search.get('limit') || '', 10) || 120;
      return NextResponse.json(await getAllNodesHistory(limit));
    } catch (error) {
      return jsonError(error);
    }
  }

  if (pathname === '/api/rows') {
    try {
      const result = await getSensorRows({
        nodeId: search.get('node_id') || undefined,
        limit: parseInt(search.get('limit') || '', 10) || 100,
        startDate: search.get('startDate') || undefined,
        endDate: search.get('endDate') || undefined,
        search: search.get('search') || undefined
      });
      return NextResponse.json(result);
    } catch (error) {
      return jsonError(error);
    }
  }

  if (pathname === '/api/system/status') {
    return NextResponse.json({
      db: getDbStatus(),
      mqtt: getMqttStatus(),
      recentPackets: recentPackets.slice(0, 15),
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === '/api/auth/me') {
    return NextResponse.json({ success: true, message: 'Auth endpoint ready' });
  }

  if (pathname === '/api/export/csv') {
    try {
      const nodeId = search.get('node_id') || undefined;
      const { rows } = await getSensorRows({ nodeId, limit: 1000 });
      const csv = [
        'ID,Node ID,Mic (dB),NH3 (ppm),CO (ppm),NO2 (ppm),GPS Lat,GPS Lon,Sequence,RSSI (dBm),SNR (dB),Packet,Gateway,Recorded At',
        ...rows.map(row => [
          row.id,
          row.node_id,
          row.mic_db ?? '',
          row.nh3_ppm ?? '',
          row.co_ppm ?? '',
          row.no2_ppm ?? '',
          row.gps_lat ?? '',
          row.gps_lon ?? '',
          row.seq ?? '',
          row.rssi ?? '',
          row.snr ?? '',
          row.packet ?? '',
          row.gateway ?? '',
          row.recorded_at
        ].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
      ].join('\n');

      return new Response(`\uFEFF${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="flood-sensor-data-${nodeId || 'all'}-${Date.now()}.csv"`
        }
      });
    } catch (error) {
      return new Response(`Error exporting CSV: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === '/api/auth/login') {
    let body: { username?: unknown; password?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 });
    }
    const { username, password } = body;
    if (!username) {
      return NextResponse.json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้' }, { status: 400 });
    }

    const trimmedUser = String(username).trim().toLowerCase();
    const users = [
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
    const user = users.find(candidate => candidate.username === trimmedUser);

    if (user) {
      if (password && password !== user.password && password !== '123456' && password !== 'password' && password !== 'admin') {
        return NextResponse.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
      }
      const { password: _password, ...userData } = user;
      return NextResponse.json({
        success: true,
        user: { ...userData, last_login: new Date().toISOString() },
        token: `session_${user.id}_${Date.now()}`
      });
    }

    const customUser = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      username,
      name: String(username),
      role: 'user' as const,
      role_th: 'ผู้ใช้งานทั่วไป (User)',
      department: 'ศูนย์ปฏิบัติการเฝ้าระวังน้ำ'
    };
    return NextResponse.json({
      success: true,
      user: { ...customUser, last_login: new Date().toISOString() },
      token: `session_${customUser.id}_${Date.now()}`
    });
  }

  if (pathname === '/api/auth/logout') {
    return NextResponse.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  }

  if (pathname === '/api/simulate/publish') {
    return NextResponse.json({
      success: false,
      error: 'Simulator ปิดแล้ว — ระบบรับเฉพาะข้อมูลจริงจาก MQTT topic sensor/water/level/raw'
    }, { status: 403 });
  }

  if (pathname === '/api/simulate/toggle') {
    stopLiveTelemetrySimulator();
    return NextResponse.json({
      isSimulationActive: false,
      message: 'Simulator ปิดถาวร — ใช้เฉพาะข้อมูลจริงจาก gateway / MySQL'
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
