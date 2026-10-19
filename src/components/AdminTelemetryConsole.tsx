import React, { useState } from 'react';
import { 
  Radio, 
  Database, 
  Cpu, 
  Wifi, 
  Download, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Layers, 
  SlidersHorizontal,
  FileSpreadsheet,
  Terminal,
  Activity
} from 'lucide-react';
import { NodeSummary, ChartDataPoint } from '../types';

interface AdminTelemetryConsoleProps {
  nodes: NodeSummary[];
  chartData: ChartDataPoint[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  className?: string;
}

export const AdminTelemetryConsole: React.FC<AdminTelemetryConsoleProps> = ({
  nodes,
  chartData,
  selectedNodeId,
  onSelectNode,
  className = ''
}) => {
  const [filterStation, setFilterStation] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'packets' | 'hardware'>('packets');

  // Filter raw packets
  const filteredPackets = chartData
    .filter(p => {
      if (filterStation !== 'all' && p.node_id && p.node_id !== filterStation) {
        return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const nodeStr = String(p.node_id || '').toLowerCase();
        const timeStr = String(p.timestamp || '').toLowerCase();
        const gwStr = String(p.gateway || '').toLowerCase();
        return nodeStr.includes(term) || timeStr.includes(term) || gwStr.includes(term);
      }
      return true;
    })
    .slice(-30)
    .reverse();

  // Export full table to CSV
  const handleExportTableCsv = () => {
    if (!chartData || chartData.length === 0) return;
    const headers = ['Recorded_At', 'Node_ID', 'Mic_dB', 'NH3_ppm', 'CO_ppm', 'NO2_ppm', 'RSSI_dBm', 'Packet', 'Gateway'];
    const rows = chartData.map(d => [
      `"${d.timestamp}"`,
      `"${d.node_id || '01'}"`,
      d.mic_db ?? '',
      d.nh3_ppm ?? '',
      d.co_ppm ?? '',
      d.no2_ppm ?? '',
      d.rssi ?? -72,
      d.packet ?? 0,
      `"${d.gateway || 'gw-chiangrai-01'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `admin_raw_telemetry_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden ${className}`}>
      
      {/* Header bar with Admin badge */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                ศูนย์ข้อมูลโทรมาตรและการวินิจฉัยเชิงลึก
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                ADMIN CONSOLE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              แสดงข้อมูลดิบจากแพ็กเก็ต LoRaWAN / MQTT, พารามิเตอร์เกณฑ์เตือนภัย และสถานะฮาร์ดแวร์เซนเซอร์
            </p>
          </div>
        </div>

        {/* Tab switcher and CSV export */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setActiveTab('packets')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'packets'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ประวัติแพ็กเก็ตดิบ
            </button>
            <button
              onClick={() => setActiveTab('hardware')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'hardware'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ตารางเกณฑ์สถานี & อุปกรณ์
            </button>
          </div>

          <button
            onClick={handleExportTableCsv}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 shrink-0"
            title="ดาวน์โหลดข้อมูลดิบเป็นไฟล์ CSV"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">ส่งออก CSV</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {activeTab === 'packets' ? (
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Filter and search bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-indigo-600" /> กรองสถานี:
              </span>
              <button
                onClick={() => setFilterStation('all')}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                  filterStation === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                ทุกสถานี (01 - 04)
              </button>
              {nodes.map(n => (
                <button
                  key={n.node_id}
                  onClick={() => setFilterStation(n.node_id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                    filterStation === n.node_id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {n.name}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-500 font-mono">
              แสดง 30 รายการล่าสุด (ทั้งหมด {chartData.length} เรคอร์ด)
            </div>
          </div>

          {/* Raw Telemetry Data Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">เวลาบันทึก</th>
                  <th className="px-3.5 py-2.5">รหัสสถานี</th>
                  <th className="px-3.5 py-2.5">Mic (dB)</th>
                  <th className="px-3.5 py-2.5">NH3 (ppm)</th>
                  <th className="px-3.5 py-2.5">CO (ppm)</th>
                  <th className="px-3.5 py-2.5">NO2 (ppm)</th>
                  <th className="px-3.5 py-2.5">RSSI / SNR</th>
                  <th className="px-3.5 py-2.5">Loss %</th>
                  <th className="px-3.5 py-2.5">Gateway / Channel</th>
                  <th className="px-3.5 py-2.5">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredPackets.length > 0 ? (
                  filteredPackets.map((pkt, idx) => {
                    const nodeName = nodes.find(n => n.node_id === pkt.node_id)?.name || `สถานี ${pkt.node_id || '01'}`;
                    const isMicHigh = (pkt.mic_db ?? 0) >= 85;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5 text-slate-700 whitespace-nowrap">{pkt.timestamp}</td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {nodeName}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className={`font-bold ${
                            pkt.mic_db === null || pkt.mic_db === undefined
                              ? 'text-slate-400 font-normal'
                              : isMicHigh
                              ? 'text-rose-600 font-black'
                              : 'text-indigo-600'
                          }`}>
                            {pkt.mic_db !== null && pkt.mic_db !== undefined ? Number(pkt.mic_db).toFixed(1) : '—'}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-blue-600 font-medium whitespace-nowrap">
                          {pkt.nh3_ppm !== null && pkt.nh3_ppm !== undefined ? Number(pkt.nh3_ppm).toFixed(1) : '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-emerald-700 font-medium whitespace-nowrap">
                          {pkt.co_ppm !== null && pkt.co_ppm !== undefined ? Number(pkt.co_ppm).toFixed(1) : '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-amber-700 font-medium whitespace-nowrap">
                          {pkt.no2_ppm !== null && pkt.no2_ppm !== undefined ? Number(pkt.no2_ppm).toFixed(2) : '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">
                          {pkt.rssi !== null ? (
                            <>
                              <span className="text-emerald-700 font-semibold">{pkt.rssi} dBm</span>
                              <span className="text-slate-400 ml-1">/ {pkt.snr !== null ? `${pkt.snr} dB` : '—'}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className="text-slate-600">{pkt.packet !== null && pkt.packet !== undefined ? `${pkt.packet}` : '—'}</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap">
                          {pkt.gateway || '—'}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> ปกติ
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-400 font-sans">
                      ไม่มีข้อมูลแพ็กเก็ตที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Hardware & Station Configuration Tab */
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {nodes.map(node => (
              <div 
                key={node.node_id} 
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-indigo-600" />
                    <h4 className="font-bold text-slate-900 text-sm">{node.name}</h4>
                    <span className="text-xs text-slate-500">({node.location_name})</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    สถานะฮาร์ดแวร์: ปกติ
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <span className="text-slate-500 block text-[10px]">เกณฑ์เตือนภัย</span>
                    <span className="font-bold font-mono text-amber-700 text-sm">
                      {node.warning_threshold_cm} cm
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <span className="text-slate-500 block text-[10px]">เกณฑ์วิกฤต</span>
                    <span className="font-bold font-mono text-rose-700 text-sm">
                      {node.danger_threshold_cm} cm
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <span className="text-slate-500 block text-[10px]">ความจุสูงสุด</span>
                    <span className="font-bold font-mono text-slate-900 text-sm">
                      {node.max_capacity_cm} cm
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                  <span>พิกัด: {Number(node.gps_lat).toFixed(4)}, {Number(node.gps_lon).toFixed(4)}</span>
                  <span>เซนเซอร์: Ultrasonic & Tipping Bucket</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
