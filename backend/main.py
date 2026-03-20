from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json
import os

app = FastAPI(
    title="Satellites Tracker API",
    description="API для отслеживания спутников на основе TLE данных",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Загружаем satellites.json один раз при старте сервера
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(BASE_DIR, "satellites.json")

with open(JSON_PATH, "r", encoding="utf-8") as f:
    SATELLITES: list[dict] = json.load(f)

# Индекс по ID для быстрого поиска
SAT_INDEX: dict[int, dict] = {sat["id"]: sat for sat in SATELLITES}


# ──────────────────────────────────────────────
# GET /satellites
# ──────────────────────────────────────────────
@app.get(
    "/satellites",
    summary="Список спутников",
    description="Возвращает постраничный список спутников. Можно фильтровать по стране, типу и орбите.",
    tags=["Satellites"]
)
def get_satellites(
    limit: int = Query(100, ge=1, le=1000, description="Количество записей на странице"),
    offset: int = Query(0, ge=0, description="Смещение (пагинация)"),
    country: Optional[str] = Query(None, description="Фильтр по стране, например: Russia, USA, China"),
    type: Optional[str] = Query(None, description="Фильтр по типу: Communication, Navigation, Weather, Military, ..."),
    orbit: Optional[str] = Query(None, description="Фильтр по орбите: LEO, MEO, GEO, HEO"),
):
    result = SATELLITES

    if country:
        result = [s for s in result if s.get("country", "").lower() == country.lower()]
    if type:
        result = [s for s in result if s.get("type", "").lower() == type.lower()]
    if orbit:
        result = [s for s in result if s.get("orbit", "").lower() == orbit.lower()]

    total = len(result)
    paginated = result[offset: offset + limit]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "data": paginated
    }


# ──────────────────────────────────────────────
# GET /satellites/search
# ──────────────────────────────────────────────
@app.get(
    "/satellites/search",
    summary="Поиск по имени",
    description="Ищет спутники по части имени (регистронезависимо).",
    tags=["Satellites"]
)
def search_satellites(
    q: str = Query(..., min_length=1, description="Строка поиска, например: STARLINK или ISS"),
    limit: int = Query(100, ge=1, le=1000, description="Максимум результатов"),
):
    results = [s for s in SATELLITES if q.upper() in s["name"].upper()]
    return {
        "total": len(results),
        "query": q,
        "data": results[:limit]
    }


# ──────────────────────────────────────────────
# GET /satellites/{sat_id}
# ──────────────────────────────────────────────
@app.get(
    "/satellites/{sat_id}",
    summary="Спутник по ID",
    description="Возвращает одну запись спутника по его NORAD ID.",
    tags=["Satellites"]
)
def get_satellite(sat_id: int):
    sat = SAT_INDEX.get(sat_id)
    if not sat:
        raise HTTPException(status_code=404, detail=f"Спутник с ID {sat_id} не найден")
    return sat


# ──────────────────────────────────────────────
# GET /meta
# ──────────────────────────────────────────────
@app.get(
    "/meta",
    summary="Статистика по базе",
    description="Возвращает общее количество спутников и список уникальных стран, типов и орбит.",
    tags=["Meta"]
)
def get_meta():
    countries = sorted(set(s.get("country", "Unknown") for s in SATELLITES))
    types     = sorted(set(s.get("type", "Unknown") for s in SATELLITES))
    orbits    = sorted(set(s.get("orbit", "Unknown") for s in SATELLITES))

    return {
        "total": len(SATELLITES),
        "countries": countries,
        "types": types,
        "orbits": orbits,
    }