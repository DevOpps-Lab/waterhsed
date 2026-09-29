"""
WaterSight — API v1 Router Package
Aggregates all route modules for clean import in main.py
"""

from app.api.v1.auth import router as router_auth
from app.api.v1.watersheds import router as router_watersheds
from app.api.v1.images import router as router_images
from app.api.v1.layers import router as router_layers
from app.api.v1.analytics import router as router_analytics
from app.api.v1.reports import router as router_reports
from app.api.v1.admin import router as router_admin

__all__ = [
    "router_auth",
    "router_watersheds",
    "router_images",
    "router_layers",
    "router_analytics",
    "router_reports",
    "router_admin",
]
