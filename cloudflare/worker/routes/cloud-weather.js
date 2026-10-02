/**
 * cloudflare/worker/routes/cloud-weather.js
 * Shadow Reaper Cloud API — Weather Route Handler
 *
 * Build: SR-CLOUD-INTERNET-1
 *
 * GET /api/v1/weather?location=Austin&units=imperial
 * GET /api/v1/weather?lat=30.267&lon=-97.743&units=imperial
 *
 * Public route (no Firebase auth required) — weather data is not private.
 * Proxies Open-Meteo (free, no API key required).
 *
 * SECURITY:
 *   - Validates and sanitizes all query parameters
 *   - Response is structured data only — no raw HTML, no arbitrary content
 *   - Result size bounded to ~2 KB
 *   - Fetch timeout: 8 seconds
 *   - Rate limited by cloud-rate-limiter.js
 *   - Weather data is TEMPORARY — never permanently stored
 *
 * DESIGN:
 *   Weather data flows into ShadowReaper context as a formatted snippet.
 *   Shadow composes the natural-language response.
 *   This route is a data tool — NOT Shadow's brain.
 */

'use strict';

import { buildError, buildSuccess } from '../lib/cloud-errors.js';

const GEOCODE_URL  = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS   = 8000;
const MAX_LOC_LEN  = 100;

// WMO Weather interpretation codes (open-meteo.com/en/docs)
const WMO = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

function _windDir(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function _fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Geocode a location name via Open-Meteo geocoding.
 * Returns { name, region, country, latitude, longitude, timezone } or null.
 */
async function _geocode(location) {
  const url = GEOCODE_URL + '?name=' + encodeURIComponent(location) +
              '&count=1&language=en&format=json';
  const resp = await _fetchWithTimeout(url, TIMEOUT_MS);
  const data = await resp.json();
  if (!data || !data.results || !data.results.length) return null;
  const r = data.results[0];
  return {
    name:      r.name,
    region:    r.admin1 || '',
    country:   r.country_code || r.country || '',
    latitude:  r.latitude,
    longitude: r.longitude,
    timezone:  r.timezone || 'auto',
  };
}

/**
 * Fetch forecast from Open-Meteo for given coordinates.
 */
async function _fetchForecast(lat, lon, timezone, units) {
  const isMetric   = units === 'metric';
  const tempUnit   = isMetric ? 'celsius' : 'fahrenheit';
  const windUnit   = isMetric ? 'kmh'     : 'mph';
  const precUnit   = isMetric ? 'mm'      : 'inch';

  const url = FORECAST_URL +
    '?latitude='   + lat +
    '&longitude='  + lon +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,' +
      'precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,sunrise,sunset' +
    '&temperature_unit=' + tempUnit +
    '&wind_speed_unit='  + windUnit +
    '&precipitation_unit=' + precUnit +
    '&timezone=' + encodeURIComponent(timezone || 'auto') +
    '&forecast_days=3';

  const resp = await _fetchWithTimeout(url, TIMEOUT_MS);
  return resp.json();
}

/**
 * Build a structured weather result object from Open-Meteo response.
 */
function _buildResult(geo, data, units) {
  const c  = data.current;
  const d  = data.daily;
  const cu = units === 'metric' ? '°C' : '°F';
  const wu = units === 'metric' ? 'km/h' : 'mph';

  const condition = WMO[c.weather_code] || ('Code ' + c.weather_code);
  const locLabel  = geo.name +
                    (geo.region  ? ', ' + geo.region  : '') +
                    (geo.country ? ' (' + geo.country + ')' : '');

  // Build formatted text for Shadow's context injection
  const lines = [
    'Weather for ' + locLabel + ':',
    condition + ', ' + Math.round(c.temperature_2m) + cu +
      ' (feels like ' + Math.round(c.apparent_temperature) + cu + ')',
    'Humidity: ' + c.relative_humidity_2m + '%  |  ' +
      'Wind: ' + Math.round(c.wind_speed_10m) + ' ' + wu + ' ' +
      _windDir(c.wind_direction_10m),
  ];

  if (d && d.temperature_2m_max && d.temperature_2m_max[0] !== undefined) {
    lines.push(
      'Today: High ' + Math.round(d.temperature_2m_max[0]) + cu +
      ', Low '  + Math.round(d.temperature_2m_min[0]) + cu
    );
  }

  if (d && d.precipitation_sum && d.precipitation_sum[0] > 0) {
    const precUnit = units === 'metric' ? ' mm' : ' in';
    lines.push('Precipitation today: ' + d.precipitation_sum[0].toFixed(2) + precUnit);
  }

  if (d && d.temperature_2m_max && d.temperature_2m_max[1] !== undefined) {
    const tmrCond = WMO[d.weather_code[1]] || 'Unknown';
    lines.push(
      'Tomorrow: ' + tmrCond +
      ', High ' + Math.round(d.temperature_2m_max[1]) + cu +
      ', Low '  + Math.round(d.temperature_2m_min[1]) + cu
    );
  }

  return {
    location:    locLabel,
    condition:   condition,
    temperature: Math.round(c.temperature_2m),
    feelsLike:   Math.round(c.apparent_temperature),
    humidity:    c.relative_humidity_2m,
    wind:        { speed: Math.round(c.wind_speed_10m), direction: _windDir(c.wind_direction_10m) },
    formatted:   lines.join('\n'),
    retrievedAt: new Date().toISOString(),
    source:      'Open-Meteo (open-meteo.com)',
    trusted:     true,
  };
}

/**
 * Handle GET /api/v1/weather
 *
 * Query params:
 *   location  — city/location name (required unless lat+lon provided)
 *   lat, lon  — explicit coordinates (optional, bypasses geocoding)
 *   units     — 'imperial' (default) or 'metric'
 *
 * @param {URL}    url
 * @param {object} ctx  { requestId }
 * @returns {{ status, body }}
 */
export async function handleWeather(url, ctx) {
  const params   = url.searchParams;
  const location = (params.get('location') || '').trim().slice(0, MAX_LOC_LEN);
  const latStr   = params.get('lat')      || '';
  const lonStr   = params.get('lon')      || '';
  const units    = params.get('units') === 'metric' ? 'metric' : 'imperial';

  let geo = null;

  // ── Path 1: explicit lat/lon ───────────────────────────────────────────────
  if (latStr && lonStr) {
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return { status: 400, body: buildError('INVALID_REQUEST', ctx.requestId, 'Invalid lat/lon.') };
    }
    geo = { name: location || 'Your location', region: '', country: '', latitude: lat, longitude: lon, timezone: 'auto' };

  // ── Path 2: location name (geocode) ────────────────────────────────────────
  } else if (location) {
    // Basic sanity check: location must look like text, not code/injection
    if (!/^[A-Za-z][A-Za-z0-9\s,\.\-\']{0,99}$/.test(location)) {
      return { status: 400, body: buildError('INVALID_REQUEST', ctx.requestId, 'Invalid location format.') };
    }

    try {
      geo = await _geocode(location);
    } catch (e) {
      return { status: 503, body: buildError('SERVICE_UNAVAILABLE', ctx.requestId, 'Geocoding unavailable.') };
    }

    if (!geo) {
      return {
        status: 200,
        body: {
          ok:          false,
          error:       { code: 'LOCATION_NOT_FOUND', message: 'Location not found: ' + location },
          requestId:   ctx.requestId,
        },
      };
    }

  } else {
    // No location provided — tell Shadow to ask the user
    return {
      status: 200,
      body: {
        ok:            false,
        error:         { code: 'LOCATION_REQUIRED', message: 'No location provided. Ask the user which city to check.' },
        needsLocation: true,
        requestId:     ctx.requestId,
      },
    };
  }

  // ── Fetch forecast ─────────────────────────────────────────────────────────
  let forecastData;
  try {
    forecastData = await _fetchForecast(geo.latitude, geo.longitude, geo.timezone, units);
  } catch (e) {
    return { status: 503, body: buildError('SERVICE_UNAVAILABLE', ctx.requestId, 'Weather fetch timed out or failed.') };
  }

  if (!forecastData || !forecastData.current) {
    return { status: 503, body: buildError('SERVICE_UNAVAILABLE', ctx.requestId, 'Weather data empty.') };
  }

  const result = _buildResult(geo, forecastData, units);

  return {
    status: 200,
    body: {
      ok:        true,
      weather:   result,
      requestId: ctx.requestId,
    },
  };
}
