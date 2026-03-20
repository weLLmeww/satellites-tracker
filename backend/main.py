from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from parse import get_satellite_tle

app = FastAPI(title="Satellite Tracking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    text = get_satellite_tle(60549)
    return {"message": f"{text}"}