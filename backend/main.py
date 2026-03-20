import requests
import os
from dotenv import load_dotenv
from pprint import pp

load_dotenv()
API_KEY = os.getenv("API_KEY")

id = 60549
obs_lat = 40.7128
obs_lng = -74.0060
obs_alt = 0
second = 5

url = f"https://api.n2yo.com/rest/v1/satellite/positions/{id}/{obs_lat}/{obs_lng}/{obs_alt}/{second}&apiKey={API_KEY}"

r = requests.get(url)
pp(r.json())