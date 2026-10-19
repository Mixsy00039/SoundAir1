import React from 'react';
import { Activity, FlaskConical, Mic2, Wind } from 'lucide-react';
import { NodeSummary } from '../types';

interface OverviewBannerProps {
  nodes: NodeSummary[];
  selectedNodeId: string;
}

const CurrentValue: React.FC<{ value?: number | null; digits: number; unit: string }> = ({ value, digits, unit }) => (
  <div className="mt-3 flex items-baseline gap-1.5">
    <span className="font-mono text-2xl font-bold leading-none tracking-tight text-slate-900 tabular-nums sm:text-3xl">
      {value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'}
    </span>
    <span className="text-xs font-semibold text-slate-500">{unit}</span>
  </div>
);

const MetricCard: React.FC<{
  label: string;
  value?: number | null;
  digits: number;
  unit: string;
  scale: number;
  color: 'indigo' | 'sky' | 'emerald' | 'amber';
  icon: React.ElementType;
  thresholds?: { value: number; color: string }[];
  hint?: string;
}> = ({ label, value, digits, unit, scale, color, icon: Icon, thresholds = [], hint }) => {
  const colors = {
    indigo: { border: 'border-indigo-100', icon: 'bg-indigo-50 text-indigo-600', bar: 'bg-indigo-500', marker: 'border-amber-500' },
    sky: { border: 'border-sky-100', icon: 'bg-sky-50 text-sky-600', bar: 'bg-sky-500', marker: 'border-amber-500' },
    emerald: { border: 'border-emerald-100', icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500', marker: 'border-amber-500' },
    amber: { border: 'border-amber-100', icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500', marker: 'border-rose-500' }
  }[color];
  const percent = value != null && Number.isFinite(Number(value))
    ? Math.min(100, Math.max(0, (Number(value) / scale) * 100))
    : 0;

  return (
    <article className={`relative flex min-h-[150px] flex-col overflow-hidden rounded-2xl border bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md sm:min-h-[164px] sm:p-4 ${colors.border}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-bold text-slate-600 sm:text-sm">{label}</h3>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <CurrentValue value={value} digits={digits} unit={unit} />

      <div className="mt-auto pt-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-[width] duration-700 ${colors.bar}`} style={{ width: `${percent}%` }} />
          {thresholds.map((threshold) => (
            <span
              key={threshold.value}
              className={`absolute inset-y-0 border-l-2 border-dashed ${threshold.color}`}
              style={{ left: `${Math.min(100, Math.max(0, (threshold.value / scale) * 100))}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-400">
          <span>0</span>
          <span className="truncate text-right">{hint || `สูงสุด ${scale} ${unit}`}</span>
        </div>
      </div>
    </article>
  );
};

export const OverviewBanner: React.FC<OverviewBannerProps> = ({ nodes, selectedNodeId }) => {
  const onlineNodes = nodes.filter(node => node.status !== 'offline' && node.status !== 'error');
  const offlineNodes = nodes.filter(node => node.status === 'offline' || node.status === 'error');
  const selectedNode = nodes.find(node => node.node_id === selectedNodeId) || nodes[0] || null;

  return (
    <section aria-label="ค่าปัจจุบัน" className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="เสียงไมโครโฟน"
          value={selectedNode?.mic_db}
          digits={1}
          unit="dB"
          scale={120}
          color="indigo"
          icon={Mic2}
          thresholds={[{ value: 85, color: 'border-amber-500' }, { value: 100, color: 'border-rose-500' }]}
          hint="เตือน 85 · วิกฤต 100 dB"
        />
        <MetricCard
          label="แอมโมเนีย"
          value={selectedNode?.nh3_ppm}
          digits={1}
          unit="ppm"
          scale={10}
          color="sky"
          icon={FlaskConical}
          thresholds={[{ value: 5, color: 'border-amber-500' }, { value: 10, color: 'border-rose-500' }]}
          hint="เตือน 5 · วิกฤต 10 ppm"
        />
        <MetricCard
          label="คาร์บอนมอนอกไซด์"
          value={selectedNode?.co_ppm}
          digits={1}
          unit="ppm"
          scale={55.4}
          color="emerald"
          icon={Wind}
          thresholds={[{ value: 15, color: 'border-amber-500' }, { value: 35.4, color: 'border-rose-500' }]}
          hint="เตือน 15 · วิกฤต 35.4 ppm"
        />
        <MetricCard
          label="ไนโตรเจนไดออกไซด์"
          value={selectedNode?.no2_ppm}
          digits={2}
          unit="ppm"
          scale={10}
          color="amber"
          icon={Activity}
        />

        <article className="col-span-2 flex min-h-[112px] items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3.5 shadow-sm transition-shadow hover:shadow-md md:col-span-1 sm:min-h-[164px] sm:p-4">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-600 sm:text-sm">สถานะสถานี</h3>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-bold leading-none tracking-tight text-slate-900 tabular-nums sm:text-3xl">{onlineNodes.length}</span>
              <span className="text-xs font-semibold text-slate-400">/ {nodes.length} สถานี</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold sm:text-xs">
              <span className="text-emerald-700">● ออนไลน์ {onlineNodes.length}</span>
              {offlineNodes.length > 0 && <span className="text-slate-500">● ออฟไลน์ {offlineNodes.length}</span>}
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
            <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
          </span>
        </article>
      </div>
    </section>
  );
};
