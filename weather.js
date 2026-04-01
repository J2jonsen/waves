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

    // Curated coastal locations
    var LOCATIONS = [
        { name: 'Santa Cruz, CA', lat: 36.96, lng: -122.02 },
        { name: 'Pipeline, Oahu', lat: 21.66, lng: -158.05 },
        { name: 'Nazare, Portugal', lat: 39.60, lng: -9.07 },
        { name: 'Bondi Beach, Australia', lat: -33.89, lng: 151.27 },
        { name: 'Hossegor, France', lat: 43.66, lng: -1.44 },
        { name: 'Tofino, BC', lat: 49.15, lng: -125.91 },
        { name: 'Mavericks, CA', lat: 37.49, lng: -122.50 },
        { name: 'Jeffreys Bay, South Africa', lat: -34.05, lng: 25.53 },
        { name: 'Uluwatu, Bali', lat: -8.81, lng: 115.09 },
        { name: 'Teahupo\'o, Tahiti', lat: -17.87, lng: -149.26 },
    ];

    var currentLocation = LOCATIONS[0];
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
            '&hourly=wind_speed_10m,wind_direction_10m' +
            '&forecast_days=1&timeformat=unixtime';

        return Promise.all([
            fetch(marineUrl).then(function (r) { return r.json(); }),
            fetch(windUrl).then(function (r) { return r.json(); })
        ]).then(function (results) {
            var marine = results[0];
            var wind = results[1];

            weatherData = {
                marine: marine.hourly,
                wind: wind.hourly,
                times: marine.hourly.time,
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
        var windDirDeg = getInterpolatedValue(weatherData.wind.wind_direction_10m, idx, t);

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
            // Raw data for HUD display
            raw: {
                waveHeight: waveHeight,
                wavePeriod: wavePeriod,
                waveDirection: waveDirection,
                seaSurfaceTemp: seaSurfaceTemp,
                windSpeedKmh: windSpeedKmh,
                windSpeedMs: windSpeedMs,
                windSpeedMph: windSpeedMs * 2.237,
                windDirDeg: windDirDeg,
                beaufort: getBeaufortScale(windSpeedMs)
            }
        };
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

    function getLocations() {
        return LOCATIONS;
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

    return {
        init: init,
        setLocation: setLocation,
        getLocations: getLocations,
        getCurrentLocation: getCurrentLocation,
        getCurrentConditions: getCurrentConditions,
        fetchForLocation: fetchForLocation,
        degreesToCompass: degreesToCompass,
        LOCATIONS: LOCATIONS
    };
})();
