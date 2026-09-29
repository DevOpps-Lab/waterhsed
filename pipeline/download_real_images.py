"""
WaterSight — Robust Real Image Downloader
==========================================
Downloads real photographs from Unsplash (free, no API key) and embeds
accurate GPS EXIF matching the Rajsamand watershed seed coordinates.

Also copies images to frontend/public/images/ so the React app
can display them directly in the image popup panel.

Run from: C:\\watershed\\watersight\\pipeline\\
    python download_real_images.py
"""

import os, io, sys, time, json, shutil
import requests
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import piexif

# ── Output directories ────────────────────────────────────────────────────
BASE = Path(__file__).parent.parent
OUTPUT_DIR  = BASE / "data" / "demo_images"
FRONTEND_PUB = BASE / "frontend" / "public" / "images"

# ── 8 demo images — GPS matches seed_data.sql exactly ────────────────────
# Format: (save_filename, lat, lon, alt_m, bearing_deg, intervention, stage, exif_date, description)
IMAGES = [
    (
        "img_check_dam_pre.jpg",
        24.862, 73.857, 385.0, 210.0,
        "check_dam", "pre", "2022:05:15 10:30:00",
        "Dry nala bed — planned check dam site. Severe soil erosion.",
        # Unsplash: dry rocky riverbed / ravine — arid landscape
        "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1000&q=85",
    ),
    (
        "img_check_dam_post.jpg",
        24.863, 73.858, 384.0, 215.0,
        "check_dam", "post", "2024:09:20 11:15:00",
        "Check dam complete. Water impounded. Vegetation recovering around structure.",
        # Unsplash: small dam / weir with water
        "https://images.unsplash.com/photo-1504608524841-42f9159db5ee?w=1000&q=85",
    ),
    (
        "img_farm_pond_pre.jpg",
        24.872, 73.901, 402.0, 45.0,
        "farm_pond", "pre", "2022:06:02 08:45:00",
        "Dry agricultural field. Cracked soil. Proposed farm pond location.",
        # Unsplash: dry cracked earth / parched ground
        "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1000&q=85",
    ),
    (
        "img_farm_pond_post.jpg",
        24.873, 73.902, 401.0, 48.0,
        "farm_pond", "post", "2024:08:30 09:00:00",
        "Farm pond filled (0.3 ha). Green buffer zone established around bund.",
        # Unsplash: pond / small lake with green vegetation
        "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1000&q=85",
    ),
    (
        "img_afforestation_pre.jpg",
        24.935, 73.868, 445.0, 90.0,
        "afforestation", "pre", "2022:05:28 14:20:00",
        "Degraded hillslope. Sheet erosion visible. Afforestation proposed.",
        # Unsplash: barren rocky hillside / degraded land
        "https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1000&q=85",
    ),
    (
        "img_afforestation_post.jpg",
        24.936, 73.868, 444.0, 92.0,
        "afforestation", "post", "2024:09:05 14:50:00",
        "Young neem/khejri trees 2-3m. Ground cover established. Erosion arrested.",
        # Unsplash: young plantation / forest green
        "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1000&q=85",
    ),
    (
        "img_contour_trench_post.jpg",
        24.875, 73.851, 420.0, 180.0,
        "contour_trench", "post", "2024:09:12 10:00:00",
        "Contour trenches across hillslope. Moisture retained post-monsoon.",
        # Unsplash: terraced hillside / agricultural terracing
        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1000&q=85",
    ),
    (
        "img_gully_plug_post.jpg",
        24.888, 73.912, 390.0, 270.0,
        "gully_plug", "post", "2024:09:18 12:30:00",
        "Stone gully plug. Sediment trapped upstream. Erosion arrested.",
        # Unsplash: stone wall / rocky dry-stone structure
        "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1000&q=85",
    ),
]


# ── GPS EXIF helpers ───────────────────────────────────────────────────────

def _deg_to_dms_rational(deg: float):
    d = int(abs(deg))
    m = int((abs(deg) - d) * 60)
    s = int(((abs(deg) - d) * 60 - m) * 6000)
    return [(d, 1), (m, 1), (s, 100)]


def embed_gps_exif(jpeg_bytes: bytes, lat, lon, alt, bearing, dt_str, desc) -> bytes:
    """Write GPS + datetime EXIF into JPEG bytes. Returns new JPEG bytes."""
    img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
    img = img.resize((1200, 900), Image.LANCZOS)

    gps_ifd = {
        piexif.GPSIFD.GPSVersionID:      (2, 3, 0, 0),
        piexif.GPSIFD.GPSLatitudeRef:    b"N" if lat >= 0 else b"S",
        piexif.GPSIFD.GPSLatitude:       _deg_to_dms_rational(lat),
        piexif.GPSIFD.GPSLongitudeRef:   b"E" if lon >= 0 else b"W",
        piexif.GPSIFD.GPSLongitude:      _deg_to_dms_rational(lon),
        piexif.GPSIFD.GPSAltitudeRef:    0,
        piexif.GPSIFD.GPSAltitude:       (int(alt * 10), 10),
        piexif.GPSIFD.GPSImgDirectionRef:b"T",
        piexif.GPSIFD.GPSImgDirection:   (int(bearing * 10), 10),
    }
    exif_ifd = {
        piexif.ExifIFD.DateTimeOriginal:  dt_str.encode(),
        piexif.ExifIFD.DateTimeDigitized: dt_str.encode(),
    }
    zeroth = {
        piexif.ImageIFD.Make:             b"WaterSight Demo",
        piexif.ImageIFD.Model:            b"Field Camera",
        piexif.ImageIFD.ImageDescription: desc[:199].encode(),
        piexif.ImageIFD.DateTime:         dt_str.encode(),
    }
    exif_bytes = piexif.dump({"0th": zeroth, "Exif": exif_ifd, "GPS": gps_ifd})
    out = io.BytesIO()
    img.save(out, "JPEG", quality=92, exif=exif_bytes)
    return out.getvalue()


def verify_exif(path: Path) -> bool:
    """Return True if saved image has GPS EXIF."""
    try:
        img = Image.open(path)
        exif = piexif.load(img.info.get("exif", b""))
        return bool(exif.get("GPS", {}).get(piexif.GPSIFD.GPSLatitude))
    except Exception:
        return False


# ── Synthetic fallback ─────────────────────────────────────────────────────

def make_synthetic_image(stage: str, intervention: str, desc: str) -> bytes:
    """Generate a colored placeholder JPEG if download fails."""
    w, h = 1200, 900
    colors = {
        "pre":  {"check_dam": (120, 90, 60), "farm_pond": (140, 100, 70),
                 "afforestation": (160, 120, 80), "contour_trench": (130, 95, 65),
                 "gully_plug": (125, 92, 62), "other": (100, 80, 60)},
        "post": {"check_dam": (30, 100, 180), "farm_pond": (40, 140, 80),
                 "afforestation": (20, 120, 50), "contour_trench": (60, 150, 90),
                 "gully_plug": (50, 110, 70), "other": (80, 130, 100)},
    }
    bg = colors.get(stage, {}).get(intervention, (100, 100, 100))
    img = Image.new("RGB", (w, h), color=bg)
    draw = ImageDraw.Draw(img)

    # Gradient bands
    for i in range(h):
        r = int(bg[0] * (0.7 + 0.3 * i / h))
        g = int(bg[1] * (0.7 + 0.3 * i / h))
        b = int(bg[2] * (0.7 + 0.3 * i / h))
        draw.line([(0, i), (w, i)], fill=(r, g, b))

    # Text overlay
    draw.rectangle([20, 20, 780, 90], fill=(0, 0, 0, 160))
    draw.text((30, 30), f"[Synthetic] {intervention.replace('_', ' ').title()} — {stage.upper()}", fill=(255, 255, 255))
    draw.text((30, 55), desc[:80], fill=(200, 200, 200))

    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue()


# ── Download ───────────────────────────────────────────────────────────────

def download(url: str, retries=3) -> bytes | None:
    headers = {"User-Agent": "WaterSight/1.0 (SIH 2024 educational demo)"}
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code == 200 and len(r.content) > 5000:
                return r.content
            print(f"    HTTP {r.status_code}, size={len(r.content)}")
        except Exception as e:
            print(f"    Attempt {attempt+1} failed: {e}")
        if attempt < retries - 1:
            time.sleep(1.5)
    return None


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_PUB.mkdir(parents=True, exist_ok=True)

    print("=" * 65)
    print("WaterSight — Real Image Downloader with GPS EXIF Embedding")
    print("=" * 65)

    manifest = []   # For demoData.js update
    ok_count = 0

    for fname, lat, lon, alt, bearing, intervention, stage, exif_dt, desc, url in IMAGES:
        print(f"\n[{'✅' if stage=='post' else '🔴'}] {fname}")
        print(f"    GPS: {lat}°N, {lon}°E  |  {intervention} ({stage})")

        # Download
        print(f"    Downloading from Unsplash...")
        raw = download(url)

        if raw:
            print(f"    Downloaded {len(raw)//1024} KB — embedding GPS EXIF...")
            try:
                gps_jpeg = embed_gps_exif(raw, lat, lon, alt, bearing, exif_dt, desc)
                source = "Unsplash (real photo)"
            except Exception as e:
                print(f"    EXIF embed failed: {e}, using synthetic fallback")
                raw2 = make_synthetic_image(stage, intervention, desc)
                gps_jpeg = embed_gps_exif(raw2, lat, lon, alt, bearing, exif_dt, desc)
                source = "Synthetic (download ok, EXIF failed)"
        else:
            print(f"    Download failed — generating synthetic image...")
            raw2 = make_synthetic_image(stage, intervention, desc)
            gps_jpeg = embed_gps_exif(raw2, lat, lon, alt, bearing, exif_dt, desc)
            source = "Synthetic fallback"

        # Save to data/demo_images/
        out_path = OUTPUT_DIR / fname
        out_path.write_bytes(gps_jpeg)

        # Copy to frontend/public/images/ (React serves these as /images/fname)
        pub_path = FRONTEND_PUB / fname
        shutil.copy2(out_path, pub_path)

        # Verify GPS
        gps_ok = verify_exif(out_path)
        print(f"    ✅ Saved ({len(gps_jpeg)//1024} KB) | GPS verified: {gps_ok} | {source}")
        ok_count += 1

        manifest.append({
            "filename": fname,
            "public_path": f"/images/{fname}",
            "lat": lat, "lon": lon,
            "intervention_type": intervention,
            "observation_stage": stage,
            "captured_at": exif_dt[:10].replace(":", "-"),
            "description": desc,
            "source": source,
        })

    # Write manifest JSON (used by frontend)
    manifest_path = FRONTEND_PUB / "image_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n📋 Manifest written: {manifest_path}")

    # Print demoData.js thumbnail update snippet
    print("\n" + "=" * 65)
    print(f"✅ All {ok_count}/8 images ready")
    print(f"   → data/demo_images/        (for backend API)")
    print(f"   → frontend/public/images/  (for React direct display)")
    print("=" * 65)

    # Return manifest for demoData.js update
    return manifest


if __name__ == "__main__":
    manifest = main()
    print("\n📸 Image paths (paste into demoData.js thumbnail_path):")
    for m in manifest:
        print(f"  {m['filename']}: '{m['public_path']}'")
