import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Compass,
  Maximize2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { NodeSummary } from '../types';
import { getNodeColor } from '../nodeColors';

interface StationMapProps {
  nodes: NodeSummary[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  className?: string;
}

// OpenStreetMap tile layer rendered through Leaflet.
const LEAFLET_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const LEAFLET_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const LABEL_MIN_DISTANCE_METERS = 350;

function distanceInMeters(firstLat: number, firstLon: number, secondLat: number, secondLon: number): number {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLat = toRadians(secondLat - firstLat);
  const deltaLon = toRadians(secondLon - firstLon);
  const firstLatitude = toRadians(firstLat);
  const secondLatitude = toRadians(secondLat);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
export const StationMap: React.FC<StationMapProps> = ({ nodes, selectedNodeId, onSelectNode, className = '' }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const fittedNodeIdsRef = useRef<Set<string>>(new Set());

  const [activeNodeId, setActiveNodeId] = useState<string | null>(selectedNodeId || null);

  // Sync external selection
  useEffect(() => {
    if (selectedNodeId) {
      setActiveNodeId(selectedNodeId);
    }
  }, [selectedNodeId]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center on Mae Chan, Chiang Rai
    const defaultCenter: [number, number] = [20.1465, 99.8525];
    const defaultZoom = 13;

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: false, // custom zoom buttons
      attributionControl: false
    });

    // Markers Layer Group
    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    mapInstanceRef.current = map;

    // Invalidate size on container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    // Map click on empty area clears the selected marker
    map.on('click', () => {
      setActiveNodeId(null);
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const tileLayer = L.tileLayer(LEAFLET_TILE_URL, {
      attribution: LEAFLET_ATTRIBUTION,
      maxZoom: 19,
      crossOrigin: true
    }).addTo(map);

    return () => {
      tileLayer.removeFrom(map);
    };
  }, []);

  // Update Markers whenever nodes or activeNodeId changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();

    nodes.forEach((node) => {
      const lat = Number(node.gps_lat) || 20.1465;
      const lon = Number(node.gps_lon) || 99.8525;
      const isSelected = node.node_id === activeNodeId;

      const isOffline = node.status === 'offline' || node.status === 'error';
      const stationColor = getNodeColor(node.node_id);
      const pingColor = stationColor;
      const pinBg = isOffline
        ? 'linear-gradient(135deg, #9ca3af, #6b7280)'
        : `linear-gradient(135deg, ${stationColor}, ${stationColor}cc)`;
      const hasNearbyNode = nodes.some(otherNode => {
        if (otherNode.node_id === node.node_id || otherNode.gps_lat === null || otherNode.gps_lon === null) return false;
        const otherLat = Number(otherNode.gps_lat);
        const otherLon = Number(otherNode.gps_lon);
        return Number.isFinite(otherLat) && Number.isFinite(otherLon)
          && distanceInMeters(lat, lon, otherLat, otherLon) < LABEL_MIN_DISTANCE_METERS;
      });
      const shouldShowLabel = isSelected || !hasNearbyNode;

      const ringEffect = isOffline
        ? `box-shadow: 0 0 0 ${isSelected ? 4 : 3}px ${stationColor}, 0 4px 6px -1px rgba(0, 0, 0, 0.15);${isSelected ? ' transform: scale(1.15);' : ''}`
        : isSelected
          ? `box-shadow: 0 0 0 4px ${stationColor}66, 0 10px 15px -3px rgba(0, 0, 0, 0.3); transform: scale(1.15);`
          : 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15);';
      const labelHtml = shouldShowLabel ? `
          <div style="
            background: #ffffff;
            color: #0f172a;
            border: ${isSelected ? `2px solid ${stationColor}` : `1px solid ${stationColor}66`};
            border-radius: 12px;
            padding: 3px 8px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 4px;
            box-shadow: ${isSelected ? `0 4px 12px ${stationColor}55` : '0 2px 4px rgba(0, 0, 0, 0.08)'};
          ">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: ${pingColor}; display: inline-block;"></span>
            <span style="color: #0f172a;">${node.name}</span>
            <span style="font-family: monospace; color: ${stationColor}; font-size: 10px; font-weight: 800;">
              ${isOffline ? 'ออฟไลน์' : (node.mic_db !== null ? `${Number(node.mic_db).toFixed(1)}dB` : '')}
            </span>
          </div>
        ` : '';

      const customHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s ease;">
          ${labelHtml}

          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: ${pinBg};
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #ffffff;
            color: #ffffff;
            ${ringEffect}
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        html: customHtml,
        className: 'custom-station-pin',
        iconSize: shouldShowLabel ? [120, 64] : [40, 40],
        iconAnchor: shouldShowLabel ? [60, 58] : [20, 20]
      });

      const marker = L.marker([lat, lon], { icon }).addTo(markersGroupRef.current!);

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setActiveNodeId(node.node_id);
        onSelectNode(node.node_id);
        if (mapInstanceRef.current) {
          const targetZoom = Math.max(mapInstanceRef.current.getZoom(), 16);
          mapInstanceRef.current.flyTo([lat, lon], targetZoom, { animate: true, duration: 0.8 });
        }
      });
    });

    const validCoords: [number, number][] = nodes
      .filter(node => node.gps_lat !== null && node.gps_lon !== null)
      .map(node => [Number(node.gps_lat), Number(node.gps_lon)] as [number, number])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    const hasNewNode = nodes.some(node => !fittedNodeIdsRef.current.has(node.node_id));

    // Fit once initially and again only when a new station appears, so live packets do not reset the user's map view.
    if (hasNewNode && validCoords.length > 0 && mapInstanceRef.current) {
      if (validCoords.length === 1) {
        mapInstanceRef.current.setView(validCoords[0], 14, { animate: true });
      } else {
        mapInstanceRef.current.fitBounds(L.latLngBounds(validCoords), { padding: [50, 50], maxZoom: 15, animate: true });
      }
      fittedNodeIdsRef.current = new Set(nodes.map(node => node.node_id));
    }
  }, [nodes, activeNodeId, onSelectNode]);

  // Fly to selected node if changed from outside
  useEffect(() => {
    if (!mapInstanceRef.current || !activeNodeId) return;
    const target = nodes.find(n => n.node_id === activeNodeId);
    if (target && target.gps_lat && target.gps_lon) {
      mapInstanceRef.current.panTo([Number(target.gps_lat), Number(target.gps_lon)], { animate: true, duration: 0.5 });
    }
  }, [activeNodeId, nodes]);

  const fitAllStations = () => {
    if (!mapInstanceRef.current || nodes.length === 0) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([20.1465, 99.8525], 13);
      }
      return;
    }
    const validCoords: [number, number][] = nodes
      .filter(n => n.gps_lat && n.gps_lon)
      .map(n => [Number(n.gps_lat), Number(n.gps_lon)]);

    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
      mapInstanceRef.current.setView([20.1465, 99.8525], 13);
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 p-2 sm:p-3 shadow-xs relative flex flex-col aspect-square lg:aspect-[16/11] ${className}`}>
      
      {/* Title & Info Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 sm:pb-4 border-b border-slate-100 gap-2.5 sm:gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 tracking-tight">
                แผนที่
              </h3>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-2.5 text-xs bg-slate-50 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl border border-slate-200 shrink-0">
            <span className="text-slate-500 font-medium text-[11px] sm:text-xs">สถานะ:</span>
            <div className="flex items-center gap-1 text-slate-700 font-medium text-[11px] sm:text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>ปกติ</span>
            </div>
            <div className="flex items-center gap-1 text-slate-700 font-medium text-[11px] sm:text-xs">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>เฝ้าระวัง</span>
            </div>
            <div className="flex items-center gap-1 text-slate-700 font-medium text-[11px] sm:text-xs">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>วิกฤต</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real Geographic Map Container */}
      <div className="relative w-full flex-1 min-h-0 rounded-xl mt-2 sm:mt-3 border border-slate-100 overflow-hidden shadow-inner">
        
        {/* Leaflet DOM Anchor */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Map Floating Tools (Top-Left) */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
          <button
            onClick={handleZoomIn}
            className="w-9 h-9 rounded-xl bg-white/95 text-slate-700 hover:bg-white hover:text-indigo-600 active:scale-95 border border-slate-200 shadow-md flex items-center justify-center transition-all backdrop-blur-md"
            title="ซูมเข้า"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-9 h-9 rounded-xl bg-white/95 text-slate-700 hover:bg-white hover:text-indigo-600 active:scale-95 border border-slate-200 shadow-md flex items-center justify-center transition-all backdrop-blur-md"
            title="ซูมออก"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitAllStations}
            className="w-9 h-9 rounded-xl bg-white/95 text-slate-700 hover:bg-white hover:text-indigo-600 active:scale-95 border border-slate-200 shadow-md flex items-center justify-center transition-all backdrop-blur-md"
            title="ขยายพอดีสถานีทั้งหมด"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

      </div>

    </div>
  );
};
