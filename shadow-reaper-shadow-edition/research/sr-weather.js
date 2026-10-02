/**
 * shadow-reaper-shadow-edition/research/sr-weather.js
 * Shadow Reaper — Weather Tool
 *
 * Build: SR-WEATHER-1
 *
 * Exposes: window.SRWeather
 *
 * PURPOSE:
 *   Provides live weather data to Shadow Reaper via the Open-Meteo API.
 *   Open-Meteo is a free weather API — no API key required.
 *
 *   Flow:
 *     1. Extract location from query text (or use stored preference)
 *     2. Geocode location using Open-Meteo Geocoding API
 *     3. Fetch current conditions from Open-Meteo Forecast API
 *     4. Format results as human-readable context for Shadow Reaper
 *
 * SECURITY:
 *   - No API key required (Open-Meteo is free and open)
 *   - Only external calls are to api.open-meteo.com and geocoding.open-meteo.com
 *   - Results cached for 15 minutes (weather changes slowly)
 *   - No private data is sent to the weather API
 *   - Location is extracted from user message only — never read from device GPS
 *     without explicit user intent
 *
 * LIMITATIONS:
 *   - Requires fetch() (all modern browsers + Node 18+)
 *   - Requires network access
 *   - If location cannot be determined, responds asking for location
 *   - Does NOT provide forecast beyond 7 days
 *
 * ONE-BRAIN RULE:
 *   This is a TOOL. Results are fed into ShadowReaper's pipeline.
 *   It does NOT create a separate WeatherBrain.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-WEATHER-1';

  // ─── Configuration ────────────────────────────────────────────────────────────
  var _CONFIG = {
    geocodeUrl:     'https://geocoding-api.open-meteo.com/v1/search',
    forecastUrl:    'https://api.open-meteo.com/v1/forecast',
    cacheMinutes:   15,
    timeoutMs:      8000,
    maxQueryLength: 200,
  };

  // ─── State ────────────────────────────────────────────────────────────────────
  var _cache = {};           // key → { result, expiresAt }
  var _lastLocation = null;  // last successfully resolved location (for follow-ups)

  // ─── WMO Weather Code descriptions ────────────────────────────────────────────
  // https://open-meteo.com/en/docs — WMO Weather interpretation codes
  var _WMO = {
    0: 'Clear sky',
    1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing rime fog',
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

  // ─── Location extraction patterns ─────────────────────────────────────────────
  // Extracts location names from natural-language weather queries.
  var _LOC_PATTERNS = [
    /\bweather\s+(?:in|at|for|near|around)\s+([A-Za-z][A-Za-z\s,\.]{1,40}?)(?:\s*[\?\.,!]|$)/i,
    /\bforecast\s+(?:in|at|for|near)\s+([A-Za-z][A-Za-z\s,\.]{1,40}?)(?:\s*[\?\.,!]|$)/i,
    /\b(?:in|at|for|near)\s+([A-Za-z][A-Za-z\s,\.]{1,40}?)\s+(?:today|tonight|tomorrow|this\s+week)\b/i,
    /\b([A-Za-z][A-Za-z\s,\.]{1,40}?)\s+weather\b/i,
    /\b([A-Za-z][A-Za-z\s,\.]{1,40}?)\s+forecast\b/i,
    /\b([A-Za-z][A-Za-z\s,\.]{1,40}?)\s+temperature\b/i,
  ];

  // Words that are NOT locations (to avoid false positives)
  var _NOT_LOCATIONS = new Set([
    'the', 'a', 'an', 'my', 'your', 'our', 'their', 'this', 'that', 'what',
    'today', 'tonight', 'tomorrow', 'current', 'latest', 'outside', 'local',
    'like', 'is', 'will', 'be', 'now', 'hot', 'cold', 'warm', 'sunny', 'rainy',
    'how', 'what', 'where', 'when', 'which', 'does',
  ]);

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function _extractLocation(text) {
    if (!text) return null;
    for (var i = 0; i < _LOC_PATTERNS.length; i++) {
      var m = text.match(_LOC_PATTERNS[i]);
      if (m && m[1]) {
        var loc = m[1].trim().replace(/[,\.!?]+$/, '').trim();
        // Reject single stopwords
        var words = loc.toLowerCase().split(/\s+/);
        if (words.length === 1 && _NOT_LOCATIONS.has(words[0])) continue;
        if (loc.length >= 2 && loc.length <= 60) return loc;
      }
    }
    return null;
  }

  function _cacheKey(location) {
    return location.toLowerCase().trim().slice(0, 80);
  }

  function _getCached(location) {
    var key = _cacheKey(location);
    var entry = _cache[key];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete _cache[key];
      return null;
    }
    return entry.result;
  }

  function _setCached(location, result) {
    var key = _cacheKey(location);
    _cache[key] = {
      result:    result,
      expiresAt: Date.now() + _CONFIG.cacheMinutes * 60 * 1000,
    };
  }

  function _fetchWithTimeout(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, timeoutMs || _CONFIG.timeoutMs);

      (global.fetch || window.fetch)(url)
        .then(function (r) {
          clearTimeout(timer);
          if (!done) { done = true; resolve(r); }
        })
        .catch(function (e) {
          clearTimeout(timer);
          if (!done) { done = true; reject(e); }
        });
    });
  }

  // ─── Wind direction ───────────────────────────────────────────────────────────
  function _windDir(degrees) {
    var dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(degrees / 45) % 8];
  }

  // ─── Geocode a location name ──────────────────────────────────────────────────
  function _geocode(locationName, callback) {
    var url = _CONFIG.geocodeUrl + '?name=' + encodeURIComponent(locationName) + '&count=1&language=en&format=json';

    _fetchWithTimeout(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.results || !data.results.length) {
          callback(null, 'location_not_found');
          return;
        }
        var r = data.results[0];
        callback({
          name:      r.name,
          country:   r.country_code || r.country || '',
          region:    r.admin1 || '',
          latitude:  r.latitude,
          longitude: r.longitude,
          timezone:  r.timezone || 'auto',
        }, null);
      })
      .catch(function (e) {
        callback(null, 'geocode_failed: ' + (e.message || e));
      });
  }

  // ─── Fetch weather for geocoded location ─────────────────────────────────────
  function _fetchWeather(geo, callback) {
    var url = _CONFIG.forecastUrl +
      '?latitude='  + geo.latitude +
      '&longitude=' + geo.longitude +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,sunrise,sunset' +
      '&temperature_unit=fahrenheit' +
      '&wind_speed_unit=mph' +
      '&precipitation_unit=inch' +
      '&timezone=' + encodeURIComponent(geo.timezone || 'auto') +
      '&forecast_days=3';

    _fetchWithTimeout(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.current) {
          callback(null, 'weather_data_empty');
          return;
        }
        callback(data, null);
      })
      .catch(function (e) {
        callback(null, 'weather_fetch_failed: ' + (e.message || e));
      });
  }

  // ─── Format weather result as human-readable text ─────────────────────────────
  function _format(geo, data) {
    var c = data.current;
    var cu = data.current_units || {};
    var d = data.daily;
    var du = data.daily_units || {};

    var condition = _WMO[c.weather_code] || ('Code ' + c.weather_code);
    var temp     = Math.round(c.temperature_2m);
    var feels    = Math.round(c.apparent_temperature);
    var humidity = c.relative_humidity_2m;
    var windSpd  = Math.round(c.wind_speed_10m);
    var windDir  = _windDir(c.wind_direction_10m);

    var locLabel = geo.name + (geo.region ? ', ' + geo.region : '') + (geo.country ? ' (' + geo.country + ')' : '');

    var lines = [
      'Weather for ' + locLabel + ':',
      condition + ', ' + temp + '°F (feels like ' + feels + '°F)',
      'Humidity: ' + humidity + '%  |  Wind: ' + windSpd + ' mph ' + windDir,
    ];

    // Today's high/low
    if (d && d.temperature_2m_max && d.temperature_2m_max[0] !== undefined) {
      lines.push('Today: High ' + Math.round(d.temperature_2m_max[0]) + '°F, Low ' + Math.round(d.temperature_2m_min[0]) + '°F');
    }

    // Precipitation today
    if (d && d.precipitation_sum && d.precipitation_sum[0] > 0) {
      lines.push('Precipitation today: ' + d.precipitation_sum[0].toFixed(2) + ' in');
    }

    // Tomorrow forecast
    if (d && d.temperature_2m_max && d.temperature_2m_max[1] !== undefined) {
      var tmrCond = _WMO[d.weather_code[1]] || 'Unknown';
      lines.push('Tomorrow: ' + tmrCond + ', High ' + Math.round(d.temperature_2m_max[1]) + '°F, Low ' + Math.round(d.temperature_2m_min[1]) + '°F');
    }

    return lines.join('\n');
  }

  // ─── Public API: query(text, callback) ────────────────────────────────────────
  /**
   * query(text, callback)
   *
   * Processes a weather query from text.
   * Extracts location, geocodes, fetches weather.
   *
   * callback(result):
   *   result.ok:         boolean
   *   result.location:   string (resolved location name)
   *   result.formatted:  string (human-readable weather text for context injection)
   *   result.raw:        object (raw Open-Meteo data)
   *   result.reason:     string (if !ok)
   *   result.needsLocation: boolean (true if no location found in text)
   */
  function query(text, callback) {
    callback = callback || function () {};

    if (!text || typeof text !== 'string') {
      callback({ ok: false, reason: 'empty_query', needsLocation: true });
      return;
    }

    // Check fetch availability
    var fetchFn = (typeof global.fetch === 'function') ? global.fetch :
                  (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch : null;
    if (!fetchFn) {
      callback({ ok: false, reason: 'fetch_unavailable' });
      return;
    }

    // Extract location
    var location = _extractLocation(text) || _lastLocation;
    if (!location) {
      callback({ ok: false, reason: 'location_needed', needsLocation: true });
      return;
    }

    // Check cache
    var cached = _getCached(location);
    if (cached) {
      callback(Object.assign({}, cached, { cached: true }));
      return;
    }

    // Geocode → fetch weather
    _geocode(location, function (geo, geoErr) {
      if (geoErr || !geo) {
        callback({ ok: false, reason: geoErr || 'geocode_failed', location: location });
        return;
      }

      _fetchWeather(geo, function (data, wxErr) {
        if (wxErr || !data) {
          callback({ ok: false, reason: wxErr || 'weather_failed', location: location });
          return;
        }

        var formatted = _format(geo, data);
        var locLabel  = geo.name + (geo.region ? ', ' + geo.region : '');

        // Update last known location for follow-up queries
        _lastLocation = location;

        var result = {
          ok:        true,
          location:  locLabel,
          formatted: formatted,
          raw:       data,
          reason:    'weather_retrieved',
          cached:    false,
        };

        _setCached(location, result);
        callback(result);
      });
    });
  }

  // ─── isReady() ────────────────────────────────────────────────────────────────
  function isReady() {
    // Weather is available if fetch is available (Open-Meteo requires no API key)
    return typeof fetch === 'function' ||
           (typeof window !== 'undefined' && typeof window.fetch === 'function');
  }

  // ─── clearCache() ─────────────────────────────────────────────────────────────
  function clearCache() {
    _cache = {};
  }

  // ─── getStatus() ─────────────────────────────────────────────────────────────
  function getStatus() {
    return {
      build:         BUILD_ID,
      ready:         isReady(),
      cacheEntries:  Object.keys(_cache).length,
      lastLocation:  _lastLocation,
      config:        Object.assign({}, _CONFIG),
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────
  global.SRWeather = {
    build:           BUILD_ID,

    isReady:         isReady,
    query:           query,
    clearCache:      clearCache,
    getStatus:       getStatus,

    // Exposed for testing
    _extractLocation: _extractLocation,
    _WMO:             _WMO,
    CONFIG:           Object.assign({}, _CONFIG),
  };

})(typeof window !== 'undefined' ? window : global);
