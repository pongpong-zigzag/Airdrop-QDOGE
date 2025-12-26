from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import init_db, conn_ctx
from app.api.public import router as public_router
from app.api.admin import router as admin_router
from app.services.snapshots import sync_power_snapshot


def create_app() -> FastAPI:
    settings = get_settings()
    init_db()

    # Optional: seed/sync power snapshot from config.py (POWER_USERS)
    if settings.power_users:
        with conn_ctx() as conn:
            sync_power_snapshot(
                conn,
                settings.power_users,
                mode=settings.power_snapshot_sync_mode,
            )

    app = FastAPI(title="QDOGE Airdrop API", version="2.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(public_router)
    # admin endpoints require X-API-Key
    app.include_router(admin_router)

    @app.get("/")
    def root():
        return {"ok": True, "service": "qdoge-airdrop", "version": app.version}

    return app


app = create_app()
