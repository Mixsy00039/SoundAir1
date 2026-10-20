import React from 'react';
import { ArrowDownRight, ArrowUpRight, FlaskConical, Mic2, Wind } from 'lucide-react';
import { NodeSummary } from '../types';
import { getNodeColor } from '../nodeColors';

interface StationCardProps {
  selectedNode: NodeSummary;
  sensorRanges: Partial<Record<'mic_db' | 'nh3_ppm' | 'co_ppm' | 'no2_ppm', { min: number; max: number }>>;
  className?: string;
}

const RangeValue: React.FC<{ value?: number; digits: number; unit: string }> = ({ value, digits, unit }) => (
  <span className="whitespace-nowrap font-mono text-base font-bold tabular-nums text-slate-900 sm:text-lg">
    {value != null && Number.isFinite(value) ? value.toFixed(digits) : '—'} <span className="text-[10px] font-semibold text-slate-500">{unit}</span>
  </span>
);

export const StationCard: React.FC<StationCardProps> = ({ selectedNode, sensorRanges, className = '' }) => {
  const stationColor = getNodeColor(selectedNode.node_id);
  const sensors = [
    { key: 'mic_db', label: 'เสียงไมโครโฟน', icon: Mic2, unit: 'dB', digits: 1, iconClass: 'bg-indigo-50 text-indigo-600' },
    { key: 'nh3_ppm', label: 'แอมโมเนีย', icon: FlaskConical, unit: 'ppm', digits: 1, iconClass: 'bg-sky-50 text-sky-600' },
    { key: 'co_ppm', label: 'คาร์บอนมอนอกไซด์', icon: Wind, unit: 'ppm', digits: 1, iconClass: 'bg-emerald-50 text-emerald-600' },
    { key: 'no2_ppm', label: 'ไนโตรเจนไดออกไซด์', icon: Wind, unit: 'ppm', digits: 2, iconClass: 'bg-amber-50 text-amber-600' }
  ] as const;

  return (
    <div className={`flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="h-1.5 w-full" style={{ backgroundColor: stationColor }} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ช่วงเวลาที่เลือก</p>
            <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">ค่าสูงสุด / ต่ำสุด</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-1 lg:grid-rows-4">
          {sensors.map(({ key, label, icon: Icon, unit, digits, iconClass }) => (
            <div
              key={key}
              className="flex min-w-0 flex-col justify-center rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate text-xs font-bold text-slate-700">{label}</span>
              </div>
              <div className="mt-2 grid min-w-0 grid-cols-2 gap-2">
                <div className="min-w-0 rounded-lg border border-slate-200/70 bg-white px-1.5 py-1">
                  <span className="flex items-center gap-0.5 text-[9px] font-semibold text-slate-400">
                    <ArrowDownRight className="h-3 w-3" /> ต่ำสุด
                  </span>
                  <RangeValue value={sensorRanges[key]?.min} digits={digits} unit={unit} />
                </div>
                <div className="min-w-0 rounded-lg border border-slate-200/70 bg-white px-1.5 py-1">
                  <span className="flex items-center gap-0.5 text-[9px] font-semibold text-slate-400">
                    <ArrowUpRight className="h-3 w-3" /> สูงสุด
                  </span>
                  <RangeValue value={sensorRanges[key]?.max} digits={digits} unit={unit} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
