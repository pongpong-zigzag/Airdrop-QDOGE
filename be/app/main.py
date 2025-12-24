from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import init_db
from app.api.public import router as public_router
from app.api.admin import router as admin_router


def create_app() -> FastAPI:
    settings = get_settings()
    init_db()

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
