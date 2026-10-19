import React from 'react';
import { X, Database, Radio, Server, CheckCircle2, AlertTriangle, Cpu, Globe, Info } from 'lucide-react';
import { SystemStatus } from '../types';

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SystemStatus | null;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({ isOpen, onClose, status }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                สถานะระบบและการเชื่อมต่อ (System Health & Config)
              </h3>
              <p className="text-xs text-slate-500">
                สถาปัตยกรรม MQTT (เรียลไทม์) + MySQL (ข้อมูลย้อนหลัง)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          
          {/* Architecture Overview */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
              <Info className="w-4 h-4 text-indigo-600" />
              <span>หลักการทำงานสถาปัตยกรรมไฮบริด (Hybrid Architecture):</span>
            </div>
            <ul className="list-disc list-inside text-slate-700 space-y-1 pl-1 text-[11px] leading-relaxed">
              <li>
                <b>ข้อมูลปัจจุบัน (Live Real-time):</b> ดึงสดจาก MQTT ผ่าน Server-Sent Events (SSE) แสดงผลบนการ์ดและกราฟทันทีที่เซนเซอร์ส่งแพ็กเก็ตเข้ามา ไม่ต้องรอการคิวของฐานข้อมูล
              </li>
              <li>
                <b>ข้อมูลย้อนหลัง (Historical Archives):</b> ดึงและสืบค้นจากฐานข้อมูล MySQL (ตาราง <code className="text-indigo-700 bg-white px-1.5 py-0.5 rounded font-mono font-bold">sensor_gas_sound</code>) สามารถเลือกดูช่วงเวลา 1h, 6h, 24h, 7d และดาวน์โหลดเป็น CSV ได้
              </li>
            </ul>
          </div>

          {/* MQTT Status Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Radio className="w-4 h-4 text-indigo-600" />
                <span>MQTT Broker (HiveMQ Cloud)</span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {status?.mqtt_connected ? '● ออนไลน์ (Connected)' : '● สแตนด์บายพร้อมรับส่ง'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px]">Host:</span>
                <span className="truncate block font-semibold">{status?.mqtt_host || 'HiveMQ Cloud'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Subscribed Topic:</span>
                <span className="text-indigo-600 truncate block font-semibold">{status?.mqtt_topic || 'sensors/data/lora'}</span>
              </div>
            </div>
          </div>

          {/* MySQL Status Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Database className="w-4 h-4 text-amber-600" />
                <span>MySQL Database</span>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                status?.mysql_connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {status?.mysql_connected ? '● MySQL Connected' : '● In-Memory Fallback Engine'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px]">Database Name:</span>
                <span className="font-semibold">{status?.mysql_db || 'gas_sound_db'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Table:</span>
                <span className="text-amber-700 font-semibold">{status?.mysql_table || 'sensor_gas_sound'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Server Host:</span>
                <span className="font-semibold">{status?.mysql_host || 'localhost'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Active Status:</span>
                <span className="text-emerald-700 font-semibold">พร้อมสืบค้นย้อนหลัง & ส่งออก CSV</span>
              </div>
            </div>

            {!status?.mysql_connected && (
              <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 p-3 rounded-xl">
                💡 ในสภาพแวดล้อมพรีวิวที่ไม่มีบริการภายนอกต่ออยู่ ระบบจะเปิดใช้งาน In-Memory Storage พร้อมข้อมูลย้อนหลัง 72 ชั่วโมง เพื่อให้ทดสอบกราฟ การกรอง และดาวน์โหลด CSV ได้สมบูรณ์ 100% ทันที
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
          >
            ปิด
          </button>
        </div>

      </div>
    </div>
  );
};
