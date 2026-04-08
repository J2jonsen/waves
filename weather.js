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
            '&forecast_days=3&timeformat=unixtime';

        var windUrl = 'https://api.open-meteo.com/v1/forecast' +
            '?latitude=' + location.lat +
            '&longitude=' + location.lng +
            '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code' +
            '&forecast_days=3&timeformat=unixtime';

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

            if (!marine.hourly || !wind.hourly) {
                throw new Error(marine.reason || wind.reason || 'API returned no data');
            }

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
        // ===== PACIFIC — Alaska =====
        { id: '9450460', lat: 59.6033, lng: -151.7200 },  // Seldovia
        { id: '9451600', lat: 57.7317, lng: -152.5117 },  // Kodiak
        { id: '9451054', lat: 61.1250, lng: -146.3617 },  // Valdez
        { id: '9452210', lat: 57.0517, lng: -135.3417 },  // Sitka
        { id: '9452634', lat: 58.2983, lng: -134.4117 },  // Juneau
        { id: '9455920', lat: 55.3317, lng: -131.6267 },  // Ketchikan

        // ===== PACIFIC — Washington =====
        { id: '9443090', lat: 48.3700, lng: -124.6117 },  // Neah Bay
        { id: '9441102', lat: 46.9067, lng: -124.1050 },  // Westport
        { id: '9444900', lat: 48.5450, lng: -123.0100 },  // Friday Harbor
        { id: '9447130', lat: 47.6027, lng: -122.3393 },  // Seattle
        { id: '9446484', lat: 47.2633, lng: -122.4133 },  // Tacoma

        // ===== PACIFIC — Oregon =====
        { id: '9439040', lat: 46.2073, lng: -123.7683 },  // Astoria
        { id: '9435380', lat: 44.6250, lng: -124.0433 },  // South Beach (Newport)
        { id: '9432780', lat: 43.3450, lng: -124.3233 },  // Charleston (Coos Bay)

        // ===== PACIFIC — California =====
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

        // ===== HAWAII =====
        { id: '1612340', lat: 21.3067, lng: -157.8670 },  // Honolulu
        { id: '1617760', lat: 19.7314, lng: -155.0550 },  // Hilo
        { id: '1615680', lat: 21.9544, lng: -159.3561 },  // Nawiliwili (Kauai)
        { id: '1611400', lat: 20.8950, lng: -156.4767 },  // Kahului (Maui)

        // ===== GULF COAST — Texas =====
        { id: '8770570', lat: 29.3100, lng: -94.7933 },   // Sabine Pass
        { id: '8771450', lat: 29.3101, lng: -94.7935 },   // Galveston Pier 21
        { id: '8771341', lat: 29.3574, lng: -94.7247 },   // Galveston Bay
        { id: '8775870', lat: 28.4483, lng: -96.3950 },   // Bob Hall Pier (Corpus Christi)
        { id: '8779770', lat: 26.0617, lng: -97.2150 },   // Port Isabel
        { id: '8773146', lat: 28.9483, lng: -95.3083 },   // Freeport

        // ===== GULF COAST — Louisiana =====
        { id: '8760922', lat: 29.8633, lng: -89.6733 },   // Pilots Station East
        { id: '8761724', lat: 29.0900, lng: -90.1983 },   // Grand Isle
        { id: '8764044', lat: 29.5550, lng: -91.5550 },   // Berwick

        // ===== GULF COAST — Mississippi / Alabama =====
        { id: '8747437', lat: 30.3267, lng: -89.3250 },   // Bay Waveland Yacht Club
        { id: '8735180', lat: 30.2483, lng: -88.0750 },   // Dauphin Island

        // ===== GULF COAST — Florida (Gulf side) =====
        { id: '8729108', lat: 30.4044, lng: -87.2112 },   // Pensacola
        { id: '8728690', lat: 30.1528, lng: -85.6667 },   // Panama City Beach
        { id: '8727520', lat: 29.7267, lng: -84.9833 },   // Cedar Key / Apalachicola area
        { id: '8726520', lat: 27.7606, lng: -82.6269 },   // St. Petersburg
        { id: '8725110', lat: 26.6477, lng: -81.8715 },   // Naples
        { id: '8724580', lat: 24.5557, lng: -81.8075 },   // Key West

        // ===== ATLANTIC — Florida (East side) =====
        { id: '8723214', lat: 25.7683, lng: -80.1317 },   // Virginia Key (Miami)
        { id: '8721604', lat: 28.4152, lng: -80.5930 },   // Trident Pier (Cape Canaveral)
        { id: '8720218', lat: 30.3978, lng: -81.4283 },   // Mayport (Jacksonville)
        { id: '8720030', lat: 30.6714, lng: -81.4658 },   // Fernandina Beach

        // ===== ATLANTIC — Georgia / South Carolina =====
        { id: '8670870', lat: 32.0333, lng: -80.9017 },   // Fort Pulaski (Savannah)
        { id: '8665530', lat: 32.7817, lng: -79.9250 },   // Charleston

        // ===== ATLANTIC — North Carolina =====
        { id: '8658120', lat: 33.9533, lng: -77.9533 },   // Wilmington
        { id: '8656483', lat: 34.7178, lng: -76.6700 },   // Beaufort (NC)
        { id: '8652587', lat: 35.7950, lng: -75.5483 },   // Oregon Inlet
        { id: '8651370', lat: 36.1833, lng: -75.7467 },   // Duck

        // ===== ATLANTIC — Virginia / Chesapeake =====
        { id: '8638863', lat: 36.9462, lng: -76.3297 },   // Chesapeake Bay Bridge-Tunnel
        { id: '8639348', lat: 36.8300, lng: -76.2900 },   // Money Point (Norfolk)
        { id: '8637624', lat: 37.2267, lng: -76.4783 },   // Gloucester Point

        // ===== ATLANTIC — Maryland / Delaware =====
        { id: '8574680', lat: 38.9833, lng: -76.4817 },   // Baltimore
        { id: '8557380', lat: 38.7817, lng: -75.1192 },   // Lewes (Delaware)
        { id: '8536110', lat: 39.3533, lng: -75.5800 },   // Cape May

        // ===== ATLANTIC — New Jersey / New York =====
        { id: '8534720', lat: 39.6650, lng: -74.0183 },   // Atlantic City
        { id: '8531680', lat: 40.4667, lng: -74.0093 },   // Sandy Hook
        { id: '8518750', lat: 40.7006, lng: -74.0142 },   // The Battery (NYC)
        { id: '8516945', lat: 40.8103, lng: -73.7650 },   // Kings Point
        { id: '8510560', lat: 41.0483, lng: -71.9600 },   // Montauk

        // ===== ATLANTIC — Connecticut / Rhode Island =====
        { id: '8467150', lat: 41.2833, lng: -72.9083 },   // Bridgeport
        { id: '8461490', lat: 41.3614, lng: -72.0900 },   // New London
        { id: '8452660', lat: 41.5044, lng: -71.3261 },   // Newport (RI)
        { id: '8454000', lat: 41.8072, lng: -71.4017 },   // Providence

        // ===== ATLANTIC — Massachusetts =====
        { id: '8449130', lat: 41.5233, lng: -70.6717 },   // Nantucket
        { id: '8447930', lat: 41.7043, lng: -69.9481 },   // Chatham / Woods Hole
        { id: '8443970', lat: 42.3539, lng: -71.0503 },   // Boston

        // ===== ATLANTIC — Maine =====
        { id: '8418150', lat: 43.6567, lng: -70.2467 },   // Portland
        { id: '8413320', lat: 44.3917, lng: -68.2050 },   // Bar Harbor
        { id: '8411060', lat: 44.9050, lng: -67.0017 },   // Eastport
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

        var hiloUrl = base + '?begin_date=' + today + '&range=48' + common + '&interval=hilo';
        var hourlyUrl = base + '?begin_date=' + today + '&range=48' + common + '&interval=h';

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

        // Parse hourly predictions into array
        var hourly = hourlyData.predictions;
        var hourlyParsed = [];
        for (var i = 0; i < hourly.length; i++) {
            var ht = new Date(hourly[i].t.replace(' ', 'T') + 'Z').getTime();
            hourlyParsed.push({ time: ht, value: parseFloat(hourly[i].v) });
        }

        // Interpolate current height from hourly data
        var currentHeight = null;
        for (var i = 0; i < hourlyParsed.length - 1; i++) {
            if (now >= hourlyParsed[i].time && now < hourlyParsed[i + 1].time) {
                var frac = (now - hourlyParsed[i].time) / (hourlyParsed[i + 1].time - hourlyParsed[i].time);
                currentHeight = hourlyParsed[i].value + (hourlyParsed[i + 1].value - hourlyParsed[i].value) * frac;
                break;
            }
        }

        if (currentHeight === null) {
            currentHeight = hourlyParsed.length > 0 ? hourlyParsed[hourlyParsed.length - 1].value : 0;
        }

        // Filter hourly to ~24h window from now
        var windowStart = now - 2 * 3600000; // 2h before now for context
        var windowEnd = now + 36 * 3600000;
        var visibleHourly = hourlyParsed.filter(function (p) { return p.time >= windowStart && p.time <= windowEnd; });

        // Get the nearest 4 events centered around now (prev + next 3)
        var prevIdx = -1;
        for (var i = 0; i < events.length; i++) {
            if (events[i].time <= now) prevIdx = i;
        }
        var startIdx = Math.max(0, prevIdx);
        var visibleEvents = events.slice(startIdx, startIdx + 4);
        // If we don't have 4 forward, try to include earlier ones
        if (visibleEvents.length < 4 && startIdx > 0) {
            var need = 4 - visibleEvents.length;
            visibleEvents = events.slice(Math.max(0, startIdx - need), startIdx + 4);
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
            nextType: next.type,
            events: visibleEvents,
            hourlyPredictions: visibleHourly
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
            times: weatherData.times || [],
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
