"""Entrypoint for FastAPI.

Run locally:
  python migrate.py
  uvicorn main:app --reload --port 8000
"""

from app.main import app  # noqa: F401
