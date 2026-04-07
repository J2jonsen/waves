// swell-overlay.js — Fetches swell data for a grid of ocean points and renders on map

(function () {
    'use strict';

    // --- Severity colors & thresholds (mirrored from app.js) ---
    var SWELL_COLORS = {
        low:    '#AFC3D5',
        medium: '#F3B139',
        high:   '#E3584F'
    };

    function getSwellSeverity(heightMeters) {
        var ft = heightMeters * 3.281;
        if (ft < 3) return 'low';
        if (ft < 8) return 'medium';
        return 'high';
    }

    // --- Grid generation: West Coast + nearby Pacific ---
    // 1.0 deg spacing keeps API calls low (~7 batches), ~150 ocean points
    var GRID_SPACING = 1.0;
    var GRID = [];
    (function buildGrid() {
        for (var lat = 30.0; lat <= 48.0; lat += GRID_SPACING) {
            for (var lng = -132.0; lng <= -117.0; lng += GRID_SPACING) {
                GRID.push({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 });
            }
        }
    })();

    // --- Batch fetch from Open-Meteo Marine API ---
    var BATCH_SIZE = 50;
    var API_BASE = 'https://marine-api.open-meteo.com/v1/marine';

    function fetchSwellBatch(points) {
        var lats = points.map(function (p) { return p.lat; }).join(',');
        var lngs = points.map(function (p) { return p.lng; }).join(',');
        var url = API_BASE +
            '?latitude=' + lats +
            '&longitude=' + lngs +
            '&hourly=swell_wave_height,wave_direction,wave_height' +
            '&forecast_days=1&timeformat=unixtime';

        return fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!Array.isArray(data)) data = [data];
                return data;
            });
    }

    function getCurrentHourIndex(hourly) {
        if (!hourly || !hourly.time) return 0;
        var now = Math.floor(Date.now() / 1000);
        var times = hourly.time;
        for (var i = 0; i < times.length - 1; i++) {
            if (now >= times[i] && now < times[i + 1]) return i;
        }
        return times.length - 1;
    }

    // Fetch batches with limited concurrency + delay to avoid rate limiting
    var MAX_CONCURRENT = 3;
    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function fetchWithRetry(batch, retries) {
        return fetchSwellBatch(batch).catch(function () {
            if (retries > 0) return delay(1000).then(function () { return fetchWithRetry(batch, retries - 1); });
            return [];
        });
    }

    function fetchBatchesThrottled(batches) {
        var results = new Array(batches.length);
        var nextIdx = 0;

        function runNext() {
            var idx = nextIdx++;
            if (idx >= batches.length) return Promise.resolve();
            return fetchWithRetry(batches[idx], 2)
                .then(function (data) { results[idx] = data; })
                .then(function () { return delay(200); })
                .then(runNext);
        }

        var workers = [];
        for (var i = 0; i < Math.min(MAX_CONCURRENT, batches.length); i++) {
            workers.push(runNext());
        }
        return Promise.all(workers).then(function () { return results; });
    }

    function processBatchData(batchData, offset) {
        var features = [];
        for (var k = 0; k < batchData.length; k++) {
            var loc = batchData[k];
            if (!loc || !loc.hourly) continue;

            var gridPt = GRID[offset + k];
            var idx = getCurrentHourIndex(loc.hourly);
            var swellH = loc.hourly.swell_wave_height;
            var waveH = loc.hourly.wave_height;
            var waveDir = loc.hourly.wave_direction;

            var height = (swellH && swellH[idx] != null) ? swellH[idx] : (waveH && waveH[idx] != null ? waveH[idx] : null);
            var direction = (waveDir && waveDir[idx] != null) ? waveDir[idx] : null;

            if (height == null || direction == null) continue;

            var severity = getSwellSeverity(height);
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [gridPt.lng, gridPt.lat] },
                properties: {
                    color: SWELL_COLORS[severity],
                    severity: severity,
                    direction: direction,
                    heightFt: Math.round(height * 3.281 * 10) / 10
                }
            });
        }
        return features;
    }

    // Progressive fetch: renders features as each batch completes
    function fetchAllSwellData(map) {
        var batches = [];
        var batchOffsets = [];
        for (var i = 0; i < GRID.length; i += BATCH_SIZE) {
            batches.push(GRID.slice(i, i + BATCH_SIZE));
            batchOffsets.push(i);
        }

        var allFeatures = [];
        var geojson = { type: 'FeatureCollection', features: allFeatures };
        var source = map.getSource('swell-grid');

        var nextIdx = 0;
        function runNext() {
            var idx = nextIdx++;
            if (idx >= batches.length) return Promise.resolve();
            return fetchWithRetry(batches[idx], 2)
                .then(function (data) {
                    var newFeats = processBatchData(data, batchOffsets[idx]);
                    for (var f = 0; f < newFeats.length; f++) allFeatures.push(newFeats[f]);
                    geojson.features = allFeatures;
                    source.setData(geojson);
                })
                .then(function () { return delay(200); })
                .then(runNext);
        }

        var workers = [];
        for (var w = 0; w < Math.min(MAX_CONCURRENT, batches.length); w++) {
            workers.push(runNext());
        }
        return Promise.all(workers);
    }

    // --- Arrow icon (high-res canvas SDF, simple chevron) ---
    function createArrowIcon(map) {
        var size = 128;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');

        var cx = size / 2;

        // Simple upward chevron arrow — clean at any zoom
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 10;

        // Chevron head
        ctx.beginPath();
        ctx.moveTo(cx - 28, cx + 8);
        ctx.lineTo(cx, cx - 28);
        ctx.lineTo(cx + 28, cx + 8);
        ctx.stroke();

        // Stem
        ctx.beginPath();
        ctx.moveTo(cx, cx - 20);
        ctx.lineTo(cx, cx + 32);
        ctx.stroke();

        var imageData = ctx.getImageData(0, 0, size, size);
        map.addImage('swell-arrow', imageData, { sdf: true });
    }

    // --- Add Mapbox layers ---
    function addSwellLayers(map, geojson) {
        map.addSource('swell-grid', {
            type: 'geojson',
            data: geojson
        });

        // Circle layer (below harbors)
        // Exponential base-2 scales with map zoom so circles never collide
        map.addLayer({
            id: 'swell-circles',
            type: 'circle',
            source: 'swell-grid',
            paint: {
                'circle-radius': [
                    'interpolate', ['exponential', 2], ['zoom'],
                    4, 10,
                    9, 320
                ],
                'circle-color': ['get', 'color'],
                'circle-opacity': 0.25,
                'circle-stroke-width': 0
            }
        }, 'harbors-circle');

        // Arrow symbol layer
        map.addLayer({
            id: 'swell-arrows',
            type: 'symbol',
            source: 'swell-grid',
            layout: {
                'icon-image': 'swell-arrow',
                'icon-size': [
                    'interpolate', ['exponential', 2], ['zoom'],
                    4, 0.14,
                    9, 4.5
                ],
                'icon-rotate': ['+', ['get', 'direction'], 180],
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true
            },
            paint: {
                'icon-color': ['get', 'color'],
                'icon-opacity': 0.7
            }
        }, 'harbors-circle');
    }

    // --- Loading indicator ---
    function showLoading() {
        var el = document.getElementById('swell-loading');
        if (el) el.classList.remove('hidden');
    }

    function hideLoading() {
        var el = document.getElementById('swell-loading');
        if (el) el.classList.add('hidden');
    }

    // --- Init ---
    function init() {
        var map = window.__wavesMap;
        if (!map) return;

        function onReady() {
            showLoading();
            createArrowIcon(map);

            // Create source + layers with empty data, then fill progressively
            var emptyGeoJSON = { type: 'FeatureCollection', features: [] };
            addSwellLayers(map, emptyGeoJSON);

            fetchAllSwellData(map)
                .then(function () { hideLoading(); })
                .catch(function (err) {
                    console.warn('Swell overlay failed:', err);
                    hideLoading();
                });
        }

        if (map.loaded()) {
            onReady();
        } else {
            map.on('load', onReady);
        }
    }

    // Wait for map.js to expose the map instance
    if (window.__wavesMap) {
        init();
    } else {
        var attempts = 0;
        var poll = setInterval(function () {
            attempts++;
            if (window.__wavesMap || attempts > 50) {
                clearInterval(poll);
                if (window.__wavesMap) init();
            }
        }, 100);
    }

})();
