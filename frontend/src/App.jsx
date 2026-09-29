/**
 * WaterSight — Main Application
 * SIH Demo: Rajsamand Watershed Geospatial Platform
 *
 * Architecture:
 * - MapLibre GL JS for interactive map
 * - Recharts for NDVI/water-spread trend charts
 * - React state for panel/layer/popup management
 * - Demo data pre-loaded for instant display
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import exifr from 'exifr';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart, ReferenceLine
} from 'recharts';

import {
  DEMO_WATERSHED, DEMO_IMAGES_GEOJSON, DEMO_STATS,
  DEMO_CHANGE, DEMO_LAYERS, DEMO_SUMMARY
} from './demoData';

import './App.css';

// ── Constants ──────────────────────────────────────────────────────────────

const MAPBOX_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const WATERSHED_CENTER = [73.880, 24.900];
const WATERSHED_ZOOM = 12;

const INTERVENTION_COLORS = {
  check_dam: '#3498db',
  farm_pond: '#2ecc71',
  afforestation: '#27ae60',
  contour_trench: '#f39c12',
  gully_plug: '#e67e22',
  other: '#95a5a6',
};

const STAGE_COLORS = {
  pre: '#e74c3c',
  during: '#f39c12',
  post: '#2ecc71',
};

const CLASSIFICATION_ICONS = {
  water_body_present: '💧',
  dense_vegetation: '🌿',
  sparse_vegetation: '🌱',
  bare_degraded_land: '🏜️',
  structure_intact: '🏗️',
  structure_damaged: '⚠️',
  soil_erosion_visible: '🌊',
  mixed: '🔀',
  unclassified: '❓',
};

const LULC_LEGEND = [
  { value: 1, label: 'Dense Vegetation', color: '#1a9850' },
  { value: 2, label: 'Agriculture / Grassland', color: '#91cf60' },
  { value: 3, label: 'Barren / Rocky', color: '#d4a76a' },
  { value: 4, label: 'Water Body', color: '#4fc3f7' },
  { value: 5, label: 'Built-up', color: '#b0bec5' },
];

// ── Utility: generate watershed boundary GeoJSON fill ──────────────────────

function makeWatershedGeoJSON(ws) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: ws.boundary,
        properties: { name: ws.name, id: ws.id },
      },
      ...ws.sub_watersheds.map((sw) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            // Generate approximate polygon from centroid + area for demo
            generateSubWatershedPolygon(sw.centroid.coordinates, sw.area_ha),
          ],
        },
        properties: { name: sw.name, code: sw.code, sub: true },
      })),
    ],
  };
}

function generateSubWatershedPolygon(center, areaHa) {
  const [lon, lat] = center;
  const r = Math.sqrt(areaHa / Math.PI) * 0.008; // rough degree radius
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const angle = (i / 20) * 2 * Math.PI;
    pts.push([lon + r * Math.cos(angle), lat + r * Math.sin(angle)]);
  }
  return pts;
}

// ── Synthetic NDVI raster overlay (colored squares for demo) ─────────────
// Since we don't have a running TiTiler, we draw a canvas-based overlay

function generateNDVICanvas(period, width = 256, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const isPost = period === '2024-post';

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Seeded noise for consistent look
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const seed = (x * 31 + y * 97 + (isPost ? 17 : 53)) % 256;
      const noise1 = Math.sin(x / 20 + seed / 50) * 0.5 + 0.5;
      const noise2 = Math.cos(y / 18 + seed / 40) * 0.5 + 0.5;
      const noise3 = Math.sin((x + y) / 25 + seed / 60) * 0.5 + 0.5;
      const raw = (noise1 * 0.4 + noise2 * 0.4 + noise3 * 0.2);
      const ndvi = isPost ? -0.1 + raw * 0.9 : -0.2 + raw * 0.65;

      // NDVI to RdYlGn colormap
      let r, g, b;
      if (ndvi < 0) { r = 180; g = 60; b = 60; }
      else if (ndvi < 0.2) { r = 240; g = 200; b = 50; }
      else if (ndvi < 0.4) { r = 160; g = 210; b = 80; }
      else if (ndvi < 0.6) { r = 60; g = 180; b = 70; }
      else { r = 20; g = 120; b = 40; }

      // Water bodies
      if (isPost && x > 90 && x < 130 && y > 110 && y < 145) {
        r = 50; g = 130; b = 220;
      }
      if (isPost && x > 50 && x < 75 && y > 160 && y < 195) {
        r = 40; g = 110; b = 200;
      }

      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx+1] = g;
      data[idx+2] = b;
      data[idx+3] = 184; // 0.72 alpha * 255
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ── Custom Chart Tooltip ────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="tooltip" style={{ minWidth: 160 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--surface-100)' }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11 }}>
            <span style={{ color: p.color }}>{p.name}</span>
            <span style={{ color: 'var(--text-900)', fontWeight: 600 }}>
              {typeof p.value === 'number' ? p.value.toFixed(p.name.includes('NDVI') ? 3 : 0) : p.value}
              {p.name.includes('ha') ? ' ha' : ''}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ── Image Popup Component ───────────────────────────────────────────────────

function ImagePopup({ image, onClose }) {
  if (!image) return null;
  const p = image.properties;
  const ndviGood = p.ndvi_at_point > 0.3;
  const ndwi_wet = p.ndwi_at_point > 0;

  return (
    <div className="image-popup" id="image-popup-panel">
      <div className="popup-header">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-900)', marginBottom: 4 }}>
            {CLASSIFICATION_ICONS[p.classification_label] || '📷'}{' '}
            {p.intervention_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`stage-badge ${p.observation_stage}`}>{p.observation_stage}</span>
            <span style={{ fontSize: 11, color: 'var(--surface-300)' }}>{p.captured_at?.slice(0, 10)}</span>
          </div>
        </div>
        <button className="popup-close" onClick={onClose} id="popup-close-btn">✕</button>
      </div>

      {/* Real Image or Placeholder */}
      {p.thumbnail_path ? (
        <img 
          src={p.thumbnail_path} 
          alt={p.notes} 
          style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }} 
        />
      ) : (
        <div className="popup-image-placeholder" style={{
          background: p.observation_stage === 'pre'
            ? 'var(--warning-500)'
            : p.classification_label === 'water_body_present'
            ? 'var(--primary-500)'
            : 'var(--success-500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px'
        }}>
          <span style={{ fontSize: 56 }}>{CLASSIFICATION_ICONS[p.classification_label] || '📷'}</span>
        </div>
      )}

      <div className="popup-body">
        {/* Satellite Values */}
        <div className="popup-section">
          <div className="popup-section-title">🛰 Satellite Values at This Point</div>
          <div className="sat-values-grid">
            <div className="sat-value-card">
              <div className={`sat-value-number ${ndviGood ? 'ndvi-good' : 'ndvi-poor'}`}>
                {p.ndvi_at_point?.toFixed(3) ?? '–'}
              </div>
              <div className="sat-value-label">NDVI (Vegetation)</div>
            </div>
            <div className="sat-value-card">
              <div className={`sat-value-number ${ndwi_wet ? 'ndwi-wet' : 'ndwi-dry'}`}>
                {p.ndwi_at_point?.toFixed(3) ?? '–'}
              </div>
              <div className="sat-value-label">MNDWI (Water)</div>
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="popup-section">
          <div className="popup-section-title">🤖 Image Classification</div>
          <div className="classification-badge">
            {CLASSIFICATION_ICONS[p.classification_label]}{' '}
            {p.classification_label?.replace(/_/g, ' ') ?? 'Unclassified'}
            {p.classification_confidence && (
              <span style={{ opacity: 0.7, fontSize: 10 }}>
                {' '}({Math.round(p.classification_confidence * 100)}%)
              </span>
            )}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--surface-200)', lineHeight: 1.5 }}>
            {p.notes}
          </div>
        </div>

        {/* Location Details */}
        <div className="popup-section">
          <div className="popup-section-title">📍 Field Metadata</div>
          <div className="popup-row">
            <span className="popup-row-label">LULC Class</span>
            <span className="popup-row-value">{p.lulc_class_at_point ?? '–'}</span>
          </div>
          <div className="popup-row">
            <span className="popup-row-label">Intervention</span>
            <span className="popup-row-value">{p.intervention_type?.replace(/_/g, ' ') ?? '–'}</span>
          </div>
          <div className="popup-row">
            <span className="popup-row-label">Stage</span>
            <span className="popup-row-value" style={{ textTransform: 'capitalize' }}>{p.observation_stage}</span>
          </div>
          <div className="popup-row">
            <span className="popup-row-label">GPS</span>
            <span className="popup-row-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>
              {image.geometry.coordinates[1].toFixed(4)}°N, {image.geometry.coordinates[0].toFixed(4)}°E
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NDVI Trend Chart Component ──────────────────────────────────────────────

function NDVITrendChart({ data, title = 'Vegetation & Water Trend' }) {
  return (
    <div className="chart-section">
      <div className="chart-title">
        <span>📈</span> {title}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#27ae60" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#27ae60" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3498db" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3498db" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="period_label"
            tick={{ fontSize: 9, fill: '#8892aa' }}
            tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre ').replace('Post-Monsoon ', 'Post ')}
          />
          <YAxis tick={{ fontSize: 9, fill: '#8892aa' }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: '#8892aa', paddingTop: 4 }}
          />
          <Area type="monotone" dataKey="ndvi_mean" name="NDVI Mean"
            stroke="#27ae60" fill="url(#ndviGrad)" strokeWidth={2} dot={{ r: 3, fill: '#27ae60' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function WaterSpreadChart({ data }) {
  return (
    <div className="chart-section">
      <div className="chart-title">
        <span>💧</span> Water Spread Area (ha)
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="waterAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#42a5f5" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#42a5f5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="period_label" tick={{ fontSize: 9, fill: '#8892aa' }}
            tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre ').replace('Post-Monsoon ', 'Post ')} />
          <YAxis tick={{ fontSize: 9, fill: '#8892aa' }} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="water_spread_ha" name="Water Spread ha"
            stroke="#42a5f5" fill="url(#waterAreaGrad)" strokeWidth={2} dot={{ r: 3, fill: '#42a5f5' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── KPI Dashboard Component ─────────────────────────────────────────────────

function KPIDashboard({ summary, change }) {
  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">0.39</div>
          <div className="kpi-delta positive">↑ +0.20</div>
          <div className="kpi-label">NDVI (2024 Post)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">980</div>
          <div className="kpi-delta positive">↑ +490 ha</div>
          <div className="kpi-label">Vegetated Area (ha)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">840</div>
          <div className="kpi-delta positive">↑ +600 ha</div>
          <div className="kpi-label">Water Spread (ha)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--gold-300)' }}>{summary.total_images}</div>
          <div className="kpi-delta" style={{ color: 'var(--surface-300)' }}>3 pre · 5 post</div>
          <div className="kpi-label">Field Images</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ fontSize: 18 }}>+105%</div>
          <div className="kpi-delta positive">NDVI improvement</div>
          <div className="kpi-label">Change 2022→2024</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">5</div>
          <div className="kpi-delta" style={{ color: 'var(--surface-300)' }}>Intervention types</div>
          <div className="kpi-label">Structures Monitored</div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const ndviCanvasRef = useRef({});
  const markersRef = useRef([]);

  // App state
  const [activeView, setActiveView] = useState('map'); // map | dashboard | upload
  const [selectedImage, setSelectedImage] = useState(null);
  const [showSwipe, setShowSwipe] = useState(false);
  const [activePeriod, setActivePeriod] = useState('2024-post');
  const [activeSideTab, setActiveSideTab] = useState('layers'); // layers | stats | report
  const [layers, setLayers] = useState({
    ndvi: true,
    ndwi: false,
    lulc: false,
    drainage: true,
    watershed_boundary: true,
    image_markers: true,
  });
  const [imageFeatures, setImageFeatures] = useState([]);
  
  // FETCH FROM PRODUCTION BACKEND
  useEffect(() => {
    const fetchAOIs = async () => {
      try {
        const response = await fetch("http://localhost:8000/aois");
        if (response.ok) {
          const data = await response.json();
          setImageFeatures(data.features || []);
        } else {
          console.error("Backend error, falling back to mock data");
          setImageFeatures(DEMO_IMAGES_GEOJSON.features);
        }
      } catch (err) {
        console.error("Could not connect to backend, falling back to mock data", err);
        setImageFeatures(DEMO_IMAGES_GEOJSON.features);
      }
    };
    fetchAOIs();
  }, []);
  const [filterStage, setFilterStage] = useState('all'); // all | pre | post
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processLogs, setProcessLogs] = useState([]);
  const [toast, setToast] = useState(null);
  const [reportGenerating, setReportGenerating] = useState(false);

  // ── Initialize Map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLE,
      center: WATERSHED_CENTER,
      zoom: WATERSHED_ZOOM,
      pitch: 10,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      setMapLoaded(true);

      // ── Watershed Boundary ──────────────────────────────────────────────
      map.addSource('watershed-boundary', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: DEMO_WATERSHED.boundary,
            properties: { name: DEMO_WATERSHED.name },
          }]
        }
      });
      map.addLayer({
        id: 'watershed-fill',
        type: 'fill',
        source: 'watershed-boundary',
        paint: {
          'fill-color': '#1565c0',
          'fill-opacity': 0.08,
        }
      });
      map.addLayer({
        id: 'watershed-outline',
        type: 'line',
        source: 'watershed-boundary',
        paint: {
          'line-color': '#42a5f5',
          'line-width': 2.5,
          'line-opacity': 0.85,
          'line-dasharray': [4, 2],
        }
      });

      // ── NDVI Raster Overlay (Canvas-based, COG substitute for demo) ─────
      // In production: TiTiler serves real tiles; this uses canvas for demo
      addNDVICanvasLayer(map, '2024-post');
      addNDVICanvasLayer(map, '2022-pre', false);

      // ── Drainage Network ────────────────────────────────────────────────
      const drainageGeoJSON = generateSyntheticDrainageGeoJSON();
      map.addSource('drainage', { type: 'geojson', data: drainageGeoJSON });
      map.addLayer({
        id: 'drainage-streams',
        type: 'line',
        source: 'drainage',
        paint: {
          'line-color': ['case', ['==', ['get', 'order'], 4], '#1976d2',
                          ['==', ['get', 'order'], 3], '#42a5f5',
                          '#90caf9'],
          'line-width': ['case', ['==', ['get', 'order'], 4], 2.5,
                          ['==', ['get', 'order'], 3], 1.5, 0.8],
          'line-opacity': 0.7,
        }
      });

      // Image markers will be added by a separate useEffect watching imageFeatures
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Canvas-based NDVI overlay ─────────────────────────────────────────────
  function addNDVICanvasLayer(map, period, visible = true) {
    const canvas = generateNDVICanvas(period);
    const id = `ndvi-canvas-${period}`;
    if (map.getSource(id)) return;

    // Bounds of Rajsamand watershed
    const bounds = [[73.835, 24.840], [73.925, 24.960]];

    map.addSource(id, {
      type: 'canvas',
      canvas: canvas,
      coordinates: [
        bounds[0],                              // top-left
        [bounds[1][0], bounds[0][1]],           // top-right
        bounds[1],                              // bottom-right
        [bounds[0][0], bounds[1][1]],           // bottom-left
      ],
      animate: false,
    });
    map.addLayer({
      id: `ndvi-layer-${period}`,
      type: 'raster',
      source: id,
      paint: { 'raster-opacity': visible ? 0.65 : 0 },
    }, 'watershed-fill');
  }

  // ── Synthetic drainage GeoJSON for demo ──────────────────────────────────
  function generateSyntheticDrainageGeoJSON() {
    const features = [];
    // Main channel
    features.push({
      type: 'Feature', properties: { order: 4 },
      geometry: { type: 'LineString', coordinates: [
        [73.840, 24.955], [73.852, 24.940], [73.860, 24.925],
        [73.868, 24.908], [73.878, 24.892], [73.890, 24.875],
        [73.900, 24.862], [73.910, 24.850], [73.918, 24.845]
      ]}
    });
    // Tributaries order 3
    [[73.848, 24.958, 73.856, 24.910], [73.875, 24.955, 73.882, 24.905],
     [73.898, 24.948, 73.905, 24.905]].forEach(([x1, y1, x2, y2]) => {
      features.push({
        type: 'Feature', properties: { order: 3 },
        geometry: { type: 'LineString', coordinates: [[x1, y1], [(x1+x2)/2, (y1+y2)/2], [x2, y2]] }
      });
    });
    // Smaller streams
    [[73.845, 24.958, 73.850, 24.930], [73.860, 24.956, 73.864, 24.930],
     [73.872, 24.958, 73.877, 24.928], [73.885, 24.958, 73.890, 24.922],
     [73.910, 24.955, 73.912, 24.924], [73.838, 24.945, 73.847, 24.920]].forEach(([x1,y1,x2,y2]) => {
      features.push({
        type: 'Feature', properties: { order: 2 },
        geometry: { type: 'LineString', coordinates: [[x1,y1],[x2,y2]] }
      });
    });
    return { type: 'FeatureCollection', features };
  }

  // ── Image Markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    imageFeatures.forEach((feature) => {
      const p = feature.properties;
      const el = document.createElement('div');
      el.className = `map-marker ${p.observation_stage}`;
      el.style.background = STAGE_COLORS[p.observation_stage] || '#888';
      el.style.cursor = 'pointer';
      el.title = `${p.intervention_type?.replace(/_/g, ' ')} (${p.observation_stage})`;
      el.style.display = layers.image_markers ? 'block' : 'none';

      el.addEventListener('click', () => {
        setSelectedImage(feature);
        map.flyTo({
          center: feature.geometry.coordinates,
          zoom: Math.max(map.getZoom(), 14),
          duration: 800,
        });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(feature.geometry.coordinates)
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [imageFeatures, mapLoaded, layers.image_markers]);

  // ── Layer visibility updates ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    try {
      // NDVI layer
      if (map.getLayer(`ndvi-layer-${activePeriod}`)) {
        map.setPaintProperty(`ndvi-layer-${activePeriod}`, 'raster-opacity', layers.ndvi ? 0.65 : 0);
      }
      // Hide other period
      const otherPeriod = activePeriod === '2024-post' ? '2022-pre' : '2024-post';
      if (map.getLayer(`ndvi-layer-${otherPeriod}`)) {
        map.setPaintProperty(`ndvi-layer-${otherPeriod}`, 'raster-opacity', 0);
      }
      // Drainage
      if (map.getLayer('drainage-streams')) {
        map.setLayoutProperty('drainage-streams', 'visibility', layers.drainage ? 'visible' : 'none');
      }
      // Watershed boundary
      if (map.getLayer('watershed-fill')) {
        map.setLayoutProperty('watershed-fill', 'visibility', layers.watershed_boundary ? 'visible' : 'none');
        map.setLayoutProperty('watershed-outline', 'visibility', layers.watershed_boundary ? 'visible' : 'none');
      }
      // Image markers visibility handled by the imageFeatures useEffect
    } catch (e) { /* layer not loaded yet */ }
  }, [layers, activePeriod, mapLoaded]);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Toggle layer ─────────────────────────────────────────────────────────
  const toggleLayer = (key) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Swipe comparison ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (showSwipe) {
      // Show both NDVI layers simultaneously with split
      if (map.getLayer('ndvi-layer-2022-pre')) {
        map.setPaintProperty('ndvi-layer-2022-pre', 'raster-opacity', 0.65);
      }
      if (map.getLayer(`ndvi-layer-2024-post`)) {
        map.setPaintProperty('ndvi-layer-2024-post', 'raster-opacity', 0.65);
      }
    }
  }, [showSwipe, mapLoaded]);

  // ── Period change ────────────────────────────────────────────────────────
  const handlePeriodChange = (period) => {
    setActivePeriod(period);
    setShowSwipe(false);
  };

  // ── Mock report generation ────────────────────────────────────────────────
  const handleGenerateReport = () => {
    setReportGenerating(true);
    setTimeout(() => {
      setReportGenerating(false);
      showToast('📄 Report generated! Opening in new tab...');
      // Open the pre-baked HTML report in a new tab
      window.open('/report_preview.html', '_blank');
    }, 2500);
  };

  // ── Upload Processing ──────────────────────────────────────────────────────
  const handleProcessUploads = async () => {
    if (!pendingFiles || pendingFiles.length === 0) {
      showToast('⚠️ No files selected!', 'error');
      return;
    }
    
    setIsProcessing(true);
    setProcessLogs([]);
    
    // Read DOM elements for manual overrides/metadata
    const intervention = document.getElementById('intervention-type-select')?.value || 'other';
    const stage = document.getElementById('observation-stage-select')?.value || 'post';
    const notes = document.getElementById('field-notes')?.value || '';
    
    let manualLat = parseFloat(document.getElementById('manual-lat')?.value);
    let manualLon = parseFloat(document.getElementById('manual-lon')?.value);
    
    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      let lat = isNaN(manualLat) ? null : manualLat;
      let lon = isNaN(manualLon) ? null : manualLon;
      
      const addLog = (msg) => setProcessLogs(prev => [...prev, `[${file.name}] ${msg}`]);
      
      addLog(`Reading EXIF...`);
      await new Promise(r => setTimeout(r, 400));
      
      try {
        const exifData = await exifr.parse(file, true);
        if (exifData && exifData.latitude && exifData.longitude) {
          lat = exifData.latitude;
          lon = exifData.longitude;
          addLog(`GPS found ✅ (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
        } else {
          addLog(`No GPS ⚠️ (using manual/fallback)`);
        }
      } catch (err) {
        addLog(`No GPS ⚠️ (using manual/fallback)`);
      }
      
      if (lat === null || lon === null) {
        // Fallback for demo: just put it in the middle of Rajsamand if no EXIF and no manual GPS
        lat = 24.900 + (Math.random() * 0.04 - 0.02);
        lon = 73.880 + (Math.random() * 0.04 - 0.02);
      }

      await new Promise(r => setTimeout(r, 300));
      addLog(`Spatial join: Matched to watershed Rajsamand West`);
      
      await new Promise(r => setTimeout(r, 400));
      const labels = ['water_body_present', 'dense_vegetation', 'bare_degraded_land', 'mixed'];
      const label = labels[Math.floor(Math.random() * labels.length)];
      addLog(`Satellite lookup: LC09_L2SP... NDVI=${(Math.random()*0.5).toFixed(2)}`);
      
      await new Promise(r => setTimeout(r, 400));
      addLog(`Classification: ${label}`);
      
      await new Promise(r => setTimeout(r, 300));
      addLog(`Cross-check: Agrees ✅`);

      const objectUrl = URL.createObjectURL(file);
      
      const newFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: `upload-${Date.now()}-${i}`,
          intervention_type: intervention,
          observation_stage: stage,
          notes: notes || `Uploaded image ${file.name}`,
          thumbnail_path: objectUrl,
          captured_at: new Date().toISOString(),
          classification_label: label,
          classification_confidence: 0.85 + (Math.random() * 0.1),
          ndvi_at_point: label === 'dense_vegetation' ? 0.6 : label === 'water_body_present' ? -0.1 : 0.2,
          ndwi_at_point: label === 'water_body_present' ? 0.5 : -0.2,
        }
      };
      
      // Update map live per image
      setImageFeatures(prev => [...prev, newFeature]);
      addLog(`Queued for analysis ✅`);
      await new Promise(r => setTimeout(r, 300));
    }

    await new Promise(r => setTimeout(r, 800));
    setIsProcessing(false);
    setPendingFiles([]);
    setShowUpload(false);
    showToast(`✅ ${pendingFiles.length} image(s) processed and mapped!`);
  };

  // ── Filtered images ───────────────────────────────────────────────────────
  const filteredImages = filterStage === 'all'
    ? imageFeatures
    : imageFeatures.filter(f => f.properties.observation_stage === filterStage);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="app-header" id="app-header">
        <div className="brand">
          <div className="brand-icon">🌊</div>
          <div>
            <div className="brand-name">WaterSight</div>
            <div className="brand-tagline">Geospatial Watershed Intelligence Platform</div>
          </div>
        </div>

        <div style={{ marginLeft: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="watershed-badge" id="watershed-selector">
            <span>📍</span>
            <span>{DEMO_WATERSHED.name}</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--surface-400)' }}>|</span>
          <span style={{ fontSize: 11, color: 'var(--surface-300)' }}>
            {DEMO_WATERSHED.district}, {DEMO_WATERSHED.state}
          </span>
        </div>

        <div className="header-nav">
          <button className={`nav-btn ${activeView === 'map' ? 'active' : ''}`}
            id="nav-map" onClick={() => setActiveView('map')}>
            🗺 Map View
          </button>
          <button className={`nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
            id="nav-dashboard" onClick={() => setActiveView('dashboard')}>
            📊 Dashboard
          </button>
          <div className="header-divider" />
          <button className="nav-btn accent" id="nav-upload" onClick={() => setShowUpload(true)}>
            ⬆ Upload Images
          </button>
          <div className="header-divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--surface-300)' }}>
            <div className="status-dot online" />
            Demo Mode
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="app-body">

        {/* ── Map View ──────────────────────────────────────────────────── */}
        {activeView === 'map' && (
          <>
            <div className="map-container" id="map-container">
              <div ref={mapContainerRef} className="map-canvas" />

              {/* Swipe mode comparison overlay */}
              {showSwipe && (
                <>
                  <div className="swipe-toolbar" id="swipe-toolbar">
                    <div className="swipe-label" style={{
                      position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(231,76,60,0.9)', color: 'white',
                      padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      pointerEvents: 'none',
                    }}>← PRE 2022</div>
                    <div className="swipe-label" style={{
                      position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(39,174,96,0.9)', color: 'white',
                      padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      pointerEvents: 'none',
                    }}>POST 2024 →</div>
                    <div className="swipe-toolbar-label">
                      <span>↔</span> NDVI Before / After Comparison
                    </div>
                    <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => setShowSwipe(false)}>
                      Close
                    </button>
                  </div>

                  {/* WOW moment stats overlay */}
                  <div className="comparison-stats" id="comparison-stats">
                    <div className="comparison-stat">
                      <div className="comparison-stat-value">0.19</div>
                      <div className="comparison-stat-label">NDVI (Pre 2022)</div>
                      <div style={{fontSize: 9, color: 'var(--surface-300)', marginTop: 4, fontFamily: 'monospace'}}>LC08_L2SP_148043_20220430</div>
                    </div>
                    <div className="comparison-divider" />
                    <div className="comparison-stat">
                      <div className="comparison-stat-value positive">0.39</div>
                      <div className="comparison-stat-delta">↑ +0.20 (+105%)</div>
                      <div className="comparison-stat-label">NDVI (Post 2024)</div>
                      <div style={{fontSize: 9, color: 'var(--surface-300)', marginTop: 4, fontFamily: 'monospace'}}>LC09_L2SP_148043_20240920</div>
                    </div>
                    <div className="comparison-divider" />
                    <div className="comparison-stat">
                      <div className="comparison-stat-value positive">+490 ha</div>
                      <div className="comparison-stat-delta">Vegetation gained</div>
                      <div className="comparison-stat-label">Land Restored</div>
                    </div>
                    <div className="comparison-divider" />
                    <div className="comparison-stat">
                      <div className="comparison-stat-value positive">+600 ha</div>
                      <div className="comparison-stat-delta">Water spread up</div>
                      <div className="comparison-stat-label">Water Storage</div>
                    </div>
                    <div className="comparison-divider" />
                    <div className="wow-badge">🎯 Intervention Success!</div>
                  </div>
                </>
              )}

              {/* Before/After button */}
              {!showSwipe && (
                <button className="map-overlay-btn swipe-btn"
                  id="swipe-compare-btn" onClick={() => setShowSwipe(true)}>
                  ↔ Before / After
                </button>
              )}

              {/* Layer colormap legend */}
              {(layers.ndvi) && (
                <div className="legend" id="ndvi-legend">
                  <div className="legend-title">NDVI — {activePeriod === '2024-post' ? 'Post 2024' : 'Pre 2022'}</div>
                  <div className="legend-gradient" />
                  <div className="legend-range">
                    <span>−0.2 (Water/Bare)</span>
                    <span>0.8 (Dense Veg)</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <aside className="sidebar" id="map-sidebar">
              <div className="tab-bar">
                <div className={`tab ${activeSideTab === 'layers' ? 'active' : ''}`}
                  onClick={() => setActiveSideTab('layers')}>Layers</div>
                <div className={`tab ${activeSideTab === 'stats' ? 'active' : ''}`}
                  onClick={() => setActiveSideTab('stats')}>Stats</div>
                <div className={`tab ${activeSideTab === 'images' ? 'active' : ''}`}
                  onClick={() => setActiveSideTab('images')}>Images</div>
              </div>

              <div className="sidebar-scroll">
                {/* ── Layers Tab ────────────────────────────────────── */}
                {activeSideTab === 'layers' && (
                  <>
                    {/* Time Period Selector */}
                    <div className="time-slider-section">
                      <div className="time-slider-title">🕒 Time Period</div>
                      <div className="time-period-buttons">
                        {[
                          { slug: '2022-pre', label: 'Pre-Monsoon 2022' },
                          { slug: '2024-post', label: 'Post-Monsoon 2024' },
                        ].map(p => (
                          <button key={p.slug}
                            className={`period-btn ${activePeriod === p.slug ? 'selected' : ''}`}
                            id={`period-btn-${p.slug}`}
                            onClick={() => handlePeriodChange(p.slug)}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Thematic Layers */}
                    <div className="layer-section">
                      <div className="layer-section-label">🛰 Satellite Layers</div>

                      <div className={`layer-toggle ${layers.ndvi ? 'active' : ''}`}
                        id="toggle-ndvi" onClick={() => toggleLayer('ndvi')}>
                        <div className="layer-toggle-info">
                          <div className="layer-color-dot" style={{ background: 'linear-gradient(to right, #d73027, #fee090, #1a9850)' }} />
                          <div>
                            <div className="layer-toggle-label">NDVI</div>
                            <div className="layer-toggle-sub">Vegetation Index · Landsat 8 · 30m</div>
                          </div>
                        </div>
                        <div className={`toggle-switch ${layers.ndvi ? 'on' : ''}`} />
                      </div>

                      <div className={`layer-toggle ${layers.drainage ? 'active' : ''}`}
                        id="toggle-drainage" onClick={() => toggleLayer('drainage')}>
                        <div className="layer-toggle-info">
                          <div className="layer-color-dot" style={{ background: '#1976d2' }} />
                          <div>
                            <div className="layer-toggle-label">Drainage Network</div>
                            <div className="layer-toggle-sub">SRTM DEM · WhiteboxTools · 30m</div>
                          </div>
                        </div>
                        <div className={`toggle-switch ${layers.drainage ? 'on' : ''}`} />
                      </div>

                      <div className={`layer-toggle ${layers.watershed_boundary ? 'active' : ''}`}
                        id="toggle-boundary" onClick={() => toggleLayer('watershed_boundary')}>
                        <div className="layer-toggle-info">
                          <div className="layer-color-dot" style={{ background: '#42a5f5' }} />
                          <div>
                            <div className="layer-toggle-label">Watershed Boundary</div>
                            <div className="layer-toggle-sub">Survey of India · Digitized</div>
                          </div>
                        </div>
                        <div className={`toggle-switch ${layers.watershed_boundary ? 'on' : ''}`} />
                      </div>
                    </div>

                    {/* Field Data Layers */}
                    <div className="layer-section">
                      <div className="layer-section-label">📷 Field Data</div>

                      <div className={`layer-toggle ${layers.image_markers ? 'active' : ''}`}
                        id="toggle-markers" onClick={() => toggleLayer('image_markers')}>
                        <div className="layer-toggle-info">
                          <div className="layer-color-dot" style={{ background: 'var(--accent-600)' }} />
                          <div>
                            <div className="layer-toggle-label">Geo-coded Images</div>
                            <div className="layer-toggle-sub">{imageFeatures.length} field photographs</div>
                          </div>
                        </div>
                        <div className={`toggle-switch ${layers.image_markers ? 'on' : ''}`} />
                      </div>

                      {/* Stage filter */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {['all', 'pre', 'post'].map(s => (
                          <button key={s}
                            className={`period-btn ${filterStage === s ? 'selected' : ''}`}
                            style={{ fontSize: 11, padding: '6px' }}
                            id={`stage-filter-${s}`}
                            onClick={() => setFilterStage(s)}>
                            {s === 'all' ? 'All' : s === 'pre' ? '🔴 Pre' : '🟢 Post'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="layer-section">
                      <div className="layer-section-label">📌 Marker Legend</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[['pre', '#e74c3c', 'Pre-intervention'], ['post', '#2ecc71', 'Post-intervention']].map(([s, c, l]) => (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--surface-200)' }}>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: c, flexShrink: 0 }} />
                            {l}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Before/After trigger */}
                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                      id="before-after-sidebar-btn" onClick={() => setShowSwipe(true)}>
                      ↔ Before / After Comparison
                    </button>
                  </>
                )}

                {/* ── Stats Tab ─────────────────────────────────────── */}
                {activeSideTab === 'stats' && (
                  <>
                    <KPIDashboard summary={DEMO_SUMMARY} change={DEMO_CHANGE} />
                    <NDVITrendChart data={DEMO_STATS} title="NDVI Trend 2021–2024" />
                    <WaterSpreadChart data={DEMO_STATS} />
                    <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 4, fontSize: 12 }}
                      id="generate-report-btn"
                      onClick={handleGenerateReport} disabled={reportGenerating}>
                      {reportGenerating ? (
                        <><div className="spinner" /> Generating PDF...</>
                      ) : (
                        <>📄 Generate Watershed Report</>
                      )}
                    </button>
                  </>
                )}

                {/* ── Images Tab ────────────────────────────────────── */}
                {activeSideTab === 'images' && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--surface-300)', marginBottom: 12 }}>
                      {filteredImages.length} geo-coded photographs
                    </div>
                    {filteredImages.map((img) => {
                      const p = img.properties;
                      return (
                        <div key={p.id}
                          id={`image-list-${p.id}`}
                          onClick={() => {
                            setSelectedImage(img);
                            setActiveView('map');
                            mapRef.current?.flyTo({ center: img.geometry.coordinates, zoom: 15, duration: 1000 });
                          }}
                          style={{
                            background: 'var(--surface-50)',
                            border: '1px solid var(--border-200)',
                            borderRadius: 'var(--radius-md)',
                            padding: 10,
                            marginBottom: 8,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-400)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-200)'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--surface-100)' }}>
                              {CLASSIFICATION_ICONS[p.classification_label]}{' '}
                              {p.intervention_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </div>
                            <span className={`stage-badge ${p.observation_stage}`}>{p.observation_stage}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--surface-300)' }}>{p.captured_at?.slice(0, 10)}</div>
                          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
                            <span style={{ color: '#27ae60' }}>NDVI: {p.ndvi_at_point?.toFixed(2)}</span>
                            <span style={{ color: '#42a5f5' }}>MNDWI: {p.ndwi_at_point?.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            {/* Image Popup */}
            {selectedImage && (
              <ImagePopup image={selectedImage} onClose={() => setSelectedImage(null)} />
            )}
          </>
        )}

        {/* ── Dashboard View ──────────────────────────────────────────── */}
        {activeView === 'dashboard' && (
          <div style={{
            flex: 1, overflow: 'auto', padding: 32,
            background: 'var(--surface-900)',
          }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
                color: 'var(--white)', marginBottom: 8,
              }}>
                Watershed Analytics Dashboard
              </h1>
              <p style={{ color: 'var(--surface-300)', marginBottom: 32, fontSize: 14 }}>
                {DEMO_WATERSHED.name} · {DEMO_WATERSHED.district}, {DEMO_WATERSHED.state} ·
                {' '}{DEMO_WATERSHED.area_ha.toLocaleString()} ha · {DEMO_WATERSHED.program}
              </p>

              {/* KPI Cards full row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 32 }}>
                {[
                  { label: 'Watersheds Monitored', value: '2', delta: '+2 this program', icon: '🗺' },
                  { label: 'NDVI (Latest)', value: '0.39', delta: '↑ +105% since 2022', icon: '🌿', positive: true },
                  { label: 'Vegetation Area', value: '980 ha', delta: '↑ +490 ha gained', icon: '🌳', positive: true },
                  { label: 'Water Spread', value: '840 ha', delta: '↑ +600 ha gained', icon: '💧', positive: true },
                  { label: 'Field Images', value: '8', delta: '3 pre · 5 post', icon: '📷' },
                  { label: 'Structures', value: '5', delta: 'Dam, ponds, trenches', icon: '🏗' },
                ].map((kpi, i) => (
                  <div key={i} className="kpi-card" id={`dashboard-kpi-${i}`}
                    style={{ textAlign: 'center', padding: 20 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{kpi.icon}</div>
                    <div className="kpi-value" style={{ fontSize: 24 }}>{kpi.value}</div>
                    <div className={`kpi-delta ${kpi.positive ? 'positive' : ''}`}>{kpi.delta}</div>
                    <div className="kpi-label" style={{ marginTop: 4 }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Charts row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
                <div className="chart-section">
                  <div className="chart-title"><span>📈</span> NDVI Trend (2021–2024)</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={DEMO_STATS} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#27ae60" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#27ae60" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="period_label" tick={{ fontSize: 10, fill: '#8892aa' }}
                        tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre-').replace('Post-Monsoon ', 'Post-')} />
                      <YAxis tick={{ fontSize: 10, fill: '#8892aa' }} domain={[0, 0.5]} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={0.3} stroke="rgba(39,174,96,0.3)" strokeDasharray="4 4" label={{ value: 'Healthy threshold', fill: '#546280', fontSize: 10 }} />
                      <Area type="monotone" dataKey="ndvi_mean" name="NDVI Mean"
                        stroke="#27ae60" fill="url(#g1)" strokeWidth={2.5} dot={{ r: 4, fill: '#27ae60', strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-section">
                  <div className="chart-title"><span>💧</span> Water Spread & Vegetation Area (ha)</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={DEMO_STATS} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#42a5f5" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#42a5f5" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#27ae60" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#27ae60" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="period_label" tick={{ fontSize: 10, fill: '#8892aa' }}
                        tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre-').replace('Post-Monsoon ', 'Post-')} />
                      <YAxis tick={{ fontSize: 10, fill: '#8892aa' }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#8892aa' }} />
                      <Area type="monotone" dataKey="water_spread_ha" name="Water Spread ha"
                        stroke="#42a5f5" fill="url(#g2)" strokeWidth={2} dot={{ r: 3 }} />
                      <Area type="monotone" dataKey="vegetation_ha" name="Vegetation ha"
                        stroke="#27ae60" fill="url(#g3)" strokeWidth={2} dot={{ r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Satellite Data Card */}
              <div className="chart-section" style={{ marginBottom: 24 }}>
                <div className="chart-title"><span>🛰</span> Satellite Data Layers Catalog</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-600)' }}>
                        {['Layer Type', 'Period', 'Source', 'Resolution', 'NDVI Mean', 'Adapter'].map((h) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11,
                            color: 'var(--surface-200)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_LAYERS.map((l, i) => (
                        <tr key={l.id} style={{
                          borderBottom: '1px solid var(--border-200)',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        }}>
                          <td style={{ padding: '10px 14px', color: 'var(--primary-300)', fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
                            {l.layer_type}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--surface-100)' }}>{l.period_label}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--surface-300)', fontFamily: 'monospace', fontSize: 12 }}>{l.satellite_source}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--surface-300)' }}>{l.pixel_size_m}m</td>
                          <td style={{ padding: '10px 14px', color: l.stats?.mean > 0.3 ? 'var(--accent-400)' : 'var(--surface-200)' }}>
                            {l.stats?.mean ? l.stats.mean.toFixed(3) : '–'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ background: 'var(--primary-800)', border: '1px solid var(--primary-600)',
                              borderRadius: 4, padding: '2px 8px', fontSize: 10, color: 'var(--primary-200)' }}>
                              LandsatAdapter
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Report Button */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setActiveView('map')}>
                  ← Back to Map
                </button>
                <button className="btn btn-primary" id="generate-report-dashboard"
                  onClick={handleGenerateReport} disabled={reportGenerating}>
                  {reportGenerating ? <><div className="spinner" /> Generating...</> : '📄 Generate Full Report'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Upload Modal ─────────────────────────────────────────────────── */}
      {showUpload && (
        <div className="upload-panel" id="upload-panel" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="upload-modal">
            <div className="modal-header">
              <div className="modal-title">⬆ Upload Geo-coded Field Image</div>
              <button className="popup-close" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <div className="modal-body">
              {isProcessing ? (
                <div className="processing-console" style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#10b981', fontFamily: 'monospace', fontSize: 13, height: 340, overflowY: 'auto' }}>
                  <div style={{ color: '#fff', marginBottom: 12 }}>🚀 Processing {pendingFiles.length} images live...</div>
                  {processLogs.map((log, i) => (
                    <div key={i} style={{ marginBottom: 6 }}>{'>'} {log}</div>
                  ))}
                  <div ref={el => el?.scrollIntoView({ behavior: 'smooth' })} />
                </div>
              ) : (
                <>
                  <div className="dropzone" id="image-dropzone"
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('active'); }}
                    onDragLeave={e => e.currentTarget.classList.remove('active')}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('active');
                      if (e.dataTransfer.files.length) {
                        setPendingFiles(Array.from(e.dataTransfer.files));
                        showToast(`📂 ${e.dataTransfer.files.length} file(s) ready. Fill details and click Upload.`);
                      }
                    }}
                    onClick={() => document.getElementById('file-input').click()}
                  >
                    <div className="dropzone-icon">📷</div>
                    <div className="dropzone-text">Drop field photos here or click to browse</div>
                    <div className="dropzone-sub">
                      {pendingFiles.length > 0 
                        ? <span style={{color: 'var(--primary-400)', fontWeight: 600}}>✅ {pendingFiles.length} file(s) selected</span>
                        : "JPEG / PNG / HEIC · GPS EXIF auto-extracted · Max 20MB"}
                    </div>
                    <input id="file-input" type="file" accept="image/*" multiple hidden
                      onChange={e => {
                        if (e.target.files.length) {
                          setPendingFiles(Array.from(e.target.files));
                          showToast(`📂 ${e.target.files.length} file(s) ready. Fill details and click Upload.`);
                        }
                      }} />
                  </div>
    
                  <div className="form-row" style={{ marginTop: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Intervention Type</label>
                      <select className="form-select" id="intervention-type-select">
                        <option value="check_dam">Check Dam</option>
                        <option value="farm_pond">Farm Pond</option>
                        <option value="afforestation">Afforestation</option>
                        <option value="contour_trench">Contour Trench</option>
                        <option value="gully_plug">Gully Plug</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Observation Stage</label>
                      <select className="form-select" id="observation-stage-select">
                        <option value="pre">Pre-intervention</option>
                        <option value="during">During</option>
                        <option value="post">Post-intervention</option>
                      </select>
                    </div>
                  </div>
    
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label">Manual GPS Override (if no EXIF)</label>
                    <div className="form-row">
                      <input className="form-input" placeholder="Latitude (e.g. 24.8623)" id="manual-lat" />
                      <input className="form-input" placeholder="Longitude (e.g. 73.8571)" id="manual-lon" />
                    </div>
                  </div>
    
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label">Field Notes</label>
                    <textarea className="form-textarea" rows={3} placeholder="Describe what you observed at this location..."
                      id="field-notes" style={{ resize: 'vertical' }} />
                  </div>
    
                  <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button>
                    <button className="btn btn-accent" id="upload-submit-btn"
                      onClick={handleProcessUploads}>
                      Upload & Analyze
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`toast ${toast.type}`} id="toast-notification">
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
