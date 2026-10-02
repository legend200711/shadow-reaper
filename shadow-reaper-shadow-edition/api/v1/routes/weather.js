/**
 * shadow-reaper-shadow-edition/api/v1/routes/weather.js
 * Shadow Reaper API v1 — POST /api/v1/weather
 *
 * Build: SR-API-WEATHER-1
 *
 * Proxies weather requests to Open-Meteo (free, no API key required).
 *
 * When deployed as a Cloudflare Worker, this route:
 *   - Geocodes the location using Open-Meteo Geocoding API
 *   - Fetches current conditions from Open-Meteo Forecast API
 *   - Returns formatted results to the client
 *
 * The client (sr-weather.js) calls Open-Meteo directly in the browser.
 * This server-side route exists for:
 *   1. Future API key-based providers that require server-side secrets
 *   2. Caching at the edge (Cloudflare Workers KV)
 *   3. Consistent fallback path
 *
 * INPUT (POST body):
 *   { location: string }
 *
 * OUTPUT:
 *   { ok, location, formatted, raw?, requestId }
 *
 * SECURITY:
 *   - No secret required (Open-Meteo is public)
 *   - Location string is validated (no SSRF possible — goes to api.open-meteo.com)
 *   - No user data is stored or logged
 */

'use strict';

var { buildError } = require('../lib/errors');

var GEOCODE_URL  = 'https://geocoding-api.open-meteo.com/v1/search';
var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// ── WMO codes ────────────────────────────────────────────────────────────────
var WMO = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm',
};

function _windDir(deg) {
  var dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Handle POST /api/v1/weather
 */
async function handleWeather(body, ctx) {
  var requestId = ctx.requestId;

  if (!body || !body.location || typeof body.location !== 'string' || !body.location.trim()) {
    return {
      status: 400,
      body:   buildError('INVALID_REQUEST', requestId, 'location is required'),
    };
  }

  var location = body.location.trim().slice(0, 120);

  try {
    // 1. Geocode
    var geoUrl  = GEOCODE_URL + '?name=' + encodeURIComponent(location) + '&count=1&language=en&format=json';
    var geoResp = await fetch(geoUrl);
    if (!geoResp.ok) throw new Error('geocode_failed');
    var geoData = await geoResp.json();
    if (!geoData || !geoData.results || !geoData.results.length) {
      return {
        status: 200,
        body: {
          ok:        false,
          reason:    'location_not_found',
          location:  location,
          requestId: requestId,
        },
      };
    }
    var geo = geoData.results[0];

    // 2. Fetch weather
    var wxUrl = FORECAST_URL +
      '?latitude='  + geo.latitude +
      '&longitude=' + geo.longitude +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code' +
      '&temperature_unit=fahrenheit' +
      '&wind_speed_unit=mph' +
      '&precipitation_unit=inch' +
      '&timezone=auto' +
      '&forecast_days=3';

    var wxResp = await fetch(wxUrl);
    if (!wxResp.ok) throw new Error('weather_fetch_failed');
    var wxData = await wxResp.json();
    if (!wxData || !wxData.current) throw new Error('weather_data_empty');

    // 3. Format
    var c = wxData.current;
    var d = wxData.daily;
    var condition = WMO[c.weather_code] || ('Code ' + c.weather_code);
    var locLabel  = geo.name + (geo.admin1 ? ', ' + geo.admin1 : '') + (geo.country_code ? ' (' + geo.country_code + ')' : '');
    var lines = [
      'Weather for ' + locLabel + ':',
      condition + ', ' + Math.round(c.temperature_2m) + '°F (feels like ' + Math.round(c.apparent_temperature) + '°F)',
      'Humidity: ' + c.relative_humidity_2m + '%  |  Wind: ' + Math.round(c.wind_speed_10m) + ' mph ' + _windDir(c.wind_direction_10m),
    ];
    if (d && d.temperature_2m_max && d.temperature_2m_max[0] !== undefined) {
      lines.push('Today: High ' + Math.round(d.temperature_2m_max[0]) + '°F, Low ' + Math.round(d.temperature_2m_min[0]) + '°F');
    }
    if (d && d.temperature_2m_max && d.temperature_2m_max[1] !== undefined) {
      var tmrCond = WMO[d.weather_code[1]] || 'Unknown';
      lines.push('Tomorrow: ' + tmrCond + ', High ' + Math.round(d.temperature_2m_max[1]) + '°F, Low ' + Math.round(d.temperature_2m_min[1]) + '°F');
    }

    return {
      status: 200,
      body: {
        ok:        true,
        location:  locLabel,
        formatted: lines.join('\n'),
        requestId: requestId,
      },
    };

  } catch (e) {
    return {
      status: 200,
      body: {
        ok:        false,
        reason:    'weather_failed',
        location:  location,
        requestId: requestId,
      },
    };
  }
}

module.exports = { handleWeather: handleWeather };
