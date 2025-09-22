An Data Platform for Oceanographic, Fisheries, and Molecular Biodiversity Insights
===============================================================================

Quick start
-----------

1) Requirements
- Python 3.8+
- A modern browser

2) Run a local static server

```bash
cd /Users/akhil/Desktop/Project
python3 -m http.server 8000
```

3) Open the app
- Main page: `http://localhost:8000/main.html`
- Detail pages: `oceanographic.html`, `fisheries.html`, `molecular-biodiversity.html`

Usage
-----
1. On `main.html`, enter Latitude and Longitude, then click "Explore Data".
2. You'll be redirected to the Oceanographic page; nav links carry your coordinates to other pages.
3. Data persists across pages using URL params and localStorage.

APIs
----
- Oceanographic: Open-Meteo Marine API (hourly: SST, waves, swell, wind-wave)
- Fisheries: OBIS occurrences (bbox) + GBIF Actinopterygii occurrences (bbox)
- Molecular Biodiversity: OBIS occurrences (bbox)

Notes
-----
- If any table shows "-", that field was not returned by the API for that time/area.
- OBIS/GBIF searches use a small ±0.25° bounding box around the point.
- Charts are rendered with Chart.js from a CDN and will appear when data exists.

Assets
------
- Background video on main: `assets/ocean.mp4`
- Logo: `assets/newlogo.png`

Troubleshooting
---------------
- If CORS/network issues arise, try a fresh reload or different coordinates.
- Ensure you run via `python3 -m http.server` to avoid file:// CORS limits.


