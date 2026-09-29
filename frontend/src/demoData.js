/**
 * WaterSight — Demo Data Store
 * Pre-computed demo data for instant display without API dependency.
 * Matches seed_data.sql exactly — used when backend is unavailable or for offline demo.
 */

export const DEMO_WATERSHED = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Rajsamand Watershed (West)',
  local_name: 'राजसमंद जलग्रहण क्षेत्र (पश्चिम)',
  state: 'Rajasthan',
  district: 'Rajsamand',
  area_ha: 2387.5,
  program: 'PMKSY-IWMP',
  elevation_min_m: 310,
  elevation_max_m: 580,
  centroid: { type: 'Point', coordinates: [73.880, 24.900] },
  boundary: {
    type: 'MultiPolygon',
    coordinates: [[[[73.840, 24.840], [73.920, 24.840], [73.925, 24.900],
      [73.920, 24.960], [73.860, 24.960], [73.840, 24.920], [73.835, 24.870], [73.840, 24.840]]]]
  },
  sub_watersheds: [
    { id: 'aaaa0001-0000-0000-0000-000000000001', name: 'Kanthariya Nala', code: 'WRJ-01-A', area_ha: 830, centroid: { type: 'Point', coordinates: [73.862, 24.880] } },
    { id: 'aaaa0002-0000-0000-0000-000000000002', name: 'Railmagra Upper', code: 'WRJ-01-B', area_ha: 920, centroid: { type: 'Point', coordinates: [73.903, 24.880] } },
    { id: 'aaaa0003-0000-0000-0000-000000000003', name: 'Bamba Nala', code: 'WRJ-01-C', area_ha: 637.5, centroid: { type: 'Point', coordinates: [73.880, 24.940] } },
  ],
};

export const DEMO_IMAGES_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.857, 24.862] },
      properties: {
        id: 'img00001-0000-0000-0000-000000000001',
        intervention_type: 'check_dam', observation_stage: 'pre',
        captured_at: '2022-05-15', classification_label: 'bare_degraded_land',
        classification_confidence: 0.87, ndvi_at_point: 0.08, ndwi_at_point: -0.42,
        lulc_class_at_point: 'Barren/Rocky',
        notes: 'Dry nala bed — planned check dam site. Severe soil erosion.',
        thumbnail_path: '/images/img_check_dam_pre.jpg',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.858, 24.863] },
      properties: {
        id: 'img00002-0000-0000-0000-000000000002',
        intervention_type: 'check_dam', observation_stage: 'post',
        captured_at: '2024-09-20', classification_label: 'water_body_present',
        classification_confidence: 0.93, ndvi_at_point: 0.51, ndwi_at_point: 0.18,
        lulc_class_at_point: 'Water/Wetland',
        notes: 'Check dam complete. Water impounded. Vegetation recovering.',
        thumbnail_path: '/images/img_check_dam_post.jpg',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.901, 24.872] },
      properties: {
        id: 'img00003-0000-0000-0000-000000000003',
        intervention_type: 'farm_pond', observation_stage: 'pre',
        captured_at: '2022-06-02', classification_label: 'bare_degraded_land',
        classification_confidence: 0.79, ndvi_at_point: 0.12, ndwi_at_point: -0.38,
        lulc_class_at_point: 'Agricultural (Dry)',
        notes: 'Dry agricultural field. Cracked soil. Proposed farm pond.',
        thumbnail_path: '/images/img_farm_pond_pre.jpg',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.902, 24.873] },
      properties: {
        id: 'img00004-0000-0000-0000-000000000004',
        intervention_type: 'farm_pond', observation_stage: 'post',
        captured_at: '2024-08-30', classification_label: 'water_body_present',
        classification_confidence: 0.96, ndvi_at_point: 0.38, ndwi_at_point: 0.45,
        lulc_class_at_point: 'Water/Wetland',
        notes: 'Farm pond filled. 0.3 ha water spread. Green buffer established.',
        thumbnail_path: '/images/img_farm_pond_post.jpg',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.868, 24.935] },
      properties: {
        id: 'img00005-0000-0000-0000-000000000005',
        intervention_type: 'afforestation', observation_stage: 'pre',
        captured_at: '2022-05-28', classification_label: 'bare_degraded_land',
        classification_confidence: 0.91, ndvi_at_point: 0.06, ndwi_at_point: -0.51,
        lulc_class_at_point: 'Scrubland/Degraded',
        notes: 'Degraded hillslope. Sheet erosion visible. Afforestation proposed.',
        thumbnail_path: '/images/img_afforestation_pre.jpg',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.868, 24.936] },
      properties: {
        id: 'img00006-0000-0000-0000-000000000006',
        intervention_type: 'afforestation', observation_stage: 'post',
        captured_at: '2024-09-05', classification_label: 'dense_vegetation',
        classification_confidence: 0.88, ndvi_at_point: 0.62, ndwi_at_point: -0.08,
        lulc_class_at_point: 'Vegetation/Forest',
        notes: 'Young neem/khejri trees 2-3m tall. Ground cover established.',
        thumbnail_path: '/images/img_afforestation_post.jpg',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.851, 24.875] },
      properties: {
        id: 'img00007-0000-0000-0000-000000000007',
        intervention_type: 'contour_trench', observation_stage: 'post',
        captured_at: '2024-09-12', classification_label: 'structure_intact',
        classification_confidence: 0.84, ndvi_at_point: 0.34, ndwi_at_point: -0.12,
        lulc_class_at_point: 'Agricultural',
        notes: 'Contour trenches visible. Moisture retained post-monsoon.',
        thumbnail_path: '/images/img_contour_trench_post.jpg',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [73.912, 24.888] },
      properties: {
        id: 'img00008-0000-0000-0000-000000000008',
        intervention_type: 'gully_plug', observation_stage: 'post',
        captured_at: '2024-09-18', classification_label: 'structure_intact',
        classification_confidence: 0.79, ndvi_at_point: 0.28, ndwi_at_point: -0.05,
        lulc_class_at_point: 'Agricultural',
        notes: 'Stone gully plug. Sediment trapped. Erosion arrested.',
        thumbnail_path: '/images/img_gully_plug_post.jpg',
      }
    }
  ]
};

// ── Bhuvan Mass Data Simulator ──────────────────────────────────────────────
const generateBhuvanMassData = () => {
  const extraFeatures = [];
  const interventions = ['check_dam', 'farm_pond', 'contour_trench', 'gully_plug', 'afforestation'];
  const stages = ['pre', 'during', 'post'];
  
  const thumbnails = [
    '/images/img_check_dam_post.jpg',
    '/images/img_farm_pond_post.jpg',
    '/images/img_afforestation_post.jpg',
    '/images/img_contour_trench_post.jpg'
  ];

  for(let i=0; i<10; i++) {
    // Generate around Rajsamand
    const lat = 24.840 + Math.random() * 0.12; 
    const lon = 73.835 + Math.random() * 0.12; 
    
    const intervention = interventions[Math.floor(Math.random() * interventions.length)];
    const stage = stages[Math.floor(Math.random() * stages.length)];
    const thumb = thumbnails[Math.floor(Math.random() * thumbnails.length)];
    
    extraFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        id: `bhuvan-mass-${i}`,
        intervention_type: intervention,
        observation_stage: stage,
        captured_at: `2024-0${Math.floor(Math.random()*8)+1}-15`,
        classification_label: 'structure_intact',
        classification_confidence: 0.8 + Math.random()*0.15,
        ndvi_at_point: 0.1 + Math.random()*0.4,
        ndwi_at_point: -0.2 + Math.random()*0.4,
        lulc_class_at_point: 'Agricultural',
        notes: `Mass data point mapped from Bhuvan Yuktdhara. Category: Water Conservation. Stage: ${stage.toUpperCase()}`,
        thumbnail_path: thumb,
      }
    });
  }
  return extraFeatures;
};

// Append the mass data
DEMO_IMAGES_GEOJSON.features = DEMO_IMAGES_GEOJSON.features.concat(generateBhuvanMassData());

export const DEMO_STATS = [
  { date: '2021-04-30', period_label: 'Pre-Monsoon 2021', ndvi_mean: 0.15, ndvi_max: 0.61, vegetation_ha: 410, water_spread_ha: 210, bare_land_ha: 1050 },
  { date: '2022-04-30', period_label: 'Pre-Monsoon 2022', ndvi_mean: 0.19, ndvi_max: 0.68, vegetation_ha: 490, water_spread_ha: 240, bare_land_ha: 980 },
  { date: '2022-10-15', period_label: 'Post-Monsoon 2022', ndvi_mean: 0.29, ndvi_max: 0.74, vegetation_ha: 720, water_spread_ha: 480, bare_land_ha: 740 },
  { date: '2023-04-30', period_label: 'Pre-Monsoon 2023', ndvi_mean: 0.22, ndvi_max: 0.71, vegetation_ha: 560, water_spread_ha: 280, bare_land_ha: 880 },
  { date: '2023-10-20', period_label: 'Post-Monsoon 2023', ndvi_mean: 0.33, ndvi_max: 0.78, vegetation_ha: 820, water_spread_ha: 560, bare_land_ha: 680 },
  { date: '2024-09-20', period_label: 'Post-Monsoon 2024', ndvi_mean: 0.39, ndvi_max: 0.81, vegetation_ha: 980, water_spread_ha: 840, bare_land_ha: 580 },
];

export const DEMO_CHANGE = {
  period_1: 'Pre-Monsoon 2022',
  period_2: 'Post-Monsoon 2024',
  ndvi_before: 0.19,
  ndvi_after: 0.39,
  ndvi_delta: 0.20,
  ndvi_pct_change: 105.3,
  vegetation_ha_before: 490,
  vegetation_ha_after: 980,
  vegetation_ha_gained: 490,
  water_spread_ha_before: 240,
  water_spread_ha_after: 840,
  water_spread_ha_gained: 600,
  bare_land_ha_before: 980,
  bare_land_ha_after: 580,
  interpretation: 'Significant vegetation improvement: NDVI increased by 0.20 (+105.3%). Vegetation cover expanded by 490 ha. Water spread increased by 600 ha. Watershed interventions are showing measurable positive impact.',
};

export const DEMO_LAYERS = [
  { id: 'layer001', layer_type: 'ndvi', period_label: 'Pre-Monsoon 2022', period_slug: '2022-pre', colormap: 'RdYlGn', stats: { min: -0.21, max: 0.68, mean: 0.19 }, satellite_source: 'Landsat8_C2L2', pixel_size_m: 30 },
  { id: 'layer002', layer_type: 'ndvi', period_label: 'Post-Monsoon 2024', period_slug: '2024-post', colormap: 'RdYlGn', stats: { min: -0.12, max: 0.81, mean: 0.39 }, satellite_source: 'Landsat8_C2L2', pixel_size_m: 30 },
  { id: 'layer003', layer_type: 'mndwi', period_label: 'Pre-Monsoon 2022', period_slug: '2022-pre', colormap: 'Blues', stats: { min: -0.58, max: 0.42, mean: -0.28 }, satellite_source: 'Landsat8_C2L2', pixel_size_m: 30 },
  { id: 'layer004', layer_type: 'mndwi', period_label: 'Post-Monsoon 2024', period_slug: '2024-post', colormap: 'Blues', stats: { min: -0.41, max: 0.68, mean: -0.08 }, satellite_source: 'Landsat8_C2L2', pixel_size_m: 30 },
  { id: 'layer005', layer_type: 'lulc', period_label: 'Land Use Land Cover 2024', period_slug: '2024-post', colormap: 'custom', stats: {}, satellite_source: 'Landsat8_C2L2_RF', pixel_size_m: 30 },
  { id: 'layer006', layer_type: 'drainage', period_label: 'Drainage Network (SRTM)', period_slug: 'static', colormap: 'Blues', stats: { stream_order_max: 4, total_length_km: 48.3 }, satellite_source: 'SRTM_30m', pixel_size_m: 30 },
];

export const DEMO_SUMMARY = {
  total_watersheds: 2,
  total_images: 8,
  total_area_ha: 4227.5,
  images_pre_intervention: 3,
  images_post_intervention: 5,
  avg_ndvi_latest: 0.39,
  avg_ndvi_change_pct: 105.3,
  total_vegetation_ha_gained: 490,
  total_water_spread_ha_gained: 600,
  structures_monitored: 5,
  watersheds_monitored: 2,
};
