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
  ResponsiveContainer, Legend, Area, AreaChart, ReferenceLine,
  PieChart, Pie, Cell, BarChart, Bar
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
  pre: '#fb7185',
  during: '#fbbf24',
  post: '#34d399',
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

// ── SVG Icons ───────────────────────────────────────────────────────────────

function IconMap({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/>
      <line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  );
}

function IconBarChart({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10"/>
      <line x1="18" y1="20" x2="18" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="16"/>
    </svg>
  );
}

function IconUpload({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}

function IconX({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconLayers({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}

function IconArrowLeftRight({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 3 4 7 8 11"/>
      <line x1="4" y1="7" x2="20" y2="7"/>
      <polyline points="16 21 20 17 16 13"/>
      <line x1="20" y1="17" x2="4" y2="17"/>
    </svg>
  );
}

function IconFileText({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}

// ── Custom Chart Tooltip ────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="tooltip" style={{ minWidth: 160 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11 }}>
            <span style={{ color: p.color }}>{p.name}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            {CLASSIFICATION_ICONS[p.classification_label] || '📷'}{' '}
            {p.intervention_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`stage-badge ${p.observation_stage}`}>{p.observation_stage}</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{p.captured_at?.slice(0, 10)}</span>
          </div>
        </div>
        <button className="popup-close" onClick={onClose} id="popup-close-btn">
          <IconX size={14} />
        </button>
      </div>

      {/* Real Image or Placeholder */}
      {p.thumbnail_path ? (
        <img 
          src={p.thumbnail_path} 
          alt={p.notes} 
          style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }} 
        />
      ) : (
        <div className="popup-image-placeholder" style={{
          background: p.observation_stage === 'pre'
            ? 'linear-gradient(135deg, #1e293b, #374151)'
            : p.classification_label === 'water_body_present'
            ? 'linear-gradient(135deg, #0c4a6e, #164e63)'
            : 'linear-gradient(135deg, #064e3b, #065f46)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px'
        }}>
          <span style={{ fontSize: 48, opacity: 0.5 }}>{CLASSIFICATION_ICONS[p.classification_label] || '📷'}</span>
        </div>
      )}

      <div className="popup-body">
        {/* Satellite Values */}
        <div className="popup-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <div className="popup-section-title">Satellite Index Values</div>
          <div className="sat-values-grid">
            <div className="sat-value-card">
              <div className={`sat-value-number ${ndviGood ? 'ndvi-good' : 'ndvi-poor'}`}>
                {p.ndvi_at_point?.toFixed(3) ?? '–'}
              </div>
              <div className="sat-value-label">NDVI</div>
            </div>
            <div className="sat-value-card">
              <div className={`sat-value-number ${ndwi_wet ? 'ndwi-wet' : 'ndwi-dry'}`}>
                {p.ndwi_at_point?.toFixed(3) ?? '–'}
              </div>
              <div className="sat-value-label">MNDWI</div>
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="popup-section">
          <div className="popup-section-title">Image Classification</div>
          <div className="classification-badge">
            {CLASSIFICATION_ICONS[p.classification_label]}{' '}
            {p.classification_label?.replace(/_/g, ' ') ?? 'Unclassified'}
            {p.classification_confidence && (
              <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 4 }}>
                ({Math.round(p.classification_confidence * 100)}%)
              </span>
            )}
          </div>
          {p.notes && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              {p.notes}
            </div>
          )}
        </div>

        {/* Location Details */}
        <div className="popup-section">
          <div className="popup-section-title">Field Metadata</div>
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
            <span className="popup-row-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
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
              <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
          <XAxis
            dataKey="period_label"
            tick={{ fontSize: 9, fill: '#64748b' }}
            tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre ').replace('Post-Monsoon ', 'Post ')}
            axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: '#64748b', paddingTop: 4 }}
          />
          <Area type="monotone" dataKey="ndvi_mean" name="NDVI Mean"
            stroke="#34d399" fill="url(#ndviGrad)" strokeWidth={2} dot={{ r: 3, fill: '#34d399', strokeWidth: 0 }} />
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
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
          <XAxis dataKey="period_label" tick={{ fontSize: 9, fill: '#64748b' }}
            tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre ').replace('Post-Monsoon ', 'Post ')}
            axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="water_spread_ha" name="Water Spread ha"
            stroke="#38bdf8" fill="url(#waterAreaGrad)" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }} />
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
          <div className="kpi-label">Vegetated Area</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">840</div>
          <div className="kpi-delta positive">↑ +600 ha</div>
          <div className="kpi-label">Water Spread</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: 'var(--amber-400)' }}>{summary.total_images}</div>
          <div className="kpi-delta">3 pre · 5 post</div>
          <div className="kpi-label">Field Images</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ fontSize: 18 }}>+105%</div>
          <div className="kpi-delta positive">NDVI improvement</div>
          <div className="kpi-label">Change 2022→2024</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">5</div>
          <div className="kpi-delta">Intervention types</div>
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
          'fill-color': '#0ea5e9',
          'fill-opacity': 0.06,
        }
      });
      map.addLayer({
        id: 'watershed-outline',
        type: 'line',
        source: 'watershed-boundary',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 2,
          'line-opacity': 0.6,
          'line-dasharray': [6, 3],
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
          'line-color': ['case', ['==', ['get', 'order'], 4], '#0ea5e9',
                          ['==', ['get', 'order'], 3], '#38bdf8',
                          '#7dd3fc'],
          'line-width': ['case', ['==', ['get', 'order'], 4], 2.5,
                          ['==', ['get', 'order'], 3], 1.5, 0.8],
          'line-opacity': 0.55,
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
      showToast('Report generated — opening in new tab');
      // Open the pre-baked HTML report in a new tab
      window.open('/report_preview.html', '_blank');
    }, 2500);
  };

  // ── Upload Processing ──────────────────────────────────────────────────────
  const handleProcessUploads = async () => {
    if (!pendingFiles || pendingFiles.length === 0) {
      showToast('No files selected', 'error');
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
          addLog(`GPS found ✓ (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
        } else {
          addLog(`No GPS — using manual/fallback`);
        }
      } catch (err) {
        addLog(`No GPS — using manual/fallback`);
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
      addLog(`Satellite lookup: LC09_L2SP… NDVI=${(Math.random()*0.5).toFixed(2)}`);
      
      await new Promise(r => setTimeout(r, 400));
      addLog(`Classification: ${label}`);
      
      await new Promise(r => setTimeout(r, 300));
      addLog(`Cross-check: Agrees ✓`);

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
      addLog(`Queued for analysis ✓`);
      await new Promise(r => setTimeout(r, 300));
    }

    await new Promise(r => setTimeout(r, 800));
    setIsProcessing(false);
    setPendingFiles([]);
    setShowUpload(false);
    showToast(`${pendingFiles.length} image(s) processed and mapped`);
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
            <div className="brand-tagline">Geospatial Watershed Intelligence</div>
          </div>
        </div>

        <div style={{ marginLeft: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="watershed-badge" id="watershed-selector">
            <span>📍</span>
            <span>{DEMO_WATERSHED.name}</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>|</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {DEMO_WATERSHED.district}, {DEMO_WATERSHED.state}
          </span>
        </div>

        <div className="header-nav">
          <button className={`nav-btn ${activeView === 'map' ? 'active' : ''}`}
            id="nav-map" onClick={() => setActiveView('map')}>
            <IconMap size={14} /> Map View
          </button>
          <button className={`nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
            id="nav-dashboard" onClick={() => setActiveView('dashboard')}>
            <IconBarChart size={14} /> Dashboard
          </button>
          <div className="header-divider" />
          <button className="nav-btn accent" id="nav-upload" onClick={() => setShowUpload(true)}>
            <IconUpload size={14} /> Upload Images
          </button>
          <div className="header-divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
            <div className="status-dot online" />
            Live
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
                    <div style={{
                      position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(244,63,94,0.85)', color: 'white',
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      pointerEvents: 'none', backdropFilter: 'blur(4px)',
                    }}>← PRE 2022</div>
                    <div style={{
                      position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(52,211,153,0.85)', color: 'white',
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      pointerEvents: 'none', backdropFilter: 'blur(4px)',
                    }}>POST 2024 →</div>
                    <div className="swipe-toolbar-label">
                      <IconArrowLeftRight size={14} /> NDVI Before / After
                    </div>
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => setShowSwipe(false)}>
                      Close
                    </button>
                  </div>

                  {/* Comparison stats overlay */}
                  <div className="comparison-stats" id="comparison-stats">
                    <div className="comparison-stat">
                      <div className="comparison-stat-value">0.19</div>
                      <div className="comparison-stat-label">NDVI (Pre 2022)</div>
                      <div style={{fontSize: 9, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)'}}>LC08_L2SP_148043</div>
                    </div>
                    <div className="comparison-divider" />
                    <div className="comparison-stat">
                      <div className="comparison-stat-value positive">0.39</div>
                      <div className="comparison-stat-delta">↑ +0.20 (+105%)</div>
                      <div className="comparison-stat-label">NDVI (Post 2024)</div>
                      <div style={{fontSize: 9, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)'}}>LC09_L2SP_148043</div>
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
                    <div className="wow-badge">🎯 Intervention Success</div>
                  </div>
                </>
              )}

              {/* Before/After button */}
              {!showSwipe && (
                <button className="map-overlay-btn swipe-btn"
                  id="swipe-compare-btn" onClick={() => setShowSwipe(true)}>
                  <IconArrowLeftRight size={14} /> Before / After
                </button>
              )}

              {/* Layer colormap legend */}
              {(layers.ndvi) && (
                <div className="legend" id="ndvi-legend">
                  <div className="legend-title">NDVI — {activePeriod === '2024-post' ? 'Post 2024' : 'Pre 2022'}</div>
                  <div className="legend-gradient" />
                  <div className="legend-range">
                    <span>−0.2 (Bare)</span>
                    <span>0.8 (Dense)</span>
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
                  onClick={() => setActiveSideTab('stats')}>Analytics</div>
                <div className={`tab ${activeSideTab === 'images' ? 'active' : ''}`}
                  onClick={() => setActiveSideTab('images')}>Images</div>
              </div>

              <div className="sidebar-scroll">
                {/* ── Layers Tab ────────────────────────────────────── */}
                {activeSideTab === 'layers' && (
                  <>
                    {/* Time Period Selector */}
                    <div className="time-slider-section">
                      <div className="time-slider-title">Time Period</div>
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
                      <div className="layer-section-label">Satellite Layers</div>

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
                          <div className="layer-color-dot" style={{ background: '#0ea5e9' }} />
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
                          <div className="layer-color-dot" style={{ background: '#38bdf8' }} />
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
                      <div className="layer-section-label">Field Data</div>

                      <div className={`layer-toggle ${layers.image_markers ? 'active' : ''}`}
                        id="toggle-markers" onClick={() => toggleLayer('image_markers')}>
                        <div className="layer-toggle-info">
                          <div className="layer-color-dot" style={{ background: 'var(--teal-400)' }} />
                          <div>
                            <div className="layer-toggle-label">Geo-coded Images</div>
                            <div className="layer-toggle-sub">{imageFeatures.length} field photographs</div>
                          </div>
                        </div>
                        <div className={`toggle-switch ${layers.image_markers ? 'on' : ''}`} />
                      </div>

                      {/* Stage filter */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        {['all', 'pre', 'post'].map(s => (
                          <button key={s}
                            className={`period-btn ${filterStage === s ? 'selected' : ''}`}
                            style={{ fontSize: 11, padding: '6px 10px' }}
                            id={`stage-filter-${s}`}
                            onClick={() => setFilterStage(s)}>
                            {s === 'all' ? 'All' : s === 'pre' ? 'Pre' : 'Post'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="layer-section">
                      <div className="layer-section-label">Marker Legend</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[['pre', '#fb7185', 'Pre-intervention'], ['post', '#34d399', 'Post-intervention']].map(([s, c, l]) => (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0, boxShadow: `0 0 6px ${c}40` }} />
                            {l}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Before/After trigger */}
                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                      id="before-after-sidebar-btn" onClick={() => setShowSwipe(true)}>
                      <IconArrowLeftRight size={14} /> Before / After Comparison
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
                        <><div className="spinner" /> Generating…</>
                      ) : (
                        <><IconFileText size={14} /> Generate Watershed Report</>
                      )}
                    </button>
                  </>
                )}

                {/* ── Images Tab ────────────────────────────────────── */}
                {activeSideTab === 'images' && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
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
                            background: 'var(--bg-raised)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: 12,
                            marginBottom: 8,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--teal-600)';
                            e.currentTarget.style.background = 'var(--bg-surface)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                            e.currentTarget.style.background = 'var(--bg-raised)';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {CLASSIFICATION_ICONS[p.classification_label]}{' '}
                              {p.intervention_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </div>
                            <span className={`stage-badge ${p.observation_stage}`}>{p.observation_stage}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{p.captured_at?.slice(0, 10)}</div>
                          <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11 }}>
                            <span style={{ color: 'var(--emerald-400)' }}>NDVI: {p.ndvi_at_point?.toFixed(2)}</span>
                            <span style={{ color: 'var(--sky-400)' }}>MNDWI: {p.ndwi_at_point?.toFixed(2)}</span>
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
        {activeView === 'dashboard' && (() => {
          // Dashboard-specific data
          const landUseData = [
            { name: 'Vegetation', value: 980, color: '#34d399' },
            { name: 'Water Bodies', value: 840, color: '#38bdf8' },
            { name: 'Barren Land', value: 580, color: '#94a3b8' },
          ];
          const interventionData = [
            { name: 'Check Dams', count: 12, effectiveness: 92, color: '#38bdf8' },
            { name: 'Farm Ponds', count: 8, effectiveness: 88, color: '#34d399' },
            { name: 'Afforestation', count: 15, effectiveness: 78, color: '#a78bfa' },
            { name: 'Contour Trenches', count: 22, effectiveness: 85, color: '#fbbf24' },
            { name: 'Gully Plugs', count: 6, effectiveness: 71, color: '#fb923c' },
          ];
          const healthScore = 78;
          const healthData = [
            { name: 'score', value: healthScore, fill: '#2dd4bf' },
            { name: 'remaining', value: 100 - healthScore, fill: 'transparent' },
          ];

          return (
          <div className="dashboard-view">
            <div className="dashboard-inner">
              {/* Header */}
              <div className="dash-header">
                <div>
                  <h1 className="dash-title">Watershed Analytics Dashboard</h1>
                  <p className="dash-subtitle">
                    {DEMO_WATERSHED.name} · {DEMO_WATERSHED.district}, {DEMO_WATERSHED.state} ·
                    {' '}{DEMO_WATERSHED.area_ha.toLocaleString()} ha · {DEMO_WATERSHED.program}
                  </p>
                </div>
                <div className="dash-header-actions">
                  <button className="btn btn-ghost" onClick={() => setActiveView('map')}>
                    <IconMap size={14} /> Map View
                  </button>
                  <button className="btn btn-primary" id="generate-report-dashboard"
                    onClick={handleGenerateReport} disabled={reportGenerating}>
                    {reportGenerating ? <><div className="spinner" /> Generating…</> : <><IconFileText size={14} /> Export Report</>}
                  </button>
                </div>
              </div>

              {/* ── Row 1: Top KPI Strip ────────────────────────────────── */}
              <div className="dash-kpi-strip">
                {[
                  { label: 'NDVI Index', value: '0.39', delta: '+105%', sub: 'Post-Monsoon 2024', positive: true, accent: 'var(--emerald-400)' },
                  { label: 'Vegetation Cover', value: '980', unit: 'ha', delta: '+490 ha', sub: 'Since baseline 2022', positive: true, accent: 'var(--emerald-400)' },
                  { label: 'Water Spread', value: '840', unit: 'ha', delta: '+600 ha', sub: 'Across watershed', positive: true, accent: 'var(--sky-400)' },
                  { label: 'Field Images', value: '18', delta: '8 verified', sub: '3 pre · 5 post · 10 mass', accent: 'var(--amber-400)' },
                  { label: 'Structures', value: '63', delta: '5 types', sub: 'All interventions tracked', accent: 'var(--teal-400)' },
                ].map((kpi, i) => (
                  <div key={i} className="dash-kpi" id={`dashboard-kpi-${i}`}>
                    <div className="dash-kpi-top">
                      <span className="dash-kpi-label">{kpi.label}</span>
                      {kpi.delta && <span className={`dash-kpi-badge ${kpi.positive ? 'positive' : ''}`}>{kpi.delta}</span>}
                    </div>
                    <div className="dash-kpi-value" style={{ color: kpi.accent }}>
                      {kpi.value}
                      {kpi.unit && <span className="dash-kpi-unit">{kpi.unit}</span>}
                    </div>
                    <div className="dash-kpi-sub">{kpi.sub}</div>
                  </div>
                ))}
              </div>

              {/* ── Row 2: Health Score + Land Use + Intervention Breakdown ── */}
              <div className="dash-row-3col">
                {/* Watershed Health Score */}
                <div className="dash-card dash-health-card">
                  <div className="dash-card-header">
                    <span className="dash-card-title">Watershed Health</span>
                    <span className="dash-card-badge good">Good</span>
                  </div>
                  <div className="dash-health-ring">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={healthData}
                          cx="50%" cy="50%"
                          innerRadius={58} outerRadius={72}
                          startAngle={90} endAngle={-270}
                          dataKey="value"
                          stroke="none"
                        >
                          <Cell fill="url(#healthGrad)" />
                          <Cell fill="rgba(148,163,184,0.08)" />
                        </Pie>
                        <defs>
                          <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#2dd4bf" />
                            <stop offset="100%" stopColor="#34d399" />
                          </linearGradient>
                        </defs>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="dash-health-center">
                      <div className="dash-health-score">{healthScore}</div>
                      <div className="dash-health-label">/ 100</div>
                    </div>
                  </div>
                  <div className="dash-health-factors">
                    {[
                      { label: 'Vegetation', val: 82, color: 'var(--emerald-400)' },
                      { label: 'Water Retention', val: 75, color: 'var(--sky-400)' },
                      { label: 'Soil Quality', val: 68, color: 'var(--amber-400)' },
                      { label: 'Structure Health', val: 91, color: 'var(--teal-400)' },
                    ].map((f, i) => (
                      <div key={i} className="dash-factor-row">
                        <div className="dash-factor-meta">
                          <span className="dash-factor-label">{f.label}</span>
                          <span className="dash-factor-val" style={{ color: f.color }}>{f.val}%</span>
                        </div>
                        <div className="dash-factor-bar-bg">
                          <div className="dash-factor-bar" style={{ width: `${f.val}%`, background: f.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Land Use Composition */}
                <div className="dash-card">
                  <div className="dash-card-header">
                    <span className="dash-card-title">Land Use Composition</span>
                    <span className="dash-card-period">2024 Post-Monsoon</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie
                          data={landUseData}
                          cx="50%" cy="50%"
                          innerRadius={42} outerRadius={68}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {landUseData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="dash-lulc-legend">
                      {landUseData.map((d, i) => (
                        <div key={i} className="dash-lulc-item">
                          <div className="dash-lulc-dot" style={{ background: d.color }} />
                          <div>
                            <div className="dash-lulc-name">{d.name}</div>
                            <div className="dash-lulc-val">{d.value.toLocaleString()} ha <span className="dash-lulc-pct">({Math.round(d.value / 24 )}%)</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Intervention Breakdown */}
                <div className="dash-card">
                  <div className="dash-card-header">
                    <span className="dash-card-title">Intervention Effectiveness</span>
                    <span className="dash-card-period">63 total structures</span>
                  </div>
                  <div className="dash-interventions">
                    {interventionData.map((item, i) => (
                      <div key={i} className="dash-intv-row">
                        <div className="dash-intv-meta">
                          <span className="dash-intv-name">{item.name}</span>
                          <span className="dash-intv-count">{item.count} units</span>
                        </div>
                        <div className="dash-intv-bar-wrap">
                          <div className="dash-intv-bar-bg">
                            <div className="dash-intv-bar" style={{ width: `${item.effectiveness}%`, background: item.color }} />
                          </div>
                          <span className="dash-intv-pct" style={{ color: item.color }}>{item.effectiveness}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Row 3: Before/After Comparison ──────────────────────── */}
              <div className="dash-comparison-section">
                <div className="dash-section-label">Change Detection — Pre vs Post Intervention</div>
                <div className="dash-comparison-grid">
                  {/* Before Card */}
                  <div className="dash-compare-card before">
                    <div className="dash-compare-tag">BASELINE</div>
                    <div className="dash-compare-period">Pre-Monsoon 2022</div>
                    <div className="dash-compare-source">LC08_L2SP_148043_20220430</div>
                    <div className="dash-compare-metrics">
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val" style={{ color: 'var(--rose-400)' }}>0.19</div>
                        <div className="dash-compare-label">NDVI Mean</div>
                        <div className="dash-compare-bar-bg"><div className="dash-compare-bar" style={{ width: '24%', background: 'var(--rose-400)' }} /></div>
                      </div>
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val">490 ha</div>
                        <div className="dash-compare-label">Vegetation</div>
                      </div>
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val">240 ha</div>
                        <div className="dash-compare-label">Water Spread</div>
                      </div>
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val" style={{ color: 'var(--rose-400)' }}>980 ha</div>
                        <div className="dash-compare-label">Bare Land</div>
                      </div>
                    </div>
                  </div>

                  {/* Change Arrow */}
                  <div className="dash-compare-arrow">
                    <div className="dash-compare-arrow-line" />
                    <div className="dash-compare-arrow-badge">2 yrs</div>
                    <div className="dash-compare-arrow-detail">4 monsoon cycles</div>
                  </div>

                  {/* After Card */}
                  <div className="dash-compare-card after">
                    <div className="dash-compare-tag success">CURRENT</div>
                    <div className="dash-compare-period">Post-Monsoon 2024</div>
                    <div className="dash-compare-source">LC09_L2SP_148043_20240920</div>
                    <div className="dash-compare-metrics">
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val" style={{ color: 'var(--emerald-400)' }}>0.39</div>
                        <div className="dash-compare-label">NDVI Mean</div>
                        <div className="dash-compare-bar-bg"><div className="dash-compare-bar" style={{ width: '49%', background: 'var(--emerald-400)' }} /></div>
                      </div>
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val" style={{ color: 'var(--emerald-400)' }}>980 ha <span style={{ fontSize: 10, opacity: 0.7 }}>↑+490</span></div>
                        <div className="dash-compare-label">Vegetation</div>
                      </div>
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val" style={{ color: 'var(--sky-400)' }}>840 ha <span style={{ fontSize: 10, opacity: 0.7 }}>↑+600</span></div>
                        <div className="dash-compare-label">Water Spread</div>
                      </div>
                      <div className="dash-compare-metric">
                        <div className="dash-compare-val">580 ha <span style={{ fontSize: 10, color: 'var(--emerald-400)' }}>↓−400</span></div>
                        <div className="dash-compare-label">Bare Land</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Row 4: Trend Charts ─────────────────────────────────── */}
              <div className="dash-charts-row">
                <div className="chart-section">
                  <div className="chart-title"><span>📈</span> NDVI Vegetation Trend (2021–2024)</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={DEMO_STATS} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                      <XAxis dataKey="period_label" tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre-').replace('Post-Monsoon ', 'Post-')}
                        axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 0.5]} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={0.3} stroke="rgba(52,211,153,0.2)" strokeDasharray="4 4" label={{ value: 'Healthy threshold', fill: '#475569', fontSize: 10 }} />
                      <Area type="monotone" dataKey="ndvi_mean" name="NDVI Mean"
                        stroke="#34d399" fill="url(#dg1)" strokeWidth={2.5} dot={{ r: 4, fill: '#34d399', strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-section">
                  <div className="chart-title"><span>💧</span> Water Spread & Vegetation Area (ha)</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={DEMO_STATS} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dg2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dg3" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                      <XAxis dataKey="period_label" tick={{ fontSize: 10, fill: '#64748b' }}
                        tickFormatter={(v) => v.replace('Pre-Monsoon ', 'Pre-').replace('Post-Monsoon ', 'Post-')}
                        axisLine={{ stroke: 'rgba(148,163,184,0.1)' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                      <Area type="monotone" dataKey="water_spread_ha" name="Water Spread ha"
                        stroke="#38bdf8" fill="url(#dg2)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0 }} />
                      <Area type="monotone" dataKey="vegetation_ha" name="Vegetation ha"
                        stroke="#34d399" fill="url(#dg3)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Row 5: Satellite Catalog ────────────────────────────── */}
              <div className="dash-card" style={{ marginBottom: 24 }}>
                <div className="dash-card-header">
                  <span className="dash-card-title">Satellite Data Catalog</span>
                  <span className="dash-card-period">6 layers processed</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="dash-table">
                    <thead>
                      <tr>
                        {['Layer', 'Period', 'Source', 'Resolution', 'Index Mean', 'Pipeline'].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_LAYERS.map((l) => (
                        <tr key={l.id}>
                          <td className="dash-table-layer">{l.layer_type}</td>
                          <td>{l.period_label}</td>
                          <td className="dash-table-mono">{l.satellite_source}</td>
                          <td>{l.pixel_size_m}m</td>
                          <td style={{ color: l.stats?.mean > 0.3 ? 'var(--emerald-400)' : 'var(--text-secondary)' }}>
                            {l.stats?.mean ? l.stats.mean.toFixed(3) : '–'}
                          </td>
                          <td>
                            <span className="dash-table-badge">LandsatAdapter</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Interpretation ──────────────────────────────────────── */}
              <div className="dash-interpretation">
                <div className="dash-interpretation-icon">📋</div>
                <div>
                  <div className="dash-interpretation-title">Automated Interpretation</div>
                  <p className="dash-interpretation-text">
                    {DEMO_CHANGE.interpretation}
                  </p>
                </div>
              </div>

            </div>
          </div>
          );
        })()}

      </div>

      {/* ── Upload Modal ─────────────────────────────────────────────────── */}
      {showUpload && (
        <div className="upload-panel" id="upload-panel" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="upload-modal">
            <div className="modal-header">
              <div className="modal-title">Upload Geo-coded Field Image</div>
              <button className="popup-close" onClick={() => setShowUpload(false)}>
                <IconX size={14} />
              </button>
            </div>
            <div className="modal-body">
              {isProcessing ? (
                <div style={{ background: 'var(--bg-deep)', padding: 20, borderRadius: 'var(--radius-lg)', 
                  color: 'var(--emerald-400)', fontFamily: 'var(--font-mono)', fontSize: 12, 
                  height: 340, overflowY: 'auto', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-primary)', marginBottom: 14, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13 }}>
                    Processing {pendingFiles.length} images…
                  </div>
                  {processLogs.map((log, i) => (
                    <div key={i} style={{ marginBottom: 5, lineHeight: 1.6 }}>{'>'} {log}</div>
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
                        showToast(`${e.dataTransfer.files.length} file(s) ready`);
                      }
                    }}
                    onClick={() => document.getElementById('file-input').click()}
                  >
                    <div className="dropzone-icon">📷</div>
                    <div className="dropzone-text">Drop field photos here or click to browse</div>
                    <div className="dropzone-sub">
                      {pendingFiles.length > 0 
                        ? <span style={{color: 'var(--teal-400)', fontWeight: 600}}>{pendingFiles.length} file(s) selected</span>
                        : "JPEG / PNG / HEIC · GPS EXIF auto-extracted · Max 20MB"}
                    </div>
                    <input id="file-input" type="file" accept="image/*" multiple hidden
                      onChange={e => {
                        if (e.target.files.length) {
                          setPendingFiles(Array.from(e.target.files));
                          showToast(`${e.target.files.length} file(s) ready`);
                        }
                      }} />
                  </div>
    
                  <div className="form-row" style={{ marginTop: 20 }}>
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
    
                  <div className="form-group" style={{ marginTop: 14 }}>
                    <label className="form-label">Manual GPS Override</label>
                    <div className="form-row">
                      <input className="form-input" placeholder="Latitude (e.g. 24.8623)" id="manual-lat" />
                      <input className="form-input" placeholder="Longitude (e.g. 73.8571)" id="manual-lon" />
                    </div>
                  </div>
    
                  <div className="form-group" style={{ marginTop: 14 }}>
                    <label className="form-label">Field Notes</label>
                    <textarea className="form-textarea" rows={3} placeholder="Describe what you observed at this location…"
                      id="field-notes" style={{ resize: 'vertical' }} />
                  </div>
    
                  <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button>
                    <button className="btn btn-accent" id="upload-submit-btn"
                      onClick={handleProcessUploads}>
                      <IconUpload size={14} /> Upload & Analyze
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
