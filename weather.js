// weather.js — Fetches real ocean weather data and maps to simulation parameters

var OceanWeather = (function () {
    'use strict';

    var G = 9.81;
    var TWO_PI = 2 * Math.PI;
    var FETCH_INTERVAL = 15 * 60 * 1000; // 15 minutes

    // Simulation parameter bounds (mirrors shared.js)
    var MIN_WIND_SPEED = 5.0, MAX_WIND_SPEED = 25.0;
    var MIN_SIZE = 100, MAX_SIZE = 1000;
    var MIN_CHOPPINESS = 0, MAX_CHOPPINESS = 2.5;

    function clamp(x, min, max) {
        return Math.min(Math.max(x, min), max);
    }

    // Default location (used when no URL params provided)
    var DEFAULT_LOCATION = { name: 'Santa Cruz, CA', lat: 36.96, lng: -122.02 };

    var currentLocation = DEFAULT_LOCATION;
    var weatherData = null;
    var fetchTimer = null;
    var onDataCallback = null;

    // --- API Fetching ---

    function fetchWeatherData(location) {
        var marineUrl = 'https://marine-api.open-meteo.com/v1/marine' +
            '?latitude=' + location.lat +
            '&longitude=' + location.lng +
            '&hourly=wave_height,wave_direction,wave_period,' +
            'wind_wave_height,wind_wave_period,' +
            'swell_wave_height,swell_wave_period,' +
            'sea_surface_temperature' +
            '&forecast_days=1&timeformat=unixtime';

        var windUrl = 'https://api.open-meteo.com/v1/forecast' +
            '?latitude=' + location.lat +
            '&longitude=' + location.lng +
            '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code' +
            '&forecast_days=1&timeformat=unixtime';

        // Find nearest NOAA station for tide data
        var tideStation = findNearestStation(location.lat, location.lng);
        var tideFetch = tideStation ? fetchTideData(tideStation) : Promise.resolve(null);

        return Promise.all([
            fetch(marineUrl).then(function (r) { return r.json(); }),
            fetch(windUrl).then(function (r) { return r.json(); }),
            tideFetch
        ]).then(function (results) {
            var marine = results[0];
            var wind = results[1];
            var tideResult = results[2];

            weatherData = {
                marine: marine.hourly,
                wind: wind.hourly,
                times: marine.hourly.time,
                tide: tideResult,
                fetchedAt: Date.now()
            };

            var mapped = mapCurrentConditions();
            if (onDataCallback && mapped) {
                onDataCallback(mapped);
            }
            return mapped;
        }).catch(function (err) {
            console.warn('Weather fetch failed:', err);
            return null;
        });
    }

    // --- Time Interpolation ---

    function getCurrentHourIndex() {
        if (!weatherData || !weatherData.times) return -1;

        var now = Math.floor(Date.now() / 1000);
        var times = weatherData.times;

        for (var i = 0; i < times.length - 1; i++) {
            if (now >= times[i] && now < times[i + 1]) {
                return i;
            }
        }
        // If past all times, use last
        return times.length - 2;
    }

    function getInterpolationFactor() {
        if (!weatherData || !weatherData.times) return 0;

        var now = Math.floor(Date.now() / 1000);
        var idx = getCurrentHourIndex();
        if (idx < 0) return 0;

        var t0 = weatherData.times[idx];
        var t1 = weatherData.times[idx + 1];
        return (now - t0) / (t1 - t0);
    }

    function lerp(a, b, t) {
        if (a == null || b == null || isNaN(a) || isNaN(b)) return a || b || 0;
        return a + (b - a) * t;
    }

    function getInterpolatedValue(hourlyArray, idx, t) {
        if (!hourlyArray) return 0;
        var a = hourlyArray[idx] || 0;
        var b = hourlyArray[idx + 1] || a;
        return lerp(a, b, t);
    }

    // --- Parameter Mapping ---

    function mapCurrentConditions() {
        if (!weatherData) return null;

        var idx = getCurrentHourIndex();
        if (idx < 0) return null;

        var t = getInterpolationFactor();

        // Get interpolated raw values
        var waveHeight = getInterpolatedValue(weatherData.marine.wave_height, idx, t);
        var wavePeriod = getInterpolatedValue(weatherData.marine.wave_period, idx, t);
        var windWaveHeight = getInterpolatedValue(weatherData.marine.wind_wave_height, idx, t);
        var swellWaveHeight = getInterpolatedValue(weatherData.marine.swell_wave_height, idx, t);

        var waveDirection = getInterpolatedValue(weatherData.marine.wave_direction, idx, t);
        var seaSurfaceTemp = getInterpolatedValue(weatherData.marine.sea_surface_temperature, idx, t);

        var windSpeedKmh = getInterpolatedValue(weatherData.wind.wind_speed_10m, idx, t);
        var windGustKmh = getInterpolatedValue(weatherData.wind.wind_gusts_10m, idx, t);
        var windDirDeg = getInterpolatedValue(weatherData.wind.wind_direction_10m, idx, t);
        var weatherCode = weatherData.wind.weather_code ? weatherData.wind.weather_code[idx] : 0;

        // --- Wind mapping ---
        // Convert km/h to m/s
        var windSpeedMs = windSpeedKmh / 3.6;
        // Clamp to renderer range
        var clampedSpeed = clamp(windSpeedMs, MIN_WIND_SPEED, MAX_WIND_SPEED);

        // Convert meteorological direction (where wind comes FROM) to vector
        // Wind direction 0 = from North, 90 = from East
        // Convert to "blowing toward" direction in renderer coords
        var windRadians = (windDirDeg + 180) * Math.PI / 180;
        var windX = clampedSpeed * Math.sin(windRadians);
        var windY = clampedSpeed * Math.cos(windRadians);

        // --- Size mapping ---
        // Deep water wavelength: L = g * T^2 / (2*pi)
        var period = Math.max(wavePeriod, 3); // floor at 3s to avoid tiny domains
        var wavelength = G * period * period / TWO_PI;
        // Simulation domain = ~2x wavelength for good visual resolution
        var simSize = clamp(wavelength * 2, MIN_SIZE, MAX_SIZE);

        // --- Choppiness mapping ---
        // Steepness = wave height / wavelength
        var steepness = (wavelength > 0) ? waveHeight / wavelength : 0;
        // Map steepness [0.01, 0.07] -> choppiness [0.5, 2.0]
        var choppiness = mapRange(steepness, 0.01, 0.07, 0.5, 2.0);
        // Boost for swell dominance
        var swellRatio = (waveHeight > 0.1) ? (swellWaveHeight || 0) / waveHeight : 0;
        choppiness += swellRatio * 0.3;
        choppiness = clamp(choppiness, MIN_CHOPPINESS, MAX_CHOPPINESS);

        return {
            windX: windX,
            windY: windY,
            size: simSize,
            choppiness: choppiness,
            tide: weatherData.tide || null,
            // Raw data for HUD display
            raw: {
                waveHeight: waveHeight,
                wavePeriod: wavePeriod,
                waveDirection: waveDirection,
                seaSurfaceTemp: seaSurfaceTemp,
                windSpeedKmh: windSpeedKmh,
                windSpeedMs: windSpeedMs,
                windSpeedMph: windSpeedMs * 2.237,
                windGustKmh: windGustKmh,
                windGustMph: (windGustKmh / 3.6) * 2.237,
                windDirDeg: windDirDeg,
                beaufort: getBeaufortScale(windSpeedMs),
                weatherCondition: wmoCodeToDescription(weatherCode)
            }
        };
    }

    // --- WMO Weather Codes ---

    function wmoCodeToDescription(code) {
        var WMO = {
            0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Foggy', 48: 'Icy fog',
            51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
            61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
            71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
            80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
            95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm'
        };
        return WMO[code] || 'Clear sky';
    }

    // --- Beaufort Scale ---

    var BEAUFORT_SCALE = [
        { max: 0.5, number: 0, description: 'Calm' },
        { max: 1.5, number: 1, description: 'Light Air' },
        { max: 3.3, number: 2, description: 'Light Breeze' },
        { max: 5.5, number: 3, description: 'Gentle Breeze' },
        { max: 7.9, number: 4, description: 'Moderate Breeze' },
        { max: 10.7, number: 5, description: 'Fresh Breeze' },
        { max: 13.8, number: 6, description: 'Strong Breeze' },
        { max: 17.1, number: 7, description: 'Near Gale' },
        { max: 20.7, number: 8, description: 'Gale' },
        { max: 24.4, number: 9, description: 'Strong Gale' },
        { max: 28.4, number: 10, description: 'Storm' },
        { max: 32.6, number: 11, description: 'Violent Storm' },
        { max: Infinity, number: 12, description: 'Hurricane' }
    ];

    function getBeaufortScale(windSpeedMs) {
        for (var i = 0; i < BEAUFORT_SCALE.length; i++) {
            if (windSpeedMs < BEAUFORT_SCALE[i].max) {
                return BEAUFORT_SCALE[i];
            }
        }
        return BEAUFORT_SCALE[BEAUFORT_SCALE.length - 1];
    }

    // --- Tide Data (NOAA CO-OPS API) ---

    var NOAA_STATIONS = [
        { id: '9419750', lat: 41.7456, lng: -124.1844 },  // Crescent City
        { id: '9418767', lat: 40.7667, lng: -124.2167 },  // North Spit (Eureka)
        { id: '9416841', lat: 38.9133, lng: -123.7083 },  // Arena Cove
        { id: '9415020', lat: 37.9961, lng: -122.9767 },  // Point Reyes
        { id: '9414290', lat: 37.8067, lng: -122.4650 },  // San Francisco
        { id: '9413450', lat: 36.6050, lng: -121.8883 },  // Monterey
        { id: '9412110', lat: 35.1694, lng: -120.7542 },  // Port San Luis
        { id: '9411340', lat: 34.4083, lng: -119.6850 },  // Santa Barbara
        { id: '9410840', lat: 34.0083, lng: -118.5000 },  // Santa Monica
        { id: '9410660', lat: 33.7200, lng: -118.2717 },  // Los Angeles
        { id: '9410230', lat: 32.8669, lng: -117.2571 },  // La Jolla
        { id: '9410170', lat: 32.7142, lng: -117.1736 },  // San Diego
        { id: '1612340', lat: 21.3067, lng: -157.8670 },  // Honolulu
        { id: '1617760', lat: 19.7314, lng: -155.0550 },  // Hilo
    ];

    var MAX_STATION_DISTANCE = 200; // km

    function haversineDistance(lat1, lng1, lat2, lng2) {
        var R = 6371;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function findNearestStation(lat, lng) {
        var best = null;
        var bestDist = Infinity;
        for (var i = 0; i < NOAA_STATIONS.length; i++) {
            var s = NOAA_STATIONS[i];
            var d = haversineDistance(lat, lng, s.lat, s.lng);
            if (d < bestDist) {
                bestDist = d;
                best = s;
            }
        }
        return bestDist <= MAX_STATION_DISTANCE ? best : null;
    }

    function getNoaaDateStr() {
        var d = new Date();
        return d.getUTCFullYear() +
            String(d.getUTCMonth() + 1).padStart(2, '0') +
            String(d.getUTCDate()).padStart(2, '0');
    }

    function fetchTideData(station) {
        var today = getNoaaDateStr();
        var base = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
        var common = '&station=' + station.id +
            '&product=predictions&datum=MLLW&units=english' +
            '&time_zone=gmt&format=json';

        var hiloUrl = base + '?begin_date=' + today + '&range=36' + common + '&interval=hilo';
        var hourlyUrl = base + '?begin_date=' + today + '&range=36' + common + '&interval=h';

        return Promise.all([
            fetch(hiloUrl).then(function (r) { return r.json(); }),
            fetch(hourlyUrl).then(function (r) { return r.json(); })
        ]).then(function (results) {
            return processTideData(results[0], results[1]);
        }).catch(function (err) {
            console.warn('Tide fetch failed:', err);
            return null;
        });
    }

    function processTideData(hiloData, hourlyData) {
        if (!hiloData || !hiloData.predictions || !hourlyData || !hourlyData.predictions) return null;

        var now = Date.now();

        // Parse hi/lo events
        var events = hiloData.predictions.map(function (p) {
            return {
                time: new Date(p.t.replace(' ', 'T') + 'Z').getTime(),
                value: parseFloat(p.v),
                type: p.type
            };
        });

        // Find surrounding events
        var prev = null, next = null;
        for (var i = 0; i < events.length; i++) {
            if (events[i].time <= now) {
                prev = events[i];
            } else if (!next) {
                next = events[i];
            }
        }

        if (!prev || !next) return null;

        // Interpolate current height from hourly data
        var hourly = hourlyData.predictions;
        var currentHeight = null;
        for (var i = 0; i < hourly.length - 1; i++) {
            var t0 = new Date(hourly[i].t.replace(' ', 'T') + 'Z').getTime();
            var t1 = new Date(hourly[i + 1].t.replace(' ', 'T') + 'Z').getTime();
            if (now >= t0 && now < t1) {
                var frac = (now - t0) / (t1 - t0);
                currentHeight = parseFloat(hourly[i].v) + (parseFloat(hourly[i + 1].v) - parseFloat(hourly[i].v)) * frac;
                break;
            }
        }

        if (currentHeight === null) {
            currentHeight = parseFloat(hourly[hourly.length - 1].v);
        }

        // Progress through current cycle (0 = at prev event, 1 = at next event)
        var progress = (now - prev.time) / (next.time - prev.time);
        progress = Math.max(0, Math.min(1, progress));

        var rising = next.type === 'H';

        // State label
        var state;
        if (progress < 0.15) {
            state = prev.type === 'H' ? 'High' : 'Low';
        } else if (progress > 0.85) {
            state = next.type === 'H' ? 'High' : 'Low';
        } else {
            state = rising ? 'Rising' : 'Falling';
        }

        return {
            height: currentHeight,
            state: state,
            rising: rising,
            progress: progress,
            prevTime: prev.time,
            nextTime: next.time,
            prevType: prev.type,
            nextType: next.type
        };
    }

    function formatTideTime(utcMs) {
        var d = new Date(utcMs);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function mapRange(value, inMin, inMax, outMin, outMax) {
        var t = (value - inMin) / (inMax - inMin);
        t = clamp(t, 0, 1);
        return outMin + t * (outMax - outMin);
    }

    // --- Public API ---

    function init(callback) {
        onDataCallback = callback;
    }

    function setLocation(location) {
        currentLocation = location;
        weatherData = null;
        if (fetchTimer) clearInterval(fetchTimer);

        // Fetch immediately, then every 15 min
        fetchWeatherData(currentLocation);
        fetchTimer = setInterval(function () {
            fetchWeatherData(currentLocation);
        }, FETCH_INTERVAL);
    }

    function getDefaultLocation() {
        return DEFAULT_LOCATION;
    }

    function getCurrentLocation() {
        return currentLocation;
    }

    function getCurrentConditions() {
        return mapCurrentConditions();
    }

    // Standalone fetch for data page (no callback/timer coupling)
    function fetchForLocation(location) {
        return fetchWeatherData(location);
    }

    function degreesToCompass(deg) {
        var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                    'S','SSW','SW','WSW','W','WNW','NW','NNW'];
        return dirs[Math.round(deg / 22.5) % 16];
    }

    // Return hourly forecast arrays for spark charts
    function getHourlyData() {
        if (!weatherData) return null;
        var idx = getCurrentHourIndex();
        return {
            currentIndex: idx,
            windSpeed: (weatherData.wind.wind_speed_10m || []).map(function (v) { return (v || 0) / 3.6 * 2.237; }), // mph
            waveHeight: (weatherData.marine.wave_height || []).map(function (v) { return (v || 0) * 3.281; }), // ft
            wavePeriod: weatherData.marine.wave_period || [],
            seaSurfaceTemp: (weatherData.marine.sea_surface_temperature || []).map(function (v) { return (v || 0) * 9 / 5 + 32; }), // °F
            waveDirection: weatherData.marine.wave_direction || [],
            windDirection: weatherData.wind.wind_direction_10m || []
        };
    }

    return {
        init: init,
        setLocation: setLocation,
        getDefaultLocation: getDefaultLocation,
        getCurrentLocation: getCurrentLocation,
        getCurrentConditions: getCurrentConditions,
        getHourlyData: getHourlyData,
        fetchForLocation: fetchForLocation,
        degreesToCompass: degreesToCompass,
        formatTideTime: formatTideTime
    };
})();
