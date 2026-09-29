"""WaterSight — Admin API (users, audit log)"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.core.database import get_db
from app.models import User, AuditLog

router = APIRouter()


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool


class AuditLogEntry(BaseModel):
    id: str
    action: str
    entity_type: Optional[str]
    created_at: str
    metadata: Optional[dict]


@router.get("/users", response_model=List[UserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [UserOut(id=str(u.id), email=u.email, full_name=u.full_name, role=u.role.value, is_active=u.is_active) for u in users]


@router.get("/audit-log", response_model=List[AuditLogEntry])
async def get_audit_log(limit: int = Query(50, le=200), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    logs = result.scalars().all()
    return [AuditLogEntry(id=str(l.id), action=l.action, entity_type=l.entity_type, created_at=str(l.created_at), metadata=l.metadata) for l in logs]
