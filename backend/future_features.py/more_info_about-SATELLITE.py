def classify_satellite(name: str, tle2: str) -> dict:
    """
    Определяет страну, тип спутника и высоту орбиты из имени и TLE2.
    """

    # --- Высота орбиты по большой полуоси из TLE2 ---
    # TLE2: mean motion (об/день) на позиции 52-63
    mean_motion = float(tle2[52:63].strip())  # оборотов в сутки
    # Период в минутах
    period_min = 1440 / mean_motion
    # Приблизительная высота орбиты в км через период (формула Кеплера)
    import math
    mu = 398600.4418  # гравитационный параметр Земли
    a = (mu * ((period_min * 60 / (2 * math.pi)) ** 2)) ** (1/3)
    altitude_km = a - 6371  # вычитаем радиус Земли

    if altitude_km < 2000:
        orbit_type = "LEO"       # Низкая
    elif altitude_km < 35786:
        orbit_type = "MEO"       # Средняя
    elif 35786 <= altitude_km <= 35800:
        orbit_type = "GEO"       # Геостационарная
    else:
        orbit_type = "HEO"       # Высокая / эллиптическая

    # --- Страна по префиксу имени ---
    COUNTRY_PREFIXES = {
        # США
        ("USA", "NAVSTAR", "GPS", "GOES", "NOAA", "LANDSAT", "TDRS",
         "CALSPHERE", "VANGUARD", "EXPLORER", "COSMOS_US"): "USA",
        # Россия / СССР
        ("COSMOS", "MOLNIYA", "RESURS", "MERIDIAN", "GLONASS",
         "EKSPRESS", "GONETS", "ELEKTRO"): "Russia",
        # Китай
        ("CHINASAT", "FENGYUN", "BEIDOU", "YAOGAN", "SHIJIAN",
         "TIANGONG", "TIANZHOU"): "China",
        # Европа
        ("ESA", "METEOSAT", "SENTINEL", "GALILEO", "SPOT",
         "ENVISAT", "INTEGRAL"): "Europe",
        # Япония
        ("HIMAWARI", "QZSS", "MICHIBIKI", "ALOS", "DAICHI"): "Japan",
        # Индия
        ("INSAT", "GSAT", "IRNSS", "NAVIC", "CARTOSAT",
         "RESOURCESAT"): "India",
        # SpaceX
        ("STARLINK",): "USA (SpaceX)",
        # OneWeb
        ("ONEWEB",): "UK (OneWeb)",
    }

    country = "Unknown"
    name_upper = name.upper()
    for prefixes, nation in COUNTRY_PREFIXES.items():
        if any(name_upper.startswith(p) for p in prefixes):
            country = nation
            break

    # --- Тип спутника по имени ---
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