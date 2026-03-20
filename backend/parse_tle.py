import json
import re
import sys
import math


def classify_satellite(name: str, tle2: str) -> dict:
    mean_motion = float(tle2[52:63].strip())
    period_min = 1440 / mean_motion
    mu = 398600.4418
    a = (mu * ((period_min * 60 / (2 * math.pi)) ** 2)) ** (1 / 3)
    altitude_km = a - 6371

    if altitude_km < 2000:
        orbit_type = "LEO"
    elif altitude_km < 35786:
        orbit_type = "MEO"
    elif 35786 <= altitude_km <= 35800:
        orbit_type = "GEO"
    else:
        orbit_type = "HEO"

    COUNTRY_PREFIXES = {
        ("USA", "NAVSTAR", "GPS", "GOES", "NOAA", "LANDSAT", "TDRS",
         "CALSPHERE", "VANGUARD", "EXPLORER"): "USA",
        ("COSMOS", "MOLNIYA", "RESURS", "MERIDIAN", "GLONASS",
         "EKSPRESS", "GONETS", "ELEKTRO"): "Russia",
        ("CHINASAT", "FENGYUN", "BEIDOU", "YAOGAN", "SHIJIAN",
         "TIANGONG", "TIANZHOU"): "China",
        ("ESA", "METEOSAT", "SENTINEL", "GALILEO", "SPOT",
         "ENVISAT", "INTEGRAL"): "Europe",
        ("HIMAWARI", "QZSS", "MICHIBIKI", "ALOS", "DAICHI"): "Japan",
        ("INSAT", "GSAT", "IRNSS", "NAVIC", "CARTOSAT",
         "RESOURCESAT"): "India",
        ("STARLINK",): "USA (SpaceX)",
        ("ONEWEB",): "UK (OneWeb)",
    }

    country = "Unknown"
    name_upper = name.upper()
    for prefixes, nation in COUNTRY_PREFIXES.items():
        if any(name_upper.startswith(p) for p in prefixes):
            country = nation
            break

    SAT_TYPES = {
        "STARLINK":     "Communication",
        "ONEWEB":       "Communication",
        "IRIDIUM":      "Communication",
        "INTELSAT":     "Communication",
        "GLOBALSTAR":   "Communication",
        "CHINASAT":     "Communication",
        "EKSPRESS":     "Communication",
        "TDRS":         "Communication",
        "MOLNIYA":      "Communication",
        "MERIDIAN":     "Communication",
        "NAVSTAR":      "Navigation",
        "GPS":          "Navigation",
        "GLONASS":      "Navigation",
        "BEIDOU":       "Navigation",
        "GALILEO":      "Navigation",
        "QZSS":         "Navigation",
        "MICHIBIKI":    "Navigation",
        "IRNSS":        "Navigation",
        "NAVIC":        "Navigation",
        "NOAA":         "Weather",
        "GOES":         "Weather",
        "METEOSAT":     "Weather",
        "FENGYUN":      "Weather",
        "HIMAWARI":     "Weather",
        "ELEKTRO":      "Weather",
        "LANDSAT":      "Earth Observation",
        "SENTINEL":     "Earth Observation",
        "SPOT":         "Earth Observation",
        "YAOGAN":       "Earth Observation",
        "RESURS":       "Earth Observation",
        "CARTOSAT":     "Earth Observation",
        "RESOURCESAT":  "Earth Observation",
        "ALOS":         "Earth Observation",
        "DAICHI":       "Earth Observation",
        "ISS":          "Space Station",
        "TIANGONG":     "Space Station",
        "TIANZHOU":     "Space Station",
        "COSMOS":       "Military",
        "USA":          "Military",
        "INTEGRAL":     "Science",
        "EXPLORER":     "Science",
        "SHIJIAN":      "Science",
    }

    sat_type = "Unknown"
    for keyword, stype in SAT_TYPES.items():
        if keyword in name_upper:
            sat_type = stype
            break

    return {
        "country": country,
        "type": sat_type,
        "orbit": orbit_type,
        "altitude_km": round(altitude_km),
    }


def parse_tle(filepath: str) -> list:
    satellites = []

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    content = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = content.split("\n")

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if not line:
            i += 1
            continue

        if not re.match(r"^[12]\s", line):
            name = line

            j = i + 1
            tle_lines = []
            while j < len(lines) and len(tle_lines) < 2:
                stripped = lines[j].strip()
                if stripped:
                    tle_lines.append(stripped)
                j += 1

            if len(tle_lines) == 2 and re.match(r"^1\s", tle_lines[0]) and re.match(r"^2\s", tle_lines[1]):
                sat_id = int(tle_lines[0][2:7].strip())

                try:
                    meta = classify_satellite(name, tle_lines[1])
                except Exception:
                    meta = {"country": "Unknown", "type": "Unknown", "orbit": "Unknown", "altitude_km": 0}

                satellites.append({
                    "id": sat_id,
                    "name": name,
                    "tle1": tle_lines[0],
                    "tle2": tle_lines[1],
                    "country": meta["country"],
                    "type": meta["type"],
                    "orbit": meta["orbit"],
                    "altitude_km": meta["altitude_km"],
                })
                i = j
                continue

        i += 1

    return satellites


if __name__ == "__main__":
    input_path  = sys.argv[1] if len(sys.argv) > 1 else "tle.txt"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "satellites.json"

    satellites = parse_tle(input_path)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(satellites, f, indent=2, ensure_ascii=False)

    print(f"Готово! Найдено спутников: {len(satellites)}")
    if satellites:
        print("\nПервая запись:")
        print(json.dumps(satellites[0], indent=2, ensure_ascii=False))