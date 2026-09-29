"""
WaterSight — Core Configuration
Reads from environment variables / .env file.
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://watersight:watersight@localhost:5432/watersight"
    DATABASE_URL_SYNC: str = "postgresql://watersight:watersight@localhost:5432/watersight"

    # MinIO / Object Storage
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET_IMAGES: str = "watersight-images"
    MINIO_BUCKET_LAYERS: str = "watersight-layers"
    MINIO_BUCKET_REPORTS: str = "watersight-reports"
    MINIO_USE_SSL: bool = False

    # TiTiler (raster tile server)
    TITILER_BASE_URL: str = "http://localhost:8000"

    # JWT Auth
    SECRET_KEY: str = "watersight-demo-secret-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours for demo

    # App
    DEMO_MODE: bool = True                   # Enables demo data endpoints
    PROCESSED_DATA_DIR: str = "/app/data/processed"
    DEMO_IMAGES_DIR: str = "/app/data/demo_images"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
