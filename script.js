// Show welcome message when page loads
window.addEventListener("load", () => {
  console.log("Website loaded successfully!");
  console.log(
    "Welcome to: An Data Platform for Oceanographic, Fisheries, and Molecular Biodiversity Insights"
  );
});

// -----------------------------
// Utilities and mock data layer
// -----------------------------
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatCoord(value) {
  return Number(value).toFixed(6);
}

function display(value, suffix = "") {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return "-";
  }
  return `${value}${suffix}`;
}

function normalizeCoordsMaybeSwap(lat, lon) {
  // If values look flipped (lat outside [-90,90] but lon within), swap
  const looksFlipped = (lat < -90 || lat > 90) && lon >= -180 && lon <= 180;
  if (looksFlipped) {
    return { latitude: clamp(lon, -90, 90), longitude: clamp(lat, -180, 180) };
  }
  return { latitude: clamp(lat, -90, 90), longitude: clamp(lon, -180, 180) };
}

function getMockData(latitude, longitude) {
  // Deterministic pseudo-random based on coords
  const seed = Math.abs(Math.sin(latitude * 12.9898 + longitude * 78.233) * 43758.5453);
  function prand(min, max, factor) {
    const v = (seed * (factor || 1)) % 1;
    return min + v * (max - min);
  }

  const oceanographic = {
    seaSurfaceTemperatureC: prand(18, 31, 1).toFixed(1),
    salinityPsu: prand(30, 37, 2).toFixed(2),
    chlorophyllMgM3: prand(0.05, 3.5, 3).toFixed(2),
    waveHeightM: prand(0.2, 3.0, 4).toFixed(2),
  };

  const fisheries = {
    predictedCatchIndex: Math.round(prand(20, 95, 5)),
    dominantSpecies: ["Sardine", "Mackerel", "Anchovy", "Tuna"][Math.floor(prand(0, 4, 6))] || "Sardine",
    habitatSuitability: Math.round(prand(40, 98, 7)),
    advisories: prand(0, 1, 8) > 0.7 ? "Avoid trawling due to swell" : "Conditions favorable for small-scale fishing",
  };

  const molecular = {
    eDnaDiversityIndex: prand(0.2, 0.95, 9).toFixed(2),
    potentialTaxaDetected: Math.round(prand(5, 120, 10)),
    invasiveRisk: ["Low", "Moderate", "High"][Math.floor(prand(0, 3, 11))] || "Low",
    markerGenes: ["COI", "16S", "18S"].slice(0, 1 + Math.floor(prand(1, 3, 12))),
  };

  return { oceanographic, fisheries, molecular };
}

// -----------------------------
// Live API fetchers
// -----------------------------
async function fetchOceanographicFromApi(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hourly: [
        "sea_surface_temperature",
        "wave_height","wave_direction","wave_period",
        "swell_wave_height","swell_wave_direction","swell_wave_period",
        "wind_wave_height","wind_wave_direction","wind_wave_period"
      ].join(","),
      past_days: "1",
      forecast_days: "1",
      timezone: "UTC",
    });
    const url = `https://marine-api.open-meteo.com/v1/marine?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Open-Meteo response not ok");
    const json = await res.json();
    const times = (json.hourly && Array.isArray(json.hourly.time)) ? json.hourly.time : [];
    return {
      hourly: {
        time: times.map(t => t + "Z"),
        sea_surface_temperature: json.hourly?.sea_surface_temperature || [],
        wave_height: json.hourly?.wave_height || [],
        wave_direction: json.hourly?.wave_direction || [],
        wave_period: json.hourly?.wave_period || [],
        swell_wave_height: json.hourly?.swell_wave_height || [],
        swell_wave_direction: json.hourly?.swell_wave_direction || [],
        swell_wave_period: json.hourly?.swell_wave_period || [],
        wind_wave_height: json.hourly?.wind_wave_height || [],
        wind_wave_direction: json.hourly?.wind_wave_direction || [],
        wind_wave_period: json.hourly?.wind_wave_period || [],
      },
      units: json.hourly_units || {},
    };
  } catch (e) {
    console.warn("Oceanographic API failed, using mock:", e);
    return null;
  }
}

async function fetchObisOccurrences(latitude, longitude, size = 20) {
  // OBIS occurrences in a small bbox (~0.25°) around the point; returns up to `size` records
  const lon = Number(longitude);
  const lat = Number(latitude);
  const d = 0.25;
  const minLon = (lon - d).toFixed(4);
  const maxLon = (lon + d).toFixed(4);
  const minLat = (lat - d).toFixed(4);
  const maxLat = (lat + d).toFixed(4);
  const geometry = `POLYGON((
    ${minLon}%20${minLat},
    ${maxLon}%20${minLat},
    ${maxLon}%20${maxLat},
    ${minLon}%20${maxLat},
    ${minLon}%20${minLat}
  ))`;
  const url = `https://api.obis.org/v3/occurrence?size=${size}&geometry=${geometry}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("OBIS response not ok");
  return res.json();
}

// Additional Fisheries source: GBIF occurrences for Actinopterygii within a small bbox
async function fetchGbifFishOccurrences(latitude, longitude, limit = 100) {
  try {
    const lon = Number(longitude);
    const lat = Number(latitude);
    const d = 0.25; // bbox half-size in degrees
    const minLon = (lon - d).toFixed(4);
    const maxLon = (lon + d).toFixed(4);
    const minLat = (lat - d).toFixed(4);
    const maxLat = (lat + d).toFixed(4);
    const geometry = `POLYGON((${minLon}%20${minLat},${maxLon}%20${minLat},${maxLon}%20${maxLat},${minLon}%20${maxLat},${minLon}%20${minLat}))`;
    // Filter by class Actinopterygii; GBIF supports class filter by scientific name
    const url = `https://api.gbif.org/v1/occurrence/search?class=Actinopterygii&geometry=${geometry}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("GBIF response not ok");
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    // Normalize minimal fields we need
    return results.map(r => ({
      scientificName: r.scientificName || r.species || r.genericName || r.taxon?.scientificName || undefined,
      eventDate: r.eventDate || r.day || r.month || r.year ? `${r.year||""}-${String(r.month||"").padStart(2,"0")}-${String(r.day||"").padStart(2,"0")}` : undefined,
      minimumDepthInMeters: r.depth || r.minimumDepthInMeters || r.decimalDepth || undefined,
    }));
  } catch (e) {
    console.warn("GBIF API failed:", e);
    return [];
  }
}

async function fetchBiodiversityFromApi(latitude, longitude) {
  try {
    const json = await fetchObisOccurrences(latitude, longitude, 100);
    const records = Array.isArray(json?.results) ? json.results : [];
    const taxa = records.map(r => r.scientificName).filter(Boolean);
    const uniqueTaxa = Array.from(new Set(taxa));
    const familyCounts = {};
    const genusCounts = {};
    for (const r of records) {
      if (r.family) familyCounts[r.family] = (familyCounts[r.family] || 0) + 1;
      if (r.genus) genusCounts[r.genus] = (genusCounts[r.genus] || 0) + 1;
    }
    const topK = (obj, k=3) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([n,c])=>`${n} (${c})`);
    return {
      eDnaDiversityIndex: uniqueTaxa.length > 0 ? (Math.min(uniqueTaxa.length / 100, 0.95)).toFixed(2) : "0.00",
      potentialTaxaDetected: uniqueTaxa.length,
      invasiveRisk: uniqueTaxa.length > 50 ? "Moderate" : "Low",
      markerGenes: ["COI", "16S", "18S"],
      topTaxa: uniqueTaxa.slice(0, 5),
      totalOccurrences: records.length,
      topFamilies: topK(familyCounts),
      topGenera: topK(genusCounts),
      occurrences: records.slice(0, 20),
    };
  } catch (e) {
    console.warn("Biodiversity API failed, using mock:", e);
    return null;
  }
}

async function fetchFisheriesFromApi(latitude, longitude) {
  try {
    const [obisJson, gbifFish] = await Promise.all([
      fetchObisOccurrences(latitude, longitude, 100),
      fetchGbifFishOccurrences(latitude, longitude, 100),
    ]);
    const obisRecords = Array.isArray(obisJson?.results) ? obisJson.results : [];
    const obisFish = obisRecords.filter(r => (r.class || "").toLowerCase() === "actinopterygii");
    const obisSpecies = obisFish.map(r => r.scientificName).filter(Boolean);
    const gbifSpecies = gbifFish.map(r => r.scientificName).filter(Boolean);
    const combinedSpecies = Array.from(new Set([...obisSpecies, ...gbifSpecies]));
    const dominant = combinedSpecies[0] || obisRecords[0]?.scientificName || gbifFish[0]?.scientificName || "Unknown";

    // Simple indices scaled by occurrence counts
    const obisCount = obisFish.length;
    const gbifCount = gbifFish.length;
    const totalCount = obisCount + gbifCount;

    return {
      predictedCatchIndex: Math.min(95, Math.max(20, totalCount * 2 + 20)),
      dominantSpecies: dominant,
      habitatSuitability: Math.min(98, 40 + Math.round(totalCount * 0.8)),
      advisories: totalCount > 10 ? "Conditions favorable for small-scale fishing" : "Survey area recommended",
      totalFishOccurrences: obisCount, // keep existing label for backward compat (OBIS only)
      totalFishOccurrencesGbif: gbifCount,
      totalFishOccurrencesCombined: totalCount,
      sampleSpecies: combinedSpecies.slice(0, 5),
      fishOccurrences: obisFish.slice(0, 20),
      fishOccurrencesGbif: gbifFish.slice(0, 20),
    };
  } catch (e) {
    console.warn("Fisheries API failed, using mock:", e);
    return null;
  }
}

async function getLiveOrMockData(latitude, longitude) {
  const [oceanApi, fishApi, molApi] = await Promise.all([
    fetchOceanographicFromApi(latitude, longitude),
    fetchFisheriesFromApi(latitude, longitude),
    fetchBiodiversityFromApi(latitude, longitude),
  ]);
  return {
    oceanographic: oceanApi || {},
    fisheries: fishApi || {},
    molecular: molApi || {},
  };
}

function renderOceanographic(container, data) {
  // If full hourly arrays exist, render a multi-row table
  if (data && data.hourly && Array.isArray(data.hourly.time)) {
    const h = data.hourly;
    const units = data.units || {};
    const rows = h.time.map((t, i) => {
      const sst = h.sea_surface_temperature?.[i];
      const wh = h.wave_height?.[i];
      const wd = h.wave_direction?.[i];
      const wp = h.wave_period?.[i];
      const swh = h.swell_wave_height?.[i];
      const swd = h.swell_wave_direction?.[i];
      const swp = h.swell_wave_period?.[i];
      const wwh = h.wind_wave_height?.[i];
      const wwd = h.wind_wave_direction?.[i];
      const wwp = h.wind_wave_period?.[i];
      return `<tr>
        <td>${display(t)}</td>
        <td>${display(sst, sst!==undefined&&sst!==null?` ${units.sea_surface_temperature||""}`:"")}</td>
        <td>${display(wh, wh!==undefined&&wh!==null?` ${units.wave_height||""}`:"")}</td>
        <td>${display(wd, wd!==undefined&&wd!==null?` ${units.wave_direction||""}`:"")}</td>
        <td>${display(wp, wp!==undefined&&wp!==null?` ${units.wave_period||""}`:"")}</td>
        <td>${display(swh, swh!==undefined&&swh!==null?` ${units.swell_wave_height||""}`:"")}</td>
        <td>${display(swd, swd!==undefined&&swd!==null?` ${units.swell_wave_direction||""}`:"")}</td>
        <td>${display(swp, swp!==undefined&&swp!==null?` ${units.swell_wave_period||""}`:"")}</td>
        <td>${display(wwh, wwh!==undefined&&wwh!==null?` ${units.wind_wave_height||""}`:"")}</td>
        <td>${display(wwd, wwd!==undefined&&wwd!==null?` ${units.wind_wave_direction||""}`:"")}</td>
        <td>${display(wwp, wwp!==undefined&&wwp!==null?` ${units.wind_wave_period||""}`:"")}</td>
      </tr>`;
    }).join("");
    container.innerHTML = `
      <h4 style="color:#ffd700;">Oceanographic (hourly)</h4>
      <div class="table-scroll">
      <table class="data-table" aria-label="Oceanographic Hourly Data">
        <thead>
          <tr>
            <th>Time (UTC)</th>
            <th>SST (${units.sea_surface_temperature||""})</th>
            <th>Wave H (${units.wave_height||""})</th>
            <th>Wave Dir (${units.wave_direction||""})</th>
            <th>Wave Per (${units.wave_period||""})</th>
            <th>Swell H (${units.swell_wave_height||""})</th>
            <th>Swell Dir (${units.swell_wave_direction||""})</th>
            <th>Swell Per (${units.swell_wave_period||""})</th>
            <th>WindWave H (${units.wind_wave_height||""})</th>
            <th>WindWave Dir (${units.wind_wave_direction||""})</th>
            <th>WindWave Per (${units.wind_wave_period||""})</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="11">-</td></tr>`}
        </tbody>
      </table>
      </div>
    `;
    return;
  }
  // Fallback to summary view if arrays missing
  container.innerHTML = `
    <h4 style="color:#ffd700;">Oceanographic</h4>
    <table class="data-table" aria-label="Oceanographic Data">
      <tbody>
        <tr><th>Timestamp (UTC)</th><td>${display(data?.timeISO)}</td></tr>
        <tr><th>Sea Surface Temperature</th><td>${display(data?.seaSurfaceTemperatureC, data?.seaSurfaceTemperatureC?" °C":"")}</td></tr>
        <tr><th>Significant Wave Height</th><td>${display(data?.waveHeightM, data?.waveHeightM?" m":"")}</td></tr>
      </tbody>
    </table>
  `;
}

function renderFisheries(container, data) {
  container.innerHTML = `
    <h4 style="color:#ffd700;">Fisheries</h4>
    <table class="data-table" aria-label="Fisheries Data">
      <tbody>
        <tr><th>Predicted Catch Index</th><td>${display(data.predictedCatchIndex)}</td></tr>
        <tr><th>Dominant Species</th><td>${display(data.dominantSpecies)}</td></tr>
        <tr><th>Habitat Suitability</th><td>${display(data.habitatSuitability, data.habitatSuitability?"%":"")}</td></tr>
        <tr><th>Advisory</th><td>${display(data.advisories)}</td></tr>
        <tr><th>Total Fish Occurrences (OBIS)</th><td>${display(data.totalFishOccurrences)}</td></tr>
        <tr><th>Total Fish Occurrences (GBIF)</th><td>${display(data.totalFishOccurrencesGbif)}</td></tr>
        <tr><th>Total Fish Occurrences (Combined)</th><td>${display(data.totalFishOccurrencesCombined)}</td></tr>
        <tr><th>Sample Species</th><td>${display(Array.isArray(data.sampleSpecies)?data.sampleSpecies.join(", ") : data.sampleSpecies)}</td></tr>
      </tbody>
    </table>
    <table class="data-table" aria-label="Fish Occurrences (OBIS)">
      <thead><tr><th>Scientific Name</th><th>Date</th><th>Depth (m)</th></tr></thead>
      <tbody>
        ${(Array.isArray(data.fishOccurrences)?data.fishOccurrences:[]).map(r=>
          `<tr><td>${display(r.scientificName)}</td><td>${display(r.eventDate)}</td><td>${display(r.minimumDepthInMeters)}</td></tr>`
        ).join("") || `<tr><td colspan="3">-</td></tr>`}
      </tbody>
    </table>
    <table class="data-table" aria-label="Fish Occurrences (GBIF)">
      <thead><tr><th>Scientific Name</th><th>Date</th><th>Depth (m)</th></tr></thead>
      <tbody>
        ${(Array.isArray(data.fishOccurrencesGbif)?data.fishOccurrencesGbif:[]).map(r=>
          `<tr><td>${display(r.scientificName)}</td><td>${display(r.eventDate)}</td><td>${display(r.minimumDepthInMeters)}</td></tr>`
        ).join("") || `<tr><td colspan="3">-</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderMolecular(container, data) {
  container.innerHTML = `
    <h4 style="color:#ffd700;">Molecular Biodiversity</h4>
    <table class="data-table" aria-label="Molecular Biodiversity Data">
      <tbody>
        <tr><th>eDNA Diversity Index</th><td>${display(data.eDnaDiversityIndex)}</td></tr>
        <tr><th>Potential Taxa Detected</th><td>${display(data.potentialTaxaDetected)}</td></tr>
        <tr><th>Invasive Risk</th><td>${display(data.invasiveRisk)}</td></tr>
        <tr><th>Marker Genes</th><td>${display(Array.isArray(data.markerGenes)?data.markerGenes.join(", ") : data.markerGenes)}</td></tr>
        <tr><th>Total Occurrences (OBIS)</th><td>${display(data.totalOccurrences)}</td></tr>
        <tr><th>Top Families</th><td>${display(Array.isArray(data.topFamilies)?data.topFamilies.join(", ") : data.topFamilies)}</td></tr>
        <tr><th>Top Genera</th><td>${display(Array.isArray(data.topGenera)?data.topGenera.join(", ") : data.topGenera)}</td></tr>
      </tbody>
    </table>
    <table class="data-table" aria-label="Occurrences">
      <thead><tr><th>Scientific Name</th><th>Date</th><th>Depth (m)</th></tr></thead>
      <tbody>
        ${(Array.isArray(data.occurrences)?data.occurrences:[]).map(r=>
          `<tr><td>${display(r.scientificName)}</td><td>${display(r.eventDate)}</td><td>${display(r.minimumDepthInMeters)}</td></tr>`
        ).join("") || `<tr><td colspan="3">-</td></tr>`}
      </tbody>
    </table>
  `;
}

function parseCoordsFromInputs() {
  const lonInput = document.getElementById("longitude");
  const latInput = document.getElementById("latitude");
  if (!lonInput || !latInput) return null;
  const lon = parseFloat(lonInput.value);
  const lat = parseFloat(latInput.value);
  if (Number.isNaN(lon) || Number.isNaN(lat)) return null;
  const normalized = normalizeCoordsMaybeSwap(lat, lon);
  return {
    longitude: normalized.longitude,
    latitude: normalized.latitude,
  };
}

function setNavLinksWithCoords(latitude, longitude) {
  const links = {
    oceanographic: document.querySelector('nav a[href^="oceanographic.html"]'),
    fisheries: document.querySelector('nav a[href^="fisheries.html"]'),
    molecular: document.querySelector('nav a[href^="molecular-biodiversity.html"]'),
  };
  const query = `?lat=${encodeURIComponent(formatCoord(latitude))}&lon=${encodeURIComponent(formatCoord(longitude))}`;
  if (links.oceanographic) links.oceanographic.href = `oceanographic.html${query}`;
  if (links.fisheries) links.fisheries.href = `fisheries.html${query}`;
  if (links.molecular) links.molecular.href = `molecular-biodiversity.html${query}`;
}

// -----------------------------
// Main page: Explore button
// -----------------------------
const exploreButton = document.getElementById("exploreBtn");

if (exploreButton) {
  exploreButton.addEventListener("click", async () => {
    const coords = parseCoordsFromInputs();
    if (!coords) {
      alert("Please enter valid Longitude and Latitude.");
      return;
    }

    const { latitude, longitude } = coords;
    try {
      localStorage.setItem("selectedCoords", JSON.stringify({ latitude, longitude }));
    } catch {}
    const query = `?lat=${encodeURIComponent(formatCoord(latitude))}&lon=${encodeURIComponent(formatCoord(longitude))}`;
    window.location.href = `oceanographic.html${query}`;
  });
}

// -----------------------------
// Detail pages: render by query
// -----------------------------
function getCoordsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get("lat"));
  const lon = parseFloat(params.get("lon"));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const normalized = normalizeCoordsMaybeSwap(lat, lon);
  return { latitude: normalized.latitude, longitude: normalized.longitude };
}

async function renderDetailPage() {
  const pageId = document.body.getAttribute("data-page");
  if (!pageId) return;
  // Reset to defaults on refresh: ignore localStorage and rely only on URL
  let coords = getCoordsFromQuery();
  const target = document.getElementById("detail-content");
  if (target) {
    target.innerHTML = `<p style="color:#f0f0f0;">Loading data...</p>`;
  }
  if (!coords) {
    if (!target) return;
    if (pageId === "oceanographic") {
      renderOceanographic(target, {});
    } else if (pageId === "fisheries") {
      renderFisheries(target, {});
    } else if (pageId === "molecular") {
      renderMolecular(target, {});
    }
    return;
  }

  if (coords) {
    try { localStorage.setItem("selectedCoords", JSON.stringify(coords)); } catch {}
    setNavLinksWithCoords(coords.latitude, coords.longitude);
  }
  const data = coords ? await getLiveOrMockData(coords.latitude, coords.longitude) : { oceanographic:{}, fisheries:{}, molecular:{} };

  if (!target) return;

  if (pageId === "oceanographic") {
    renderOceanographic(target, data.oceanographic);
    try {
      const h = data.oceanographic?.hourly;
      if (h && Array.isArray(h.time)) {
        const times = h.time;
        const sst = h.sea_surface_temperature || [];
        const waveH = h.wave_height || [];
        const swellH = h.swell_wave_height || [];
        const ctxSst = document.getElementById("chart-sst");
        const ctxWave = document.getElementById("chart-wave");
        const ctxSwell = document.getElementById("chart-swell");
        if (ctxSst && window.Chart) new Chart(ctxSst, { type: 'line', data: { labels: times, datasets: [{ label: 'SST (°C)', data: sst, borderColor: '#ffcc00', backgroundColor: 'rgba(255,204,0,0.2)', tension: 0.2 }]}, options: { plugins:{legend:{labels:{color:'#fff'}}}, scales:{x:{ticks:{color:'#ccc'}}, y:{ticks:{color:'#ccc'}}}} });
        if (ctxWave && window.Chart) new Chart(ctxWave, { type: 'line', data: { labels: times, datasets: [{ label: 'Wave Height (m)', data: waveH, borderColor: '#00bfff', backgroundColor: 'rgba(0,191,255,0.2)', tension: 0.2 }]}, options: { plugins:{legend:{labels:{color:'#fff'}}}, scales:{x:{ticks:{color:'#ccc'}}, y:{ticks:{color:'#ccc'}}}} });
        if (ctxSwell && window.Chart) new Chart(ctxSwell, { type: 'line', data: { labels: times, datasets: [{ label: 'Swell Height (m)', data: swellH, borderColor: '#66ff99', backgroundColor: 'rgba(102,255,153,0.2)', tension: 0.2 }]}, options: { plugins:{legend:{labels:{color:'#fff'}}}, scales:{x:{ticks:{color:'#ccc'}}, y:{ticks:{color:'#ccc'}}}} });
      }
    } catch {}
  } else if (pageId === "fisheries") {
    renderFisheries(target, data.fisheries);
    try {
      const fish = data.fisheries || {};
      const countsCtx = document.getElementById("chart-fish-counts");
      const topCtx = document.getElementById("chart-species-top");
      if (countsCtx && window.Chart) new Chart(countsCtx, { type: 'bar', data: { labels: ['OBIS','GBIF','Combined'], datasets: [{ label: 'Fish Occurrences', data: [fish.totalFishOccurrences||0, fish.totalFishOccurrencesGbif||0, fish.totalFishOccurrencesCombined||0], backgroundColor: ['#00bfff','#ff6384','#ffd700'] }]}, options: { plugins:{legend:{labels:{color:'#fff'}}}, scales:{x:{ticks:{color:'#ccc'}}, y:{ticks:{color:'#ccc'}}}} });
      if (topCtx && window.Chart) {
        const labels = (Array.isArray(fish.sampleSpecies)?fish.sampleSpecies:[]).slice(0,5);
        const dataVals = labels.map(()=>1);
        new Chart(topCtx, { type: 'pie', data: { labels, datasets: [{ data: dataVals, backgroundColor: ['#ff6384','#36a2eb','#ffcd56','#4bc0c0','#9966ff'] }]}, options: { plugins:{legend:{labels:{color:'#fff'}}} } });
      }
    } catch {}
  } else if (pageId === "molecular") {
    renderMolecular(target, data.molecular);
    try {
      const mol = data.molecular || {};
      const occCtx = document.getElementById("chart-occurrences");
      const famCtx = document.getElementById("chart-families");
      if (occCtx && window.Chart) new Chart(occCtx, { type: 'bar', data: { labels: ['Occurrences'], datasets: [{ label: 'Total', data: [mol.totalOccurrences||0], backgroundColor: ['#66ff99'] }]}, options: { plugins:{legend:{labels:{color:'#fff'}}}, scales:{x:{ticks:{color:'#ccc'}}, y:{ticks:{color:'#ccc'}}}} });
      if (famCtx && window.Chart) {
        const topFamilies = Array.isArray(mol.topFamilies) ? mol.topFamilies : [];
        const labels = topFamilies.map(s => String(s).split(' (')[0]);
        const values = topFamilies.map(s => { const m = String(s).match(/\((\d+)\)/); return m?Number(m[1]):1; });
        new Chart(famCtx, { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: ['#ffd700','#00bfff','#ff6384','#36a2eb','#4bc0c0'] }]}, options: { plugins:{legend:{labels:{color:'#fff'}}} } });
      }
    } catch {}
  }
}

renderDetailPage();