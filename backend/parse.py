import requests
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("API_KEY")

id = 60549
obs_lat = 40.7128
obs_lng = -74.0060
obs_alt = 0
second = 5

class SatellitePosition:
    def __init__(self, id: int, name:str, tle1: str, tle2: str, transactions_count: int):
        self.id = id
        self.name = name
        self.tle1 = tle1
        self.tle2 = tle2
        self.transactions_count = transactions_count


# def get_satellite_position(id: int, obs_lat: float, obs_lng: float, obs_alt: int, second: int):
#     url = f"https://api.n2yo.com/rest/v1/satellite/positions/{id}/{obs_lat}/{obs_lng}/{obs_alt}/{second}&apiKey={API_KEY}"
#     r = requests.get(url)
#     return r.json()


def get_satellite_data(id: int) -> SatellitePosition:
    url = f"https://api.n2yo.com/rest/v1/satellite/tle/{id}&apiKey={API_KEY}"
    r = requests.get(url)

    pos = SatellitePosition(
        id=id,
        name = "213",
        tle1=r.json()["tle"].split("\r\n")[0],
        tle2=r.json()["tle"].split("\r\n")[1],
        transactions_count=0
    )
    return (pos.tle1, pos.tle2)