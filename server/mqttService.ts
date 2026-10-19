import mqtt from 'mqtt';
import { parseSensorMessage, extractNodeIdFromTopic } from './sensorParser';
import { insertSensorData, getLatestPerNode, bangkokNowString } from './db';

export interface LiveNodeState {
  node_id: string;
  mic_db: number | null;
  nh3_ppm: number | null;
  co_ppm: number | null;
  no2_ppm: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  seq: number | null;
  rssi: number | null;
  snr: number | null;
  packet: number | null;
  gateway: string | null;
  recorded_at: string;
  source: 'mqtt' | 'db' | 'simulated';
  raw_payload?: string;
}

const MQTT_HOST = process.env.MQTT_HOST || 'a805ea984b2b49ada70303bf6d4f9750.s1.eu.hivemq.cloud';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '8883', 10);
const MQTT_USER = process.env.MQTT_USER || 'water';
const MQTT_PASS = process.env.MQTT_PASS || '230246**';
// Gas/sound telemetry topics from the WiFi nodes and LoRa gateway.
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'sensors/data/lora';
const MQTT_TOPICS = (process.env.MQTT_TOPICS || 'sensors/data/lora,sensors/data/wifi,sensors/data/lora/raw,sensor/gateway/status')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

export const liveByNode = new Map<string, LiveNodeState>();
export const recentPackets: Array<{ id: string; time: string; topic: string; raw: string; parsed: any }> = [];
export const sseClients = new Set<any>();

let mqttClient: mqtt.MqttClient | null = null;
let isMqttConnected = false;
let mqttError: string | null = null;
let simulationInterval: any = null;
let isSimulationActive = false; // Disabled by default - ONLY real MQTT / DB data

export function getMqttStatus() {
  return {
    isConnected: isMqttConnected,
    host: MQTT_HOST,
    port: MQTT_PORT,
    topic: MQTT_TOPIC,
    user: MQTT_USER,
    error: mqttError,
    activeNodesCount: liveByNode.size,
    isSimulationActive,
    recentPacketsCount: recentPackets.length
  };
}

export function getSnapshot(newPacket?: LiveNodeState | null) {
  return {
    mqttConnected: isMqttConnected,
    isSimulationActive,
    timestamp: new Date().toISOString(),
    rows: [...liveByNode.values()].sort((a, b) => String(a.node_id).localeCompare(String(b.node_id))),
    newPacket: newPacket || null
  };
}

export function broadcastSnapshot(newPacket?: LiveNodeState | null) {
  const payload = `data: ${JSON.stringify(getSnapshot(newPacket))}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Track last processed packet per node to prevent duplicates between JSON and RAW MQTT topics
const lastSeenPacketByNode = new Map<string, { seq?: number | null; timestamp: number }>();

export async function processIncomingPayload(topic: string, rawStr: string, source: 'mqtt' | 'simulated' = 'mqtt') {
  // Strict: reject simulated / random packets — only real MQTT (and DB seed on boot)
  if (source === 'simulated') {
    console.warn('⛔ [MQTT] Blocked simulated packet — ระบบใช้เฉพาะข้อมูลจริงจาก gateway');
    return;
  }
  try {
    const data = parseSensorMessage(rawStr);
    if (!data.node_id) {
      data.node_id = extractNodeIdFromTopic(topic);
    }
    if (!data.node_id) return;
    // Ignore invalid node ids from topic mis-parse
    if (data.node_id === 'raw' || data.node_id === 'data' || data.node_id === 'status') return;

    const nodeIdStr = String(data.node_id);
    const now = Date.now();
    // Store / display as Asia/Bangkok wall clock (no UTC shift)
    const recordedAt = bangkokNowString();

    // Check for duplicate packet received within 5 seconds (e.g. sent concurrently on both JSON and RAW topics)
    const lastSeen = lastSeenPacketByNode.get(nodeIdStr);
    const isDuplicateSeq = data.seq !== undefined && data.seq !== null && lastSeen !== undefined && lastSeen.seq === data.seq && (now - lastSeen.timestamp < 6000);

    const liveRecord: LiveNodeState = {
      node_id: nodeIdStr,
      mic_db: data.mic_db !== undefined ? data.mic_db : null,
      nh3_ppm: data.nh3_ppm !== undefined ? data.nh3_ppm : null,
      co_ppm: data.co_ppm !== undefined ? data.co_ppm : null,
      no2_ppm: data.no2_ppm !== undefined ? data.no2_ppm : null,
      gps_lat: data.gps_lat !== undefined ? data.gps_lat : null,
      gps_lon: data.gps_lon !== undefined ? data.gps_lon : null,
      seq: data.seq !== undefined ? data.seq : null,
      rssi: data.rssi !== undefined ? data.rssi : null,
      snr: data.snr !== undefined ? data.snr : null,
      packet: (data.packet_loss ?? data.packet) !== undefined ? (data.packet_loss ?? data.packet) : null,
      gateway: data.gateway || 'gw-01',
      recorded_at: recordedAt,
      source: source,
      raw_payload: rawStr
    };

    if (isDuplicateSeq) {
      // Merge richer telemetry fields (RSSI, SNR, gateway) into live state without creating duplicate DB row
      const existing = liveByNode.get(nodeIdStr);
      if (existing) {
        if (liveRecord.rssi !== null && existing.rssi === null) existing.rssi = liveRecord.rssi;
        if (liveRecord.snr !== null && existing.snr === null) existing.snr = liveRecord.snr;
        if (liveRecord.packet !== null && existing.packet === null) existing.packet = liveRecord.packet;
        if (liveRecord.gateway && existing.gateway === 'gw-01') existing.gateway = liveRecord.gateway;
      }
      return;
    }

    lastSeenPacketByNode.set(nodeIdStr, { seq: data.seq, timestamp: now });
    liveByNode.set(nodeIdStr, liveRecord);

    // Save recent packet log
    recentPackets.unshift({
      id: Math.random().toString(36).substring(2, 9),
      time: recordedAt,
      topic,
      raw: rawStr,
      parsed: liveRecord
    });
    if (recentPackets.length > 50) recentPackets.pop();

    // Persist every real MQTT packet to MySQL (await so failures are logged)
    try {
      const insertId = await insertSensorData(liveRecord);
      console.log(`📥 [MQTT→DB] node=${nodeIdStr} seq=${data.seq ?? '-'} insertId=${insertId}`);
    } catch (err: any) {
      console.error('DB Insert Error:', err?.message || err);
    }

    // Broadcast genuine new packet to SSE clients
    broadcastSnapshot(liveRecord);
  } catch (err: any) {
    console.error('Error processing payload:', err.message, '| raw:', rawStr);
  }
}

export async function initMqtt() {
  // 1. Seed only real nodes from DB (skip invalid ids like "raw")
  try {
    const latestDbRows = await getLatestPerNode();
    for (const row of latestDbRows) {
      const id = String(row.node_id);
      if (!id || id === 'raw' || id === 'data' || id === 'status') continue;
      liveByNode.set(id, {
        node_id: id,
        mic_db: row.mic_db,
        nh3_ppm: row.nh3_ppm,
        co_ppm: row.co_ppm,
        no2_ppm: row.no2_ppm,
        gps_lat: row.gps_lat,
        gps_lon: row.gps_lon,
        seq: row.seq,
        rssi: row.rssi,
        snr: row.snr,
        packet: row.packet,
        gateway: row.gateway,
        recorded_at: row.recorded_at,
        source: 'db'
      });
    }
    console.log(`🌱 [MQTT Service] Seeded ${liveByNode.size} nodes from DB:`, [...liveByNode.keys()].join(', '));
  } catch (e: any) {
    console.warn('Initial seed error:', e.message);
  }

  // 2. Connect to MQTT Broker
  try {
    const isSsl = MQTT_PORT === 8883 || MQTT_PORT === 443;
    mqttClient = mqtt.connect({
      host: MQTT_HOST,
      port: MQTT_PORT,
      protocol: isSsl ? 'mqtts' : 'mqtt',
      username: MQTT_USER,
      password: MQTT_PASS,
      rejectUnauthorized: false,
      clientId: 'flood-dashboard-' + Math.random().toString(16).substring(2, 8),
      keepalive: 30,
      reconnectPeriod: 5000,
      connectTimeout: 8000
    });

    mqttClient.on('connect', () => {
      isMqttConnected = true;
      mqttError = null;
      console.log(`✅ [MQTT] Connected to broker ${MQTT_HOST}:${MQTT_PORT}`);

      // Subscribe only to real gateway topics (no fake nodes)
      const topics = [...new Set([MQTT_TOPIC, ...MQTT_TOPICS])];
      topics.forEach((t) => {
        mqttClient?.subscribe(t, (err) => {
          if (!err) console.log(`📡 [MQTT] Subscribed to topic: ${t}`);
          else console.warn(`⚠️ [MQTT] Subscribe failed for ${t}:`, err.message);
        });
      });
      broadcastSnapshot();
    });

    mqttClient.on('message', (topic, message) => {
      // Gateway status is informational only — do not treat as sensor node telemetry
      if (topic === 'sensor/gateway/status' || topic.endsWith('/gateway/status') || topic.startsWith('flood/status/')) {
        console.log(`📡 [MQTT] Gateway status: ${message.toString().slice(0, 120)}`);
        return;
      }
      const rawStr = message.toString();
      processIncomingPayload(topic, rawStr, 'mqtt');
    });

    mqttClient.on('error', (err) => {
      isMqttConnected = false;
      mqttError = err.message;
      console.warn(`⚠️ [MQTT] Broker connection error: ${err.message}`);
      broadcastSnapshot();
    });

    mqttClient.on('close', () => {
      isMqttConnected = false;
      broadcastSnapshot();
    });

  } catch (err: any) {
    isMqttConnected = false;
    mqttError = err.message;
    console.warn(`⚠️ [MQTT] Init error: ${err.message}`);
  }

  // Live telemetry comes strictly from real MQTT broker messages or database
}

/** Simulator permanently disabled — dashboard uses ONLY real MQTT + MySQL data */
export function startLiveTelemetrySimulator() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  isSimulationActive = false;
  console.warn('⛔ [Simulator] ปิดถาวรแล้ว — ใช้เฉพาะข้อมูลจริงจาก sensors/data และ MySQL');
}

export function stopLiveTelemetrySimulator() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  isSimulationActive = false;
  // Drop any leftover simulated nodes from memory
  for (const [id, row] of liveByNode.entries()) {
    if (row.source === 'simulated') liveByNode.delete(id);
  }
  broadcastSnapshot();
}
