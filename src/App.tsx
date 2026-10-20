import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Navbar } from './components/Navbar';
import { OverviewBanner } from './components/OverviewBanner';
import { StationCard } from './components/StationCard';
import { RealtimeTrendChart } from './components/RealtimeTrendChart';
import { SystemHealthModal } from './components/SystemHealthModal';
import { AdminTelemetryConsole } from './components/AdminTelemetryConsole';
import { NodeSummary, SensorData, SystemStatus, ChartDataPoint } from './types';
import { RefreshCw, Radio, Database, Waves, Sparkles, Activity, ShieldCheck, Terminal, Cpu, MapPin, ChevronDown } from 'lucide-react';
import { getNodeColor } from './nodeColors';

const StationMap = dynamic(
  () => import('./components/StationMap').then(module => module.StationMap),
  { ssr: false }
);

const NODE_NAMES: Record<string, { name: string; loc: string; warn: number; danger: number; max: number }> = {
  'L01': { name: 'สถานีตรวจวัด 01', loc: 'จุดตรวจวัด 01', warn: 50, danger: 100, max: 150 },
  '01': { name: 'สถานี 01', loc: 'จุดตรวจวัด 01', warn: 120, danger: 160, max: 250 },
  '02': { name: 'สถานี 02', loc: 'จุดตรวจวัด 02', warn: 80, danger: 120, max: 200 },
  '03': { name: 'สถานี 03', loc: 'จุดตรวจวัด 03', warn: 140, danger: 175, max: 260 },
  '04': { name: 'สถานี 04', loc: 'จุดตรวจวัด 04', warn: 60, danger: 95, max: 180 }
};

export default function App() {
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const nodesRef = useRef<NodeSummary[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isChartLoading, setIsChartLoading] = useState<boolean>(false);
  const [timeRange, setTimeRange] = useState<string>('24h');

  // System & MQTT Stream state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // System modal
  const [isSystemModalOpen, setIsSystemModalOpen] = useState<boolean>(false);

  // Offline if no MQTT/DB packet for this node within 20 seconds
  const OFFLINE_AFTER_MS = 20_000;

  const parsePacketTime = (raw?: string | null): number | null => {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
      const t = Date.parse(s);
      return Number.isNaN(t) ? null : t;
    }
    const n = s.includes('T') ? s : s.replace(' ', 'T');
    const t = Date.parse(n + '+07:00');
    return Number.isNaN(t) ? null : t;
  };

  // Helper to build node summary from raw sensor data
  const buildNodeSummary = useCallback((nodeId: string, latestData: SensorData | null, nowMs: number = Date.now()): NodeSummary => {
    const stationNumber = nodeId.match(/^W(\d+)$/i)?.[1];
    const meta = NODE_NAMES[nodeId] || {
      name: stationNumber ? `สถานีตรวจวัด ${stationNumber}` : `สถานีตรวจวัด Node ${nodeId}`,
      loc: stationNumber ? `จุดตรวจวัด ${stationNumber}` : `จุดติดตั้งเซนเซอร์ #${nodeId}`,
      warn: 50,
      danger: 100,
      max: 150
    };

    const micDb = latestData?.mic_db ?? null;
    const nh3Ppm = latestData?.nh3_ppm ?? null;
    const coPpm = latestData?.co_ppm ?? null;
    const no2Ppm = latestData?.no2_ppm ?? null;
    const primaryValue = micDb !== null && micDb !== undefined ? Number(micDb) : null;
    const hasTelemetry = [micDb, nh3Ppm, coPpm, no2Ppm].some(value => value !== null && value !== undefined);
    const lastMs = parsePacketTime(latestData?.recorded_at ?? null);
    const ageMs = lastMs != null ? nowMs - lastMs : null;
    const isStale = latestData == null || !hasTelemetry || ageMs == null || ageMs < -5_000 || ageMs > OFFLINE_AFTER_MS;

    let status: 'normal' | 'watch' | 'danger' | 'offline' | 'error' = 'normal';
    let status_th = 'ปกติ';

    if (isStale) {
      status = 'offline';
      status_th = latestData && hasTelemetry ? 'ออฟไลน์' : 'ไม่มีข้อมูล';
    } else if (primaryValue !== null && primaryValue >= 100) {
      status = 'danger';
      status_th = 'วิกฤต';
    } else if (primaryValue !== null && primaryValue >= 85) {
      status = 'watch';
      status_th = 'เฝ้าระวัง';
    } else {
      status = 'normal';
      status_th = 'ปกติ';
    }

    return {
      node_id: nodeId,
      name: meta.name,
      location_name: meta.loc,
      latest: latestData,
      status,
      status_th,
      mic_db: micDb,
      nh3_ppm: nh3Ppm,
      co_ppm: coPpm,
      no2_ppm: no2Ppm,
      rssi: latestData?.rssi ?? null,
      snr: latestData?.snr ?? null,
      packet: latestData?.packet ?? 0,
      gps_lat: latestData?.gps_lat ?? null,
      gps_lon: latestData?.gps_lon ?? null,
      last_updated: latestData?.recorded_at || new Date().toISOString(),
      warning_threshold_cm: 85,
      danger_threshold_cm: 100,
      max_capacity_cm: 120,
      trend: 'stable'
    };
  }, []);

  const makeStationNamesUnique = (stations: NodeSummary[]): NodeSummary[] => {
    const usedNames = new Set<string>();

    return stations.map(station => {
      let name = station.name;
      const numberedName = name.match(/^(.*?)(\d+)$/);
      let number = numberedName ? Number(numberedName[2]) : 1;
      const prefix = numberedName ? numberedName[1] : `${name} `;
      const padding = numberedName?.[2].length ?? 1;

      while (usedNames.has(name)) {
        number += 1;
        name = `${prefix}${String(number).padStart(padding, '0')}`;
      }
      usedNames.add(name);

      return name === station.name ? station : { ...station, name };
    });
  };

  // 1. Fetch system status
  const fetchSystemStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        setSystemStatus({
          mysql_connected: data.db?.isConnected || false,
          mysql_host: data.db?.host || 'localhost',
          mysql_db: data.db?.database || 'gas_sound_db',
          mysql_table: data.db?.table || 'sensor_gas_sound',
          mysql_error: data.db?.error || null,
          mqtt_connected: data.mqtt?.isConnected || false,
          mqtt_host: data.mqtt?.host || 'HiveMQ Cloud',
          mqtt_topic: data.mqtt?.topic || 'sensors/data/lora',
          mqtt_error: data.mqtt?.error || null,
          total_records: data.db?.totalRecords || 0,
          active_nodes_count: data.mqtt?.activeNodesCount || 0,
          last_packet_time: data.timestamp || null,
          is_using_mock_db: data.db?.isMemoryEngine || false
        });
      }
    } catch (e) {
      console.warn('fetchSystemStatus error:', e);
    }
  }, []);

  // 2. Fetch historical trend by range, including custom date windows
  const fetchChartHistory = useCallback(async (nodeId: string, range: string) => {
    setIsChartLoading(true);
    try {
      const hoursMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720, '1y': 8760 };
      const customMatch = range.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
      const hours = customMatch
        ? Math.max(0.25, (Date.parse(`${customMatch[2]}T23:59:59+07:00`) - Date.parse(`${customMatch[1]}T00:00:00+07:00`)) / 3600000)
        : hoursMap[range] || 24;
      const limitMap: Record<string, number> = { '1h': 500, '6h': 1000, '24h': 2000, '7d': 4000, '30d': 5000, '1y': 5000 };
      const limit = limitMap[range] || 500;
      const TZ = 'Asia/Bangkok';
      const todayRange = range === '24h'
        ? (() => {
            const parts = new Intl.DateTimeFormat('en-GB', {
              timeZone: TZ,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hourCycle: 'h23'
            }).formatToParts(new Date());
            const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
            const date = `${part('year')}-${part('month')}-${part('day')}`;
            return { startDate: `${date} 00:00:00`, endDate: `${date} ${part('hour')}:${part('minute')}:${part('second')}` };
          })()
        : null;
      const query = (id: string) => {
        const params = new URLSearchParams({ limit: String(limit), hours: String(hours) });
        if (customMatch) {
          params.set('startDate', `${customMatch[1]} 00:00:00`);
          params.set('endDate', `${customMatch[2]} 23:59:59`);
        } else if (todayRange) {
          params.set('startDate', todayRange.startDate);
          params.set('endDate', todayRange.endDate);
        }
        return `/api/history/${encodeURIComponent(id)}?${params.toString()}`;
      };

      const fmtTime = (date: Date, withSeconds = false) =>
        date.toLocaleTimeString('th-TH', {
          timeZone: TZ,
          hour: '2-digit',
          minute: '2-digit',
          ...(withSeconds ? { second: '2-digit' as const } : {}),
          hour12: false
        });
      const fmtFull = (date: Date) =>
        date.toLocaleString('th-TH', { timeZone: TZ, hour12: false });
      const fmtDay = (date: Date) =>
        date.toLocaleString('th-TH', {
          timeZone: TZ,
          day: 'numeric',
          month: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

      // Parse stored times: naive DATETIME = Asia/Bangkok, ISO with Z = convert to instant
      const parseRecordedAt = (raw: string): Date => {
        if (!raw) return new Date(NaN);
        const s = String(raw).trim();
        // ISO with timezone / Z
        if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
          return new Date(s);
        }
        // "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" without zone → Bangkok (+07)
        const normalized = s.includes('T') ? s : s.replace(' ', 'T');
        const withZone = /[+-]\d{2}:?\d{2}$|[zZ]$/.test(normalized)
          ? normalized
          : normalized + '+07:00';
        return new Date(withZone);
      };

      // ช่วงที่ขาดข้อมูล (gap) เกินเกณฑ์ → เติมจุดค่า 0 เพื่อให้เส้นต่อเนื่องไม่ขาด
      const gapThresholdMs =
        range === '1h' ? 30_000 :
        range === '6h' ? 90_000 :
        range === '24h' ? 180_000 :
        600_000; // 7d
      const gapStepMs =
        range === '1h' ? 15_000 :
        range === '6h' ? 60_000 :
        range === '24h' ? 120_000 :
        300_000;

      const fillGapsWithNulls = (points: ChartDataPoint[], singleNode: boolean, nodeIds: string[]): ChartDataPoint[] => {
        if (points.length < 2) return points;
        const out: ChartDataPoint[] = [];
        for (let i = 0; i < points.length; i++) {
          const cur = points[i];
          if (i > 0) {
            const prev = points[i - 1];
            const prevTs = Number(prev.tsMs) || 0;
            const curTs = Number(cur.tsMs) || 0;
            const gap = curTs - prevTs;
            if (gap > gapThresholdMs) {
              // เก็บแกนเวลาในช่วงข้อมูลหาย โดยไม่สร้างค่าปลอม และให้กราฟเชื่อมไปยังจุดถัดไป
              let t = prevTs + gapStepMs;
              let fillIdx = 0;
              while (t < curTs - gapStepMs / 2) {
                const d = new Date(t);
                const zeroPoint: ChartDataPoint = {
                  xKey: `gap-${t}-${fillIdx}`,
                  tsMs: t,
                  timestamp: fmtFull(d),
                  timeLabel: ['7d', '30d', '1y'].includes(range) || range.startsWith('custom:') ? fmtDay(d) : fmtTime(d, range === '1h'),
                  mic_db: null,
                  nh3_ppm: null,
                  co_ppm: null,
                  no2_ppm: null,
                  rssi: null,
                  packet: null,
                  node_id: singleNode ? String(prev.node_id) : 'all',
                  is_gap_fill: true,
                };
                if (!singleNode) {
                  nodeIds.forEach((id) => {
                    zeroPoint[`mic_${id}`] = null;
                    zeroPoint[`nh3_${id}`] = null;
                    zeroPoint[`co_${id}`] = null;
                    zeroPoint[`no2_${id}`] = null;
                  });
                }
                out.push(zeroPoint);
                fillIdx++;
                t += gapStepMs;
                // กันจุดเยอะเกินไปในช่องว่างเดียว
                if (fillIdx > 40) break;
              }
            }
          }
          out.push(cur);
        }
        return out;
      };

      const buildPoints = (rows: SensorData[], singleNode: boolean, nodeIdsForFill: string[] = []): ChartDataPoint[] => {
        if (singleNode) {
          const pts = rows
            .map((r, idx) => {
              const dateObj = parseRecordedAt(r.recorded_at);
              if (Number.isNaN(dateObj.getTime())) return null;
              return {
                xKey: `${dateObj.getTime()}-${r.seq ?? idx}-${r.node_id}`,
                tsMs: dateObj.getTime(),
                timestamp: fmtFull(dateObj),
                timeLabel: ['7d', '30d', '1y'].includes(range) || range.startsWith('custom:') ? fmtDay(dateObj) : fmtTime(dateObj, range === '1h'),
                mic_db: r.mic_db,
                nh3_ppm: r.nh3_ppm,
                co_ppm: r.co_ppm,
                no2_ppm: r.no2_ppm,
                rssi: r.rssi,
                packet: r.packet ?? 0,
                node_id: r.node_id,
                seq: r.seq
              } as ChartDataPoint;
            })
            .filter((p): p is ChartDataPoint => p !== null)
            .sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0));
          return fillGapsWithNulls(pts, true, []);
        }

        // Combined mode
        const allRecords: { date: Date; row: SensorData }[] = [];
        rows.forEach(r => {
          if (!r.recorded_at) return;
          const date = parseRecordedAt(r.recorded_at);
          if (Number.isNaN(date.getTime())) return;
          allRecords.push({ date, row: r });
        });
        allRecords.sort((a, b) => a.date.getTime() - b.date.getTime());

        const groupedPoints: ChartDataPoint[] = [];
        allRecords.forEach(({ date, row }, idx) => {
          const last = groupedPoints[groupedPoints.length - 1];
          const canMerge = last && last.tsMs != null && Math.abs(last.tsMs - date.getTime()) < 5000;
          if (canMerge && last) {
            last[`mic_${row.node_id}`] = row.mic_db;
            last[`nh3_${row.node_id}`] = row.nh3_ppm;
            last[`co_${row.node_id}`] = row.co_ppm;
            last[`no2_${row.node_id}`] = row.no2_ppm;
          } else {
            groupedPoints.push({
              xKey: `${date.getTime()}-${row.seq ?? idx}-${row.node_id}`,
              tsMs: date.getTime(),
              timestamp: fmtFull(date),
              timeLabel: ['7d', '30d', '1y'].includes(range) || range.startsWith('custom:') ? fmtDay(date) : fmtTime(date, range === '1h'),
              mic_db: null,
              nh3_ppm: null,
              co_ppm: null,
              no2_ppm: null,
              rssi: row.rssi,
              packet: row.packet ?? 0,
              node_id: 'all',
              [`mic_${row.node_id}`]: row.mic_db,
              [`nh3_${row.node_id}`]: row.nh3_ppm,
              [`co_${row.node_id}`]: row.co_ppm,
              [`no2_${row.node_id}`]: row.no2_ppm,
            });
          }
        });
        const ids = nodeIdsForFill.length > 0
          ? nodeIdsForFill
          : [...new Set(rows.map(r => String(r.node_id)).filter(Boolean))];
        return fillGapsWithNulls(groupedPoints, false, ids);
      };

      if (nodeId === 'all') {
        const currentNodes = nodesRef.current;
        const nodeIds = currentNodes.length > 0 ? currentNodes.map(n => n.node_id) : ['01', '02', '03'];
        const results = await Promise.all(
          nodeIds.map(async (id) => {
            try {
              const res = await fetch(query(id));
              if (res.ok) return await res.json() as SensorData[];
            } catch (err) {
              console.warn('History fetch error for node', id, err);
            }
            return [] as SensorData[];
          })
        );
        setChartData(buildPoints(results.flat(), false, nodeIds));
      } else {
        const res = await fetch(query(nodeId));
        if (res.ok) {
          const rows: SensorData[] = await res.json();
          setChartData(buildPoints(rows, true));
        } else {
          setChartData([]);
        }
      }
    } catch (e) {
      console.error('fetchChartHistory error:', e);
      setChartData([]);
    } finally {
      setIsChartLoading(false);
    }
  }, []);

  // Initial bootstrap and load
  useEffect(() => {
    fetchSystemStatus();

    // Load live readings and all node IDs in the database so combined history includes offline stations too.
    Promise.all([fetch('/api/live'), fetch('/api/nodes')])
      .then(async ([liveResponse, nodesResponse]) => {
        if (!liveResponse.ok) throw new Error(`Live data request failed: ${liveResponse.status}`);
        const liveData = await liveResponse.json();
        const knownNodes = nodesResponse.ok ? await nodesResponse.json() as { node_id: string }[] : [];
        if (!nodesResponse.ok) console.warn(`Known stations request failed: ${nodesResponse.status}`);

        const nodeMap = new Map<string, SensorData>();
        (liveData.rows || []).forEach((row: SensorData) => {
          const id = String(row.node_id);
          if (!id || id === 'raw' || id === 'data' || id === 'status') return;
          nodeMap.set(id, row);
        });

        const allNodeIds = [...new Set([
          ...nodeMap.keys(),
          ...knownNodes.map(node => String(node.node_id)).filter(Boolean)
        ])].sort();
        if (allNodeIds.length > 0) {
          const summaries = makeStationNamesUnique(allNodeIds.map(id => buildNodeSummary(id, nodeMap.get(id) || null)));
          setNodes(summaries);
          setSelectedNodeId(current => current || 'all');
        }
      })
      .catch(error => console.warn('Initial station load failed:', error));
  }, []);

  // 4. Real-time MQTT Live Stream Listener via SSE
  useEffect(() => {
    const eventSource = new EventSource('/api/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newPacket: SensorData | null = data.newPacket || null;

        // Refresh live dashboard data only when a real telemetry packet arrives.
        if (!newPacket || !newPacket.node_id || newPacket.node_id === 'raw') return;

        if (data.rows && Array.isArray(data.rows)) {
          const nodeMap = new Map<string, SensorData>();
          nodesRef.current.forEach(node => {
            if (node.latest) nodeMap.set(node.node_id, node.latest);
          });
          data.rows.forEach((r: SensorData) => {
            const id = String(r.node_id);
            if (!id || id === 'raw' || id === 'data' || id === 'status') return;
            nodeMap.set(id, r);
          });

          // Only show stations that actually sent data (or exist in DB seed)
          const allNodeIds = [...nodeMap.keys()].sort();
          const summaries = makeStationNamesUnique(allNodeIds.map(id => buildNodeSummary(id, nodeMap.get(id) || null)));
          setNodes(summaries);
          setSelectedNodeId(current => current || 'all');

          // Chart history is refreshed by the selected time-range schedule below.
          // MQTT packets update the live cards and station status only.
        }
      } catch (err) {
        console.warn('SSE parse error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [buildNodeSummary]);

  // Re-evaluate offline transitions without reloading the page or waiting for another packet.
  useEffect(() => {
    const statusTimer = window.setInterval(() => {
      const currentNodes = nodesRef.current;
      if (currentNodes.length === 0) return;

      const nowMs = Date.now();
      const updatedNodes = makeStationNamesUnique(currentNodes.map(node =>
        buildNodeSummary(node.node_id, node.latest ?? null, nowMs)
      ));
      const hasStatusChange = updatedNodes.some((node, index) =>
        node.status !== currentNodes[index].status
        || node.status_th !== currentNodes[index].status_th
      );

      if (hasStatusChange) setNodes(updatedNodes);
    }, 1000);

    return () => window.clearInterval(statusTimer);
  }, [buildNodeSummary]);

  // Re-fetch chart when selected node or time range changes
  useEffect(() => {
    if (!selectedNodeId) return;
    fetchChartHistory(selectedNodeId, timeRange);
  }, [selectedNodeId, timeRange, fetchChartHistory]);

  // Refresh historical chart data every 60 seconds for every time range.
  useEffect(() => {
    if (!selectedNodeId) return;
    const refreshTimer = window.setInterval(() => {
      fetchChartHistory(selectedNodeId, timeRange);
    }, 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [selectedNodeId, timeRange, fetchChartHistory]);

  const isAdmin = false;
  const selectedStation = nodes.find(node => node.node_id === selectedNodeId) || nodes[0] || null;
  const selectedStationColor = selectedStation ? getNodeColor(selectedStation.node_id) : '#64748b';
  const selectedStationOffline = selectedStation?.status === 'offline' || selectedStation?.status === 'error';
  const sensorRanges = selectedStation
    ? (['mic_db', 'nh3_ppm', 'co_ppm', 'no2_ppm'] as const).reduce((ranges, field) => {
        const chartField = selectedNodeId === 'all'
          ? `${field.split('_')[0]}_${selectedStation.node_id}`
          : field;
        const values = chartData
          .map(point => point[chartField])
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        if (values.length > 0) {
          ranges[field] = { min: Math.min(...values), max: Math.max(...values) };
        }
        return ranges;
      }, {} as Partial<Record<'mic_db' | 'nh3_ppm' | 'co_ppm' | 'no2_ppm', { min: number; max: number }>>)
    : {};

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Top Navigation */}
      <Navbar />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-5 lg:px-8 py-3 sm:py-4 space-y-3 sm:space-y-4">
        
        {/* Admin Privilege Banner (Visible only to Admin) */}
        {isAdmin && (
          <div className="bg-slate-900 text-white rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    โหมดผู้ดูแลระบบ (Admin Mode Active)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                    ข้อมูลเชิงลึกขั้นสูงเปิดใช้งาน
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  คุณได้รับสิทธิ์เข้าถึงข้อมูลโทรมาตรคลื่นวิทยุ (RSSI/SNR), อัตราสูญหาย (Loss %), ค่าพารามิเตอร์เกณฑ์เตือนภัย และบันทึกข้อมูลดิบทุกแพ็กเก็ต
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsSystemModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
              >
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>สถานะระบบ & ฐานข้อมูล</span>
              </button>
            </div>
          </div>
        )}

        <section aria-label="ข้อมูลสถานีและเซนเซอร์" className="space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                style={{ color: selectedStationColor, backgroundColor: `${selectedStationColor}12`, borderColor: `${selectedStationColor}35` }}
              >
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">สถานีที่กำลังดู</p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-bold text-slate-900">
                    {selectedStation?.name || 'กำลังโหลดสถานี...'}
                  </span>
                  {selectedStation && (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${selectedStationOffline ? 'text-slate-500' : 'text-emerald-700'}`}>
                      <span className={`h-2 w-2 rounded-full ${selectedStationOffline ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                      {selectedStationOffline ? 'ออฟไลน์' : 'ออนไลน์'}
                    </span>
                  )}
                </div>
                {selectedStation?.location_name && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">{selectedStation.location_name}</p>
                )}
              </div>
            </div>
            <div className="w-full sm:max-w-xs sm:shrink-0">
              <label htmlFor="station-select" className="mb-1.5 block text-xs font-semibold text-slate-600">
                เลือกสถานีเพื่อดูข้อมูล
              </label>
              <div className="relative">
                <select
                  id="station-select"
                  value={selectedStation?.node_id || ''}
                  onChange={(event) => setSelectedNodeId(event.target.value)}
                  disabled={nodes.length === 0}
                  className="min-h-11 w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 py-2 pl-3 pr-10 text-sm font-semibold text-slate-800 outline-none transition hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {nodes.length === 0 && <option value="">กำลังโหลดสถานี...</option>}
                  {nodes.map((node) => (
                    <option key={node.node_id} value={node.node_id}>
                      {node.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-3 sm:gap-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(300px,0.8fr)]">
            <div className="lg:col-span-2">
              <OverviewBanner
                nodes={nodes}
                selectedNodeId={selectedNodeId}
              />
            </div>
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <StationMap
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                onSelectNode={(id) => setSelectedNodeId(id)}
                className="h-full"
              />
            </div>
            <div className="min-w-0 lg:col-start-2 lg:row-start-2 lg:min-h-0">
              {nodes.length > 0 && (
                <StationCard
                  selectedNode={selectedStation!}
                  sensorRanges={sensorRanges}
                  className="h-full"
                />
              )}
            </div>
          </div>

          <div className="space-y-2 sm:space-y-3">
            <RealtimeTrendChart
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => setSelectedNodeId(id)}
              chartData={chartData}
              isLoading={isChartLoading}
              timeRange={timeRange}
              onChangeTimeRange={(r) => setTimeRange(r)}
              isAdmin={isAdmin}
            />
          </div>
        </section>

        {/* 4. Admin-Only Deep Telemetry & Raw Packet Stream Console */}
        {isAdmin && (
          <section className="animate-in fade-in duration-300">
            <AdminTelemetryConsole
              nodes={nodes}
              chartData={chartData}
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => setSelectedNodeId(id)}
            />
          </section>
        )}

      </main>

      {/* Modals */}
      <SystemHealthModal
        isOpen={isSystemModalOpen}
        onClose={() => setIsSystemModalOpen(false)}
        status={systemStatus}
      />

    </div>
  );
}
