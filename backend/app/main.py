"""
WaterSight Backend — FastAPI Application
Phase 4: REST API implementing all endpoints needed by the React frontend.

Run:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

Swagger UI: http://localhost:8080/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging

from app.core.config import settings
from app.api.v1 import (
    router_auth,
    router_watersheds,
    router_images,
    router_layers,
    router_analytics,
    router_reports,
    router_admin,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("watersight")

app = FastAPI(
    title="WaterSight API",
    description="Geospatial Watershed Monitoring Platform — SIH 2024 MVP",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow all origins for demo; restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(router_auth,       prefix="/api/auth",       tags=["Authentication"])
app.include_router(router_watersheds, prefix="/api/watersheds", tags=["Watersheds"])
app.include_router(router_images,     prefix="/api/images",     tags=["Geo-coded Images"])
app.include_router(router_layers,     prefix="/api/layers",     tags=["Thematic Layers"])
app.include_router(router_analytics,  prefix="/api/analytics",  tags=["Analytics"])
app.include_router(router_reports,    prefix="/api/reports",    tags=["Reports"])
app.include_router(router_admin,      prefix="/api/admin",      tags=["Admin"])


@app.get("/api/health", tags=["System"])
async def health_check():
    return {"status": "healthy", "service": "WaterSight API", "version": "1.0.0"}


@app.get("/", tags=["System"])
async def root():
    return {"message": "WaterSight API — See /docs for Swagger UI"}
