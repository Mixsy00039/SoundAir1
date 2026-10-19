import React, { useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Label
} from 'recharts';
import {
  Mic2,
  FlaskConical,
  Wind,
  Clock,
  Sparkles,
  TrendingUp,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Wifi,
  Download,
  FileSpreadsheet,
  Gauge,
  Calendar,
  ChevronDown
} from 'lucide-react';
import { NodeSummary, ChartDataPoint } from '../types';
import { getNodeColor } from '../nodeColors';

interface RealtimeTrendChartProps {
  nodes: NodeSummary[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  chartData: ChartDataPoint[];
  isLoading: boolean;
  timeRange: string;
  onChangeTimeRange: (range: string) => void;
  isAdmin?: boolean;
}

const STATION_CONFIG: Record<string, { stroke: string; lightBg: string; border: string; name: string }> = {
  '01': { stroke: '#4f46e5', lightBg: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200', name: 'สถานี 01' },
  '02': { stroke: '#0284c7', lightBg: 'bg-sky-50 text-sky-700', border: 'border-sky-200', name: 'สถานี 02' },
  '03': { stroke: '#d97706', lightBg: 'bg-amber-50 text-amber-700', border: 'border-amber-200', name: 'สถานี 03' },
  '04': { stroke: '#db2777', lightBg: 'bg-pink-50 text-pink-700', border: 'border-pink-200', name: 'สถานี 04' }
};

export const RealtimeTrendChart: React.FC<RealtimeTrendChartProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  chartData,
  isLoading,
  timeRange,
  onChangeTimeRange,
  isAdmin = false
}) => {
  const [metric, setMetric] = useState<'mic' | 'nh3' | 'co' | 'no2' | 'rssi' | 'packet'>('mic');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [focusedStationId, setFocusedStationId] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const isCombined = selectedNodeId === 'all';
  const selectedNode = nodes.find(n => n.node_id === selectedNodeId) || nodes[0];

  // Guarantee unique xKey + numeric tsMs for correct time axis
  const plotData = chartData.map((d, i) => {
    let ts = typeof d.tsMs === 'number' && !Number.isNaN(d.tsMs) ? d.tsMs : NaN;
    if (Number.isNaN(ts) && d.timestamp) {
      const parsed = Date.parse(String(d.timestamp));
      if (!Number.isNaN(parsed)) ts = parsed;
    }
    if (Number.isNaN(ts)) ts = i; // last resort: keep order
    return {
      ...d,
      tsMs: ts,
      xKey: d.xKey || `${ts}-${d.seq ?? i}-${d.node_id ?? 'n'}`,
    };
  });

  const formatAxisTime = (ts: number) => {
    if (ts == null || Number.isNaN(ts) || ts < 1e11) return '';
    const d = new Date(ts);
    // Longer ranges use date labels; shorter ranges use time labels.
    const opts: Intl.DateTimeFormatOptions = ['7d', '30d', '1y'].includes(timeRange) || timeRange.startsWith('custom:')
      ? { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
      : { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false };
    return d.toLocaleString('th-TH', opts);
  };

  // Keep dots sparse so dense time ranges remain readable.
  const getDotProps = (strokeColor: string) => {
    return chartData.length <= 25
      ? { r: 2.5, fill: strokeColor, stroke: '#ffffff', strokeWidth: 1.5 }
      : false;
  };

  // Microphone alert thresholds used by the node summary.
  const warnThreshold = isCombined ? 120 : (selectedNode?.warning_threshold_cm ?? 120);
  const dangerThreshold = isCombined ? 160 : (selectedNode?.danger_threshold_cm ?? 160);

  // Statistics calculation
  let currentVal: number | null = null;
  let minVal = 0;
  let maxVal = 0;
  let avgVal = 0;
  let highestStation = '';
  let lowestStation = '';
  let allCombinedReadingsCount = 0;

  if (isCombined) {
    // Use each station's own series only — never mix node readings.
    const allReadings: { id: string; val: number }[] = [];
    nodes.forEach(n => {
      chartData.forEach(d => {
        let val: number | null = null;
        if (metric === 'mic') val = d[`mic_${n.node_id}`] ?? null;
        else if (metric === 'nh3') val = d[`nh3_${n.node_id}`] ?? null;
        else if (metric === 'co') val = d[`co_${n.node_id}`] ?? null;
        else if (metric === 'no2') val = d[`no2_${n.node_id}`] ?? null;
        else if (metric === 'rssi') val = d.rssi ?? null;
        else if (metric === 'packet') val = d.packet ?? null;

        if (val !== null && val !== undefined && !Number.isNaN(Number(val))) {
          allReadings.push({ id: n.node_id, val: Number(val) });
        }
      });
    });

    allCombinedReadingsCount = allReadings.length;

    if (allReadings.length > 0) {
      const sorted = [...allReadings].sort((a, b) => b.val - a.val);
      maxVal = sorted[0].val;
      const maxNode = nodes.find(n => n.node_id === sorted[0].id);
      highestStation = maxNode ? maxNode.name : `สถานี ${sorted[0].id}`;

      minVal = sorted[sorted.length - 1].val;
      const minNode = nodes.find(n => n.node_id === sorted[sorted.length - 1].id);
      lowestStation = minNode ? minNode.name : `สถานี ${sorted[sorted.length - 1].id}`;

      avgVal = allReadings.reduce((acc, curr) => acc + curr.val, 0) / allReadings.length;
    }
  } else {
    // Single node metrics
    const validLevels = chartData
      .map(d => {
        if (metric === 'mic') return d.mic_db;
        if (metric === 'nh3') return d.nh3_ppm;
        if (metric === 'co') return d.co_ppm;
        if (metric === 'no2') return d.no2_ppm;
        if (metric === 'rssi') return d.rssi ?? -72;
        return d.packet ?? 0;
      })
      .filter((v): v is number => v !== null && v !== undefined);

    if (validLevels.length > 0) {
      currentVal = validLevels[validLevels.length - 1];
      minVal = Math.min(...validLevels);
      maxVal = Math.max(...validLevels);
      avgVal = validLevels.reduce((a, b) => a + b, 0) / validLevels.length;
    }
  }

  const metricUnit = metric === 'mic' ? 'dB' : metric === 'rssi' ? 'dBm' : metric === 'packet' ? 'packet' : 'ppm';
  const metricLabel = metric === 'mic' ? 'เสียงไมโครโฟน' : metric === 'nh3' ? 'แอมโมเนีย' : metric === 'co' ? 'คาร์บอนมอนอกไซด์' : metric === 'no2' ? 'ไนโตรเจนไดออกไซด์' : metric === 'rssi' ? 'ระดับสัญญาณ LoRa' : 'Packet';
  const isCustomRange = timeRange.startsWith('custom:');
  const getExportFilename = (extension: 'svg' | 'csv') => {
    const date = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Bangkok'
    }).format(new Date()).replace(/\//g, '-');
    const stationName = isCombined ? 'รวมทุกสถานี' : selectedNode?.name || selectedNodeId;
    const period = isCustomRange
      ? `กำหนดเอง-${timeRange.slice('custom:'.length).replace(/:/g, '-')}`
      : timeRange;
    const safeStationName = stationName.replace(/[<>:"/\\|?*]/g, '-');

    return `${date}_${safeStationName}_${period}.${extension}`;
  };

  const hasValidData = isCombined
    ? allCombinedReadingsCount > 0
    : chartData.some(d => {
        if (metric === 'mic') return d.mic_db !== null && d.mic_db !== undefined;
        if (metric === 'nh3') return d.nh3_ppm !== null && d.nh3_ppm !== undefined;
        if (metric === 'co') return d.co_ppm !== null && d.co_ppm !== undefined;
        if (metric === 'no2') return d.no2_ppm !== null && d.no2_ppm !== undefined;
        if (metric === 'rssi') return d.rssi !== null && d.rssi !== undefined;
        return d.packet !== null && d.packet !== undefined;
      });

  const handleExportChart = () => {
    const svg = chartContainerRef.current?.querySelector('svg');
    if (!svg) return;

    const svgNamespace = 'http://www.w3.org/2000/svg';
    const chartWidth = Math.max(720, Math.round(svg.getBoundingClientRect().width));
    const chartHeight = Math.max(280, Math.round(svg.getBoundingClientRect().height));
    const headerHeight = isCombined ? 196 : 172;
    const exportedSvg = document.createElementNS(svgNamespace, 'svg');
    exportedSvg.setAttribute('xmlns', svgNamespace);
    exportedSvg.setAttribute('width', String(chartWidth));
    exportedSvg.setAttribute('height', String(chartHeight + headerHeight));
    exportedSvg.setAttribute('viewBox', `0 0 ${chartWidth} ${chartHeight + headerHeight}`);

    const addElement = (tag: string, attributes: Record<string, string>, text?: string) => {
      const element = document.createElementNS(svgNamespace, tag);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
      if (text) element.textContent = text;
      exportedSvg.appendChild(element);
      return element;
    };

    addElement('rect', { x: '0', y: '0', width: String(chartWidth), height: String(chartHeight + headerHeight), fill: '#f8fafc' });
    addElement('rect', { x: '0', y: '0', width: String(chartWidth), height: String(headerHeight), fill: '#ffffff' });
    addElement('text', { x: '28', y: '34', fill: '#0f172a', 'font-size': '20', 'font-weight': '700', 'font-family': 'sans-serif' }, `แนวโน้ม${metricLabel}`);
    addElement('text', { x: '28', y: '55', fill: '#64748b', 'font-size': '12', 'font-family': 'sans-serif' }, `${isCombined ? 'รวมทุกสถานี' : selectedNode?.name || selectedNodeId} · ${timeRange}`);

    const summary = isCombined
      ? [
          ['สูงสุดในระบบ', maxVal, highestStation],
          ['ต่ำสุดในระบบ', minVal, lowestStation],
          ['ค่าเฉลี่ยรวมทุกสถานี', avgVal, ''],
          ['จำนวนสถานีที่ติดตาม', nodes.length, 'online-count']
        ]
      : [
          ['ค่าปัจจุบัน', currentVal, ''],
          ['ระดับต่ำสุด', minVal, ''],
          ['ระดับสูงสุด', maxVal, ''],
          ['ค่าเฉลี่ย', avgVal, '']
        ];
    const summaryWidth = (chartWidth - 56) / summary.length;
    const valueColors = ['#4f46e5', '#059669', '#e11d48', '#d97706'];
    summary.forEach(([label, value, detail], index) => {
      const hasSummaryValue = isCombined ? allCombinedReadingsCount > 0 : hasValidData;
      const formatted = label === 'จำนวนสถานีที่ติดตาม'
        ? `${Number(value)} สถานี (ออนไลน์)`
        : value === null || (!hasSummaryValue && value === 0) ? '—' : `${Number(value).toFixed(1)} ${metricUnit}`;
      const x = 28 + index * summaryWidth;
      addElement('rect', { x: String(x), y: '70', width: String(summaryWidth - 10), height: '62', rx: '10', fill: '#f8fafc', stroke: '#e2e8f0' });
      addElement('text', { x: String(x + 12), y: '92', fill: '#64748b', 'font-size': '11', 'font-family': 'sans-serif' }, String(label));
      addElement('text', { x: String(x + 12), y: '116', fill: valueColors[index], 'font-size': '16', 'font-weight': '700', 'font-family': 'monospace' }, formatted);
      if (detail && detail !== 'online-count') {
        addElement('text', { x: String(x + 12), y: '148', fill: '#64748b', 'font-size': '10', 'font-family': 'sans-serif' }, String(detail));
      }
    });

    if (metric === 'mic') {
      addElement('text', { x: '28', y: '158', fill: '#b45309', 'font-size': '10', 'font-family': 'sans-serif' }, `เฝ้าระวัง: ${warnThreshold} dB`);
      addElement('text', { x: '170', y: '158', fill: '#e11d48', 'font-size': '10', 'font-family': 'sans-serif' }, `วิกฤต: ${dangerThreshold} dB`);
    }

    if (isCombined) {
      nodes.forEach((node, index) => {
        const config = STATION_CONFIG[node.node_id] || { stroke: getNodeColor(node.node_id), name: node.name };
        const x = 24 + index * Math.max(150, (chartWidth - 48) / Math.max(nodes.length, 1));
        addElement('circle', { cx: String(x + 5), cy: '176', r: '5', fill: config.stroke });
        addElement('text', { x: String(x + 16), y: '180', fill: '#334155', 'font-size': '11', 'font-weight': '600', 'font-family': 'sans-serif' }, config.name);
      });
    }

    const chartClone = svg.cloneNode(true) as SVGSVGElement;
    chartClone.setAttribute('x', '0');
    chartClone.setAttribute('y', String(headerHeight));
    chartClone.setAttribute('width', String(chartWidth));
    chartClone.setAttribute('height', String(chartHeight));
    exportedSvg.appendChild(chartClone);

    const source = new XMLSerializer().serializeToString(exportedSvg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getExportFilename('svg');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportData = () => {
    if (chartData.length === 0) return;

    const escapeCsv = (value: string | number | null | undefined) => {
      const text = value == null ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = ['เวลา', 'สถานี', 'เสียงไมโครโฟน (dB)', 'แอมโมเนีย (ppm)', 'คาร์บอนมอนอกไซด์ (ppm)', 'ไนโตรเจนไดออกไซด์ (ppm)'];
    const rows = chartData.flatMap(point => {
      const timestamp = point.timestamp || (typeof point.tsMs === 'number' ? new Date(point.tsMs).toISOString() : '');
      if (isCombined) {
        return nodes
          .map(node => [
            timestamp,
            node.name,
            point[`mic_${node.node_id}`],
            point[`nh3_${node.node_id}`],
            point[`co_${node.node_id}`],
            point[`no2_${node.node_id}`]
          ])
          .filter(row => row.slice(2).some(value => value != null && Number.isFinite(Number(value))));
      }
      return [[
        timestamp,
        selectedNode?.name || selectedNodeId,
        point.mic_db,
        point.nh3_ppm,
        point.co_ppm,
        point.no2_ppm
      ]];
    });
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getExportFilename('csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Custom Tooltip for Single & Combined Mode
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const singleMetricValue = metric === 'mic'
        ? data.mic_db
        : metric === 'nh3'
          ? data.nh3_ppm
          : metric === 'co'
            ? data.co_ppm
            : metric === 'no2'
              ? data.no2_ppm
              : metric === 'rssi'
                ? data.rssi
                : data.packet;
      const SingleMetricIcon = metric === 'mic'
        ? Mic2
        : metric === 'nh3'
          ? FlaskConical
          : metric === 'co'
            ? Wind
            : metric === 'no2'
              ? Activity
              : metric === 'rssi'
                ? Radio
                : Wifi;
      const singleMetricColor = metric === 'mic'
        ? 'text-indigo-600'
        : metric === 'nh3'
          ? 'text-blue-600'
          : metric === 'co'
            ? 'text-emerald-600'
            : metric === 'no2'
              ? 'text-amber-600'
              : 'text-slate-600';
      return (
        <div className="p-3.5 bg-white/95 border border-slate-200 rounded-2xl shadow-xl backdrop-blur-md text-xs min-w-[200px]">
          <div className="flex items-center gap-1.5 text-slate-500 font-mono mb-2 pb-1.5 border-b border-slate-100">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span>{data.timestamp}</span>
          </div>

          {isCombined ? (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {metricLabel} ทุกสถานี ({metricUnit})
              </div>
              {nodes.map(n => {
                const config = STATION_CONFIG[n.node_id] || { stroke: getNodeColor(n.node_id), name: n.name };
                let val: number | null = null;
                if (metric === 'mic') val = data[`mic_${n.node_id}`] ?? null;
                else if (metric === 'nh3') val = data[`nh3_${n.node_id}`] ?? null;
                else if (metric === 'co') val = data[`co_${n.node_id}`] ?? null;
                else if (metric === 'no2') val = data[`no2_${n.node_id}`] ?? null;
                else if (metric === 'rssi') val = data.rssi ?? null;
                else if (metric === 'packet') val = data.packet ?? null;

                const hasVal = val !== null && val !== undefined;

                return (
                  <div key={n.node_id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: config.stroke }} />
                      <span className="truncate max-w-[130px]">{n.name}</span>
                    </div>
                    <span className={`font-mono text-right ${hasVal ? 'font-bold text-slate-900' : 'text-slate-400 text-[11px]'}`}>
                      {hasVal ? `${Number(val).toFixed(1)} ${metricUnit}` : 'ไม่มีข้อมูล'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600 flex items-center gap-1">
                  <SingleMetricIcon className={`w-3.5 h-3.5 ${singleMetricColor}`} />
                  {metricLabel}:
                </span>
                <span className={`font-mono ${singleMetricValue !== null && singleMetricValue !== undefined ? 'font-bold text-slate-900' : 'text-slate-400 text-[11px]'}`}>
                  {singleMetricValue !== null && singleMetricValue !== undefined
                    ? `${Number(singleMetricValue).toFixed(metric === 'no2' ? 2 : metric === 'packet' ? 0 : 1)} ${metricUnit}`
                    : 'ไม่มีข้อมูล'}
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm relative flex flex-col">
      
      {/* Header */}
      <div className="flex flex-col gap-4 sm:gap-5 pb-4 sm:pb-5 border-b border-slate-100">
        
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              <span>แนวโน้มก๊าซและเสียง</span>
              {isCombined && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                  รวมทุกสถานี
                </span>
              )}
            </h3>
            {isCombined && <p className="text-xs sm:text-sm text-slate-500 mt-0.5">เปรียบเทียบทุกสถานีในกราฟเดียว</p>}
          </div>
        </div>

        {/* Combined view and individual stations in one dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-1 text-[10px] font-bold text-slate-500">แสดงข้อมูล</span>
            <div className="relative min-w-[220px]">
              <select
                aria-label="เลือกสถานี"
                value={selectedNodeId}
                onChange={(event) => {
                  onSelectNode(event.target.value);
                }}
                className="min-h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="all">รวมทุกสถานี</option>
                {nodes.map(node => (
                  <option key={node.node_id} value={node.node_id}>{node.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 px-1 text-[10px] font-bold text-slate-500">ช่วงเวลา</span>
            <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs flex-wrap justify-end">
              {['1h', '6h', '24h', '7d', '30d', '1y'].map((range) => (
                <button
                  key={range}
                  onClick={() => onChangeTimeRange(range)}
                  className={`px-2.5 py-1.5 rounded-lg transition-all min-h-[36px] ${
                    timeRange === range ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {range === '1h' ? '1 ชม.' : range === '6h' ? '6 ชม.' : range === '24h' ? 'วันนี้' : range === '7d' ? '7 วัน' : range === '30d' ? '30 วัน' : '1 ปี'}
                </button>
              ))}
              <button
                onClick={() => setShowCustomRange(value => !value)}
                className={`px-2.5 py-1.5 rounded-lg transition-all min-h-[36px] flex items-center gap-1 ${isCustomRange ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                title="กำหนดช่วงวันที่เอง"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>กำหนดเอง</span>
              </button>
            </div>
          </div>
        </div>

        {showCustomRange && (
          <div className="flex items-center justify-end gap-2 flex-wrap p-1.5 bg-white border border-slate-200 rounded-xl shadow-sm text-xs">
            <label className="flex items-center gap-1.5 text-slate-500">
              <span>ตั้งแต่</span>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-700" />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500">
              <span>ถึง</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-700" />
            </label>
            <button
              onClick={() => {
                if (customStart && customEnd && customStart <= customEnd) {
                  onChangeTimeRange(`custom:${customStart}:${customEnd}`);
                  setShowCustomRange(false);
                }
              }}
              disabled={!customStart || !customEnd || customStart > customEnd}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ใช้ช่วงเวลา
            </button>
          </div>
        )}

        {/* Metric Buttons, Time Range & Admin Tools */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3">
            <span className="mb-2 block px-1 text-[10px] font-bold text-slate-500">เลือกตัวชี้วัด</span>
            <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setMetric('mic')}
              className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] transition-all min-h-[36px] ${
                metric === 'mic' ? 'bg-white text-indigo-600 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mic2 className="w-3.5 h-3.5" />
              <span>เสียง (dB)</span>
            </button>
            <button
              onClick={() => setMetric('nh3')}
              className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] transition-all min-h-[36px] ${
                metric === 'nh3' ? 'bg-white text-blue-600 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>แอมโมเนีย</span>
            </button>
            <button
              onClick={() => setMetric('co')}
              className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] transition-all min-h-[36px] ${
                metric === 'co' ? 'bg-white text-emerald-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>คาร์บอนมอนอกไซด์</span>
            </button>

            <button
              onClick={() => setMetric('no2')}
              className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] transition-all min-h-[36px] ${
                metric === 'no2' ? 'bg-white text-amber-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ไนโตรเจนไดออกไซด์ (ppm)"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>ไนโตรเจนไดออกไซด์</span>
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setMetric('rssi')}
                  className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] transition-all min-h-[36px] ${
                    metric === 'rssi' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-indigo-700 hover:bg-indigo-50 font-medium'
                  }`}
                  title="ระดับความแรงสัญญาณ LoRa RSSI (dBm)"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>สัญญาณ LoRa</span>
                </button>
                <button
                  onClick={() => setMetric('packet')}
                  className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] transition-all min-h-[36px] ${
                    metric === 'packet' ? 'bg-slate-700 text-white font-bold shadow-xs' : 'text-slate-700 hover:bg-slate-50 font-medium'
                  }`}
                  title="ลำดับแพ็กเก็ต"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Packet</span>
                </button>
              </>
            )}
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3">
            <span className="mb-2 block px-1 text-[10px] font-bold text-slate-500">ส่งออก</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={handleExportChart}
                disabled={!hasValidData}
                className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                title="ดาวน์โหลดกราฟเป็นภาพ SVG"
              >
                <Download className="h-3.5 w-3.5 text-indigo-300" />
                <span>ภาพกราฟ</span>
              </button>
              <button
                onClick={handleExportData}
                disabled={chartData.length === 0}
                className="flex min-h-[36px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="ดาวน์โหลดข้อมูลตัวเลขเป็น CSV เปิดได้ด้วย Excel"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>ข้อมูล CSV</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Combined Mode Legend Strip */}
      {isCombined && (
        <div className="flex items-center gap-2 sm:gap-3 py-2 px-3 bg-slate-50/80 rounded-2xl border border-slate-100 mt-2.5 flex-wrap text-xs">
          <span className="text-slate-500 font-medium text-[11px] flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-indigo-600" />
            กดชื่อสถานีเพื่อเน้นเส้น:
          </span>
          {nodes.map(n => {
            const config = STATION_CONFIG[n.node_id] || { stroke: getNodeColor(n.node_id), name: n.name };
            const isFocused = focusedStationId === n.node_id;
            const isDimmed = focusedStationId !== null && !isFocused;
            return (
              <button
                key={n.node_id}
                type="button"
                onClick={() => setFocusedStationId(current => current === n.node_id ? null : n.node_id)}
                aria-pressed={isFocused}
                title={isFocused ? 'แสดงทุกสถานี' : `เน้น${n.name}`}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                  isFocused ? 'border-slate-400 bg-white shadow-sm' : 'border-slate-200/80 bg-white shadow-2xs hover:border-slate-300'
                } ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: config.stroke }} />
                <span className="font-semibold text-slate-700 text-[11px]">{n.name}</span>
                {metric === 'mic' && n.mic_db !== null && (
                  <span className="font-mono text-slate-900 font-bold ml-1 text-[11px]">{n.mic_db.toFixed(1)} dB</span>
                )}
              </button>
            );
          })}
          {focusedStationId && (
            <button
              type="button"
              onClick={() => setFocusedStationId(null)}
              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              แสดงทุกสถานี
            </button>
          )}
        </div>
      )}

      {/* Statistical Summary Bento Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 py-2.5 sm:py-3 my-2.5 sm:my-3 bg-slate-50 rounded-2xl px-3 sm:px-4 border border-slate-100 text-xs">
        {isCombined ? (
          <>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">สูงสุดในระบบ</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm sm:text-base font-extrabold text-rose-600 font-mono">
                  {allCombinedReadingsCount > 0 ? `${Number(maxVal).toFixed(1)} ${metricUnit}` : '—'}
                </span>
                <span className="text-[10px] text-slate-500 truncate max-w-[90px]">({highestStation})</span>
              </div>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">ต่ำสุดในระบบ</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm sm:text-base font-extrabold text-emerald-600 font-mono">
                  {allCombinedReadingsCount > 0 ? `${Number(minVal).toFixed(1)} ${metricUnit}` : '—'}
                </span>
                <span className="text-[10px] text-slate-500 truncate max-w-[90px]">({lowestStation})</span>
              </div>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">ค่าเฉลี่ยรวมทุกสถานี</span>
              <span className="text-sm sm:text-base font-extrabold text-indigo-600 font-mono">
                  {allCombinedReadingsCount > 0 ? `${Number(avgVal).toFixed(1)} ${metricUnit}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">จำนวนสถานีที่ติดตาม</span>
              <span className="text-sm sm:text-base font-extrabold text-slate-800 font-mono">
                {nodes.length} สถานี (ออนไลน์)
              </span>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">ค่าปัจจุบัน</span>
              <span className="text-sm sm:text-base font-extrabold text-indigo-600 font-mono">
                {currentVal !== null ? `${Number(currentVal).toFixed(1)} ${metricUnit}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">ระดับต่ำสุด</span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-600 font-mono">
                {hasValidData ? `${Number(minVal).toFixed(1)} ${metricUnit}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">ระดับสูงสุด</span>
              <span className="text-sm sm:text-base font-extrabold text-rose-600 font-mono">
                {hasValidData ? `${Number(maxVal).toFixed(1)} ${metricUnit}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[10px] sm:text-[11px]">ค่าเฉลี่ย</span>
              <span className="text-sm sm:text-base font-extrabold text-amber-600 font-mono">
                {hasValidData ? `${Number(avgVal).toFixed(1)} ${metricUnit}` : '—'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Threshold Indicators Description */}
      {metric === 'mic' && (
        <div className="flex items-center gap-4 text-xs text-slate-500 mb-2 px-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500 inline-block border-t border-dashed border-amber-500" />
            <span>ระดับเฝ้าระวัง: <b className="text-amber-700 font-mono">{warnThreshold} dB</b></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-rose-500 inline-block border-t border-dashed border-rose-500" />
            <span>ระดับวิกฤต: <b className="text-rose-600 font-mono">{dangerThreshold} dB</b></span>
          </div>
        </div>
      )}

      {/* Compact chart canvas keeps station details visually primary. */}
      <div ref={chartContainerRef} className="h-[220px] sm:h-[260px] md:h-[280px] w-full pt-2">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
              <span>กำลังโหลดข้อมูลกราฟ…</span>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
            <Activity className="w-8 h-8 text-slate-300 stroke-1" />
            <span className="font-medium text-slate-600">ไม่มีข้อมูลที่ส่งมาจากสถานีนี้ในช่วงเวลาที่เลือก</span>
            <span className="text-xs text-slate-400">ระบบจะพล็อตเส้นกราฟและจุดตรวจวัดเมื่อมีข้อมูลส่งมาจากเซนเซอร์จริง</span>
          </div>
        ) : !hasValidData ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
            <Activity className="w-8 h-8 text-indigo-300 stroke-1" />
            <span className="font-medium text-slate-700">ไม่มีข้อมูลสำหรับ &ldquo;{metricLabel}&rdquo; ในช่วงเวลาที่เลือก</span>
            <span className="text-xs text-slate-400">ยังไม่มีการบันทึกค่าตรวจวัด {metricLabel} ({metricUnit}) จากเซนเซอร์</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={plotData} margin={{ top: 8, right: 12, left: 24, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              
              {/* เริ่มซ้ายสุดจบขวาสุด — ไม่มีระยะห่างสองข้าง */}
              <XAxis
                dataKey="tsMs"
                type="number"
                domain={
                  plotData.length > 0
                    ? [
                        Math.min(...plotData.map((p) => Number(p.tsMs))),
                        Math.max(...plotData.map((p) => Number(p.tsMs))),
                      ]
                    : ['dataMin', 'dataMax']
                }
                padding={{ left: 0, right: 0 }}
                allowDataOverflow={false}
                scale="time"
                stroke="#94a3b8"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickLine={{ stroke: '#e2e8f0' }}
                minTickGap={40}
                tickCount={5}
                tickFormatter={(value: number) => formatAxisTime(Number(value))}
                label={{
                  value: 'เวลา',
                  position: 'insideBottom',
                  offset: -5,
                  style: { fill: '#64748b', fontSize: 10 }
                }}
              />

              <YAxis
                stroke="#94a3b8"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={{ stroke: '#e2e8f0' }}
                domain={metric === 'rssi' ? [-120, -30] : metric === 'packet' ? [0, 'auto'] : [0, 'auto']}
                label={{
                  value: `${metricLabel} (${metricUnit})`,
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#64748b', fontSize: 10, textAnchor: 'middle' }
                }}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                isAnimationActive={false}
              />

              {/* Reference Lines for microphone thresholds */}
              {metric === 'mic' && (
                <>
                  <ReferenceLine
                    y={warnThreshold}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{ value: `เฝ้าระวัง (${warnThreshold}dB)`, fill: '#d97706', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <ReferenceLine
                    y={dangerThreshold}
                    stroke="#f43f5e"
                    strokeDasharray="4 4"
                    label={{ value: `วิกฤต (${dangerThreshold}dB)`, fill: '#e11d48', fontSize: 10, position: 'insideTopRight' }}
                  />
                </>
              )}

              {/* Render Lines Based on Mode (Combined vs Single) */}
              {isCombined ? (
                // Combined Mode: Multi-Lines for each station
                nodes.map((n) => {
                  const config = STATION_CONFIG[n.node_id] || { stroke: getNodeColor(n.node_id), name: n.name };
                  const dataKey = metric === 'mic'
                    ? `mic_${n.node_id}`
                    : metric === 'nh3'
                    ? `nh3_${n.node_id}`
                    : metric === 'co'
                    ? `co_${n.node_id}`
                    : metric === 'no2'
                    ? `no2_${n.node_id}`
                    : metric === 'rssi'
                    ? `rssi`
                    : `packet`;

                  return (
                    <Line
                      key={n.node_id}
                      type="monotone"
                      dataKey={dataKey}
                      name={n.name}
                      stroke={config.stroke}
                      strokeWidth={focusedStationId === n.node_id ? 4 : 2.5}
                      strokeOpacity={focusedStationId && focusedStationId !== n.node_id ? 0.18 : 1}
                      connectNulls={true}
                      dot={getDotProps(config.stroke)}
                      activeDot={{ r: 5, fill: config.stroke, stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  );
                })
              ) : (
                // Single Station Mode
                <>
                  {metric === 'mic' && (
                    <Line
                      type="monotone"
                      dataKey="mic_db"
                      name="Mic (dB)"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      connectNulls={true}
                      dot={getDotProps('#4f46e5')}
                      activeDot={{ r: 6, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {metric === 'nh3' && (
                    <Line
                      type="monotone"
                      dataKey="nh3_ppm"
                      name="NH3 (ppm)"
                      stroke="#0284c7"
                      strokeWidth={3}
                      connectNulls={true}
                      dot={getDotProps('#0284c7')}
                      activeDot={{ r: 6, fill: '#0284c7', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {metric === 'co' && (
                    <Line
                      type="monotone"
                      dataKey="co_ppm"
                      name="CO (ppm)"
                      stroke="#059669"
                      strokeWidth={3}
                      connectNulls={true}
                      dot={getDotProps('#059669')}
                      activeDot={{ r: 6, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {metric === 'rssi' && (
                    <Line
                      type="monotone"
                      dataKey="rssi"
                      name="ระดับสัญญาณ LoRa (dBm)"
                      stroke="#6366f1"
                      strokeWidth={3}
                      connectNulls={true}
                      dot={getDotProps('#6366f1')}
                      activeDot={{ r: 6, fill: '#6366f1', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {metric === 'no2' && (
                    <Line
                      type="monotone"
                      dataKey="no2_ppm"
                      name="NO2 (ppm)"
                      stroke="#e11d48"
                      strokeWidth={3}
                      connectNulls={true}
                      dot={getDotProps('#e11d48')}
                      activeDot={{ r: 6, fill: '#e11d48', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {metric === 'packet' && (
                    <Line
                      type="monotone"
                      dataKey="packet"
                      name="Packet"
                      stroke="#64748b"
                      strokeWidth={3}
                      connectNulls={true}
                      dot={getDotProps('#64748b')}
                      activeDot={{ r: 6, fill: '#64748b', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}
                </>
              )}

            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
};
