from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator


class ColumnMetaSchema(BaseModel):
    featureType: str = ""
    valueType: str = ""
    missingFill: str = ""
    role: str = "feature"


class GenerationRequest(BaseModel):
    """API-контракт с клиентом (клиент — источник истины)."""

    method: str = Field(..., min_length=1)
    recordCount: int = Field(..., gt=0)
    headers: list[str] = Field(..., min_length=1)
    trainData: list[list[str]] = Field(default_factory=list)
    columnMeta: dict[int, ColumnMetaSchema] = Field(default_factory=dict)

    @field_validator("trainData")
    @classmethod
    def validate_train_data(cls, rows: list[list[str]]) -> list[list[str]]:
        if not rows:
            raise ValueError("trainData не должен быть пустым")
        return rows


app = FastAPI(title="api-gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_engine_url() -> str:
    return os.getenv("SYNTHCITY_ENGINE_URL", "http://localhost:8001/generate")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/generation")
async def generation(payload: GenerationRequest) -> Any:
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            engine_response = await client.post(
                get_engine_url(),
                json=payload.model_dump(mode="json"),
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось подключиться к сервису генерации: {error}",
        ) from error

    if engine_response.status_code >= 400:
        raise HTTPException(
            status_code=engine_response.status_code,
            detail=engine_response.text,
        )

    return engine_response.json()
