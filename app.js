// app.js — Orchestrator: render loop, touch controls, weather integration

(function () {
    'use strict';

    // --- WebGL support check ---
    if (!hasWebGLSupportWithExtensions(['OES_texture_float', 'OES_texture_float_linear'])) {
        document.getElementById('loading-text').textContent = 'WebGL not supported on this device';
        return;
    }

    // --- Canvas setup ---
    var canvas = document.getElementById('simulator');
    var maxDPR = Math.min(window.devicePixelRatio || 1, 2.0);
    var renderScale = maxDPR;

    function resizeCanvas() {
        canvas.width = window.innerWidth * renderScale;
        canvas.height = window.innerHeight * renderScale;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
    }
    resizeCanvas();

    // --- Simulation init ---
    var camera = new Camera();
    var simulator = new Simulator(canvas, canvas.width, canvas.height);

    var projectionMatrix = new Float32Array(16);
    function updateProjection() {
        var aspect = canvas.width / canvas.height;
        makePerspectiveMatrix(projectionMatrix, FOV, aspect, NEAR, FAR);
    }
    updateProjection();

    // --- Resize handling ---
    window.addEventListener('resize', function () {
        resizeCanvas();
        simulator.resize(canvas.width, canvas.height);
        updateProjection();
    });

    // --- Touch / Mouse camera controls ---
    var pointerDown = false;
    var lastPointerX = 0;
    var lastPointerY = 0;
    var ORBIT_SENSITIVITY = 0.005;

    canvas.addEventListener('pointerdown', function (e) {
        pointerDown = true;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
        if (!pointerDown) return;
        var dx = e.clientX - lastPointerX;
        var dy = e.clientY - lastPointerY;
        camera.changeAzimuth(-dx * ORBIT_SENSITIVITY);
        camera.changeElevation(dy * ORBIT_SENSITIVITY);
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        e.preventDefault();
    });

    canvas.addEventListener('pointerup', function () {
        pointerDown = false;
    });
    canvas.addEventListener('pointerleave', function () {
        pointerDown = false;
    });

    // --- Smooth parameter interpolation ---
    var LERP_SPEED = 1.5;
    var current = {
        windX: INITIAL_WIND[0],
        windY: INITIAL_WIND[1],
        size: INITIAL_SIZE,
        choppiness: INITIAL_CHOPPINESS
    };
    var target = {
        windX: INITIAL_WIND[0],
        windY: INITIAL_WIND[1],
        size: INITIAL_SIZE,
        choppiness: INITIAL_CHOPPINESS
    };

    function lerpParams(dt) {
        var t = 1 - Math.exp(-LERP_SPEED * dt);

        var newWindX = current.windX + (target.windX - current.windX) * t;
        var newWindY = current.windY + (target.windY - current.windY) * t;
        if (Math.abs(newWindX - current.windX) > 0.001 || Math.abs(newWindY - current.windY) > 0.001) {
            current.windX = newWindX;
            current.windY = newWindY;
            simulator.setWind(current.windX, current.windY);
        }

        var newSize = current.size + (target.size - current.size) * t;
        if (Math.abs(newSize - current.size) > 0.1) {
            current.size = newSize;
            simulator.setSize(current.size);
        }

        var newChop = current.choppiness + (target.choppiness - current.choppiness) * t;
        if (Math.abs(newChop - current.choppiness) > 0.001) {
            current.choppiness = newChop;
            simulator.setChoppiness(current.choppiness);
        }
    }

    // --- Performance monitoring ---
    var frameTimes = [];
    var perfCheckDone = false;

    function checkPerformance(dt) {
        if (perfCheckDone) return;
        frameTimes.push(dt);
        if (frameTimes.length >= 60) {
            var avg = 0;
            for (var i = 0; i < frameTimes.length; i++) avg += frameTimes[i];
            avg /= frameTimes.length;
            if (avg > 0.020 && renderScale > 1.0) {
                renderScale = 1.0;
                resizeCanvas();
                simulator.resize(canvas.width, canvas.height);
                updateProjection();
            }
            perfCheckDone = true;
        }
    }

    // --- Weather integration ---
    var pauseWeather = false;

    // --- Weather condition icons ---
    var WEATHER_ICON_PATHS = {
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/>',
        'cloud-sun': '<path d="M10 2v2m-5.07.93l1.41 1.41M2 10h2"/><circle cx="10" cy="8" r="4"/><path d="M18 12h-1.26A8 8 0 0 0 4.2 12.05 6 6 0 1 0 8 22h10a5 5 0 0 0 0-10z"/>',
        cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
        fog: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M6 22h12" opacity="0.4"/><path d="M8 24h8" opacity="0.3"/>',
        rain: '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><path d="M8 19v2m4-4v2m4-4v2"/>',
        snow: '<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><circle cx="8" cy="20" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="20" r="1" fill="currentColor" stroke="none"/>',
        storm: '<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/>'
    };

    function weatherIconSVG(type) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            (WEATHER_ICON_PATHS[type] || WEATHER_ICON_PATHS.sun) + '</svg>';
    }

    function getConditionIcon(condition) {
        if (/thunder/i.test(condition)) return weatherIconSVG('storm');
        if (/snow/i.test(condition)) return weatherIconSVG('snow');
        if (/rain|drizzle|shower/i.test(condition)) return weatherIconSVG('rain');
        if (/fog/i.test(condition)) return weatherIconSVG('fog');
        if (/overcast/i.test(condition)) return weatherIconSVG('cloud');
        if (/partly/i.test(condition)) return weatherIconSVG('cloud-sun');
        return weatherIconSVG('sun');
    }

    // --- Trend arrows ---
    var TREND_ARROW_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';
    var TREND_ARROW_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>';

    function updateTrends(hourly) {
        updateTrendCard('trend-temp', hourly.seaSurfaceTemp, hourly.currentIndex, '°F', 0.5);
        updateTrendCard('trend-wind', hourly.windSpeed, hourly.currentIndex, ' mph', 0.5);
        updateTrendCard('trend-swell', hourly.waveHeight, hourly.currentIndex, ' ft', 0.2);
        updateTrendCard('trend-period', hourly.wavePeriod, hourly.currentIndex, 's', 0.5);
    }

    function updateTrendCard(id, data, idx, unit, threshold) {
        var el = document.getElementById(id);
        if (!el || !data || idx < 0) return;

        var futureIdx = Math.min(idx + 23, data.length - 1);
        var current = data[idx];
        var future = data[futureIdx];
        if (current == null || future == null || isNaN(current) || isNaN(future)) {
            el.innerHTML = '';
            return;
        }

        var delta = future - current;
        var abs = Math.abs(delta);
        if (abs < threshold) {
            el.innerHTML = '';
            return;
        }

        var formatted = abs < 10 ? abs.toFixed(1) : Math.round(abs);
        el.innerHTML = (delta > 0 ? TREND_ARROW_UP : TREND_ARROW_DOWN) +
            '<span class="trend-delta">' + formatted + unit + '</span>';
    }

    // --- Severity system ---
    var SEVERITY_COLORS = {
        low:    '#AFC3D5',
        medium: '#F3B139',
        high:   '#E3584F'
    };

    function getSeverity(value, metric) {
        switch (metric) {
            case 'height':  return value < 3   ? 'low' : value < 8   ? 'medium' : 'high';
            case 'period':  return value < 7   ? 'low' : value < 12  ? 'medium' : 'high';
            case 'wind':    return value < 10  ? 'low' : value < 20  ? 'medium' : 'high';
            case 'gust':    return value < 15  ? 'low' : value < 25  ? 'medium' : 'high';
            default: return 'low';
        }
    }

    function severityColor(value, metric) {
        if (metric === 'temp') return '#4C5E70';
        return SEVERITY_COLORS[getSeverity(value, metric)];
    }

    function updateHUD(data) {
        if (!data || !data.raw) return;
        var r = data.raw;

        // Weather condition icon + text
        document.getElementById('condition-icon').innerHTML = getConditionIcon(r.weatherCondition);
        document.getElementById('condition-text').textContent = r.weatherCondition;
        document.getElementById('sea-state-label').textContent = r.beaufort.description;

        // HUD stats + accent bar colors
        var heightFt = r.waveHeight * 3.281;
        document.getElementById('wave-height').textContent = heightFt.toFixed(1) + ' ft';
        document.getElementById('wave-period').textContent = r.wavePeriod.toFixed(0) + 's';
        document.getElementById('wind-speed').textContent = Math.round(r.windSpeedMph) + ' mph';
        document.getElementById('wind-gust').textContent = Math.round(r.windGustMph) + ' mph';

        // Color HUD accent lines
        var hudStats = document.querySelectorAll('.hud-stat');
        var hudMetrics = [
            { value: heightFt,             metric: 'height' },
            { value: r.wavePeriod,         metric: 'period' },
            { value: r.windSpeedMph,       metric: 'wind'   },
            { value: r.windGustMph,        metric: 'gust'   }
        ];
        hudMetrics.forEach(function(m, i) {
            var accent = hudStats[i] && hudStats[i].querySelector('.hud-accent');
            if (accent) accent.style.background = severityColor(m.value, m.metric);
        });

        // Update cards
        updateCards(r);

        // Update bar charts + trends
        var hourly = OceanWeather.getHourlyData();
        if (hourly) {
            updateBars(hourly);
            updateTrends(hourly);
            renderForecast(hourly);
        }

        // Update tide card
        if (data.tide) updateTideCard(data.tide);
    }

    function getTempLabel(tempF) {
        if (tempF < 50) return 'Cold';
        if (tempF < 60) return 'Cool';
        if (tempF < 70) return 'Mild';
        if (tempF < 80) return 'Warm';
        return 'Hot';
    }

    function updateCards(r) {
        var heightFt = r.waveHeight * 3.281;
        var windColor   = severityColor(r.windSpeedMph, 'wind');
        var swellColor  = severityColor(heightFt, 'height');
        var periodColor = severityColor(r.wavePeriod, 'period');

        // Sea temp card
        var tempF = r.seaSurfaceTemp * 9 / 5 + 32;
        document.getElementById('card-temp-val').textContent = Math.round(tempF);
        document.getElementById('card-temp-detail').textContent = getTempLabel(tempF);

        // Wind card
        document.getElementById('card-wind-val').textContent = Math.round(r.windSpeedMph);
        document.getElementById('card-wind-dir').textContent = OceanWeather.degreesToCompass(r.windDirDeg);
        document.querySelector('#card-wind .card-pill').style.background = windColor;

        // Swell card
        document.getElementById('card-swell-val').textContent = heightFt.toFixed(1);
        document.getElementById('card-swell-dir').textContent =
            OceanWeather.degreesToCompass(r.waveDirection);
        document.querySelector('#card-swell .card-pill').style.background = swellColor;

        // Period card
        document.getElementById('card-period-val').textContent = r.wavePeriod.toFixed(0);
        document.getElementById('card-period-detail').textContent = getPeriodLabel(r.wavePeriod);
        document.querySelector('#card-period .card-pill').style.background = periodColor;

        // Store colors for bar charts
        cardColors = { wind: windColor, swell: swellColor, period: periodColor };
    }

    var cardColors = { wind: '#F3B139', swell: '#AFC3D5', period: '#AFC3D5' };

    function updateTideCard(tide) {
        if (!tide) return;

        // Update header
        document.getElementById('tide-state').textContent = tide.state;
        document.getElementById('tide-val').textContent = tide.height.toFixed(1);
        document.getElementById('tide-time').textContent = formatTideAMPM(Date.now());

        // Render curve
        renderTideCurve(tide);
    }

    // --- Tide curve SVG rendering ---
    function formatTideAMPM(ms) {
        var d = new Date(ms);
        var h = d.getHours();
        var m = d.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        return h + ':' + String(m).padStart(2, '0') + ' ' + ampm;
    }

    function catmullRomPath(points) {
        if (points.length < 2) return '';
        var d = 'M' + points[0].x.toFixed(1) + ',' + points[0].y.toFixed(1);
        for (var i = 0; i < points.length - 1; i++) {
            var p0 = points[Math.max(0, i - 1)];
            var p1 = points[i];
            var p2 = points[i + 1];
            var p3 = points[Math.min(points.length - 1, i + 2)];
            var cp1x = p1.x + (p2.x - p0.x) / 6;
            var cp1y = p1.y + (p2.y - p0.y) / 6;
            var cp2x = p2.x - (p3.x - p1.x) / 6;
            var cp2y = p2.y - (p3.y - p1.y) / 6;
            d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' +
                cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' +
                p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
        }
        return d;
    }

    // Sample a Catmull-Rom spline densely for y-lookup by x
    function sampleCatmullRom(points, numSamples) {
        var samples = [];
        var segs = points.length - 1;
        var stepsPerSeg = Math.ceil(numSamples / segs);
        for (var i = 0; i < segs; i++) {
            var p0 = points[Math.max(0, i - 1)];
            var p1 = points[i];
            var p2 = points[i + 1];
            var p3 = points[Math.min(points.length - 1, i + 2)];
            var limit = (i === segs - 1) ? stepsPerSeg + 1 : stepsPerSeg;
            for (var s = 0; s < limit; s++) {
                var t = s / stepsPerSeg;
                var t2 = t * t, t3 = t2 * t;
                var x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
                var y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
                samples.push({ x: x, y: y });
            }
        }
        return samples;
    }

    // Lookup y on the sampled curve for a given x
    function curveYAtX(samples, x) {
        if (x <= samples[0].x) return samples[0].y;
        if (x >= samples[samples.length - 1].x) return samples[samples.length - 1].y;
        for (var i = 0; i < samples.length - 1; i++) {
            if (x >= samples[i].x && x <= samples[i + 1].x) {
                var f = (x - samples[i].x) / (samples[i + 1].x - samples[i].x);
                return samples[i].y + f * (samples[i + 1].y - samples[i].y);
            }
        }
        return samples[0].y;
    }

    function renderTideCurve(tide) {
        var container = document.getElementById('tide-curve');
        if (!container || !tide.hourlyPredictions || tide.hourlyPredictions.length < 2) return;

        var hourly = tide.hourlyPredictions;
        var allEvents = tide.events || [];

        // Always show exactly 4 events
        var events = allEvents.slice(0, 4);
        if (events.length < 2) return;
        var n = events.length;

        var cRect = container.getBoundingClientRect();
        var W = Math.round(cRect.width) || 400;
        var H = Math.round(cRect.height) || 90;
        var padTop = Math.round(H * 0.28), padBot = Math.round(H * 0.25);

        // Value range from events
        var vMin = Infinity, vMax = -Infinity;
        for (var i = 0; i < n; i++) {
            if (events[i].value < vMin) vMin = events[i].value;
            if (events[i].value > vMax) vMax = events[i].value;
        }
        var vPad = (vMax - vMin) * 0.2 || 0.5;
        vMin -= vPad;
        vMax += vPad;

        function my(v) { return padTop + ((vMax - v) / (vMax - vMin)) * (H - padTop - padBot); }

        // Evenly space events across full width
        var margin = W * 0.1;
        var evX = [];
        for (var i = 0; i < n; i++) {
            evX.push(margin + i * (W - 2 * margin) / (n - 1));
        }

        // Build curve control points: left edge + events + right edge
        // Edge points trend toward the opposite tide type for realistic trajectory
        var curvePts = [];
        // Left edge — the previous off-screen event is the opposite type of events[0]
        // so trend from the direction of events[1] (which IS the opposite type)
        var leftVal = events[0].value + (events[1].value - events[0].value) * 0.4;
        curvePts.push({ x: 0, y: my(leftVal) });
        // Event points
        for (var i = 0; i < n; i++) {
            curvePts.push({ x: evX[i], y: my(events[i].value) });
        }
        // Right edge — the next off-screen event is the opposite type of events[n-1]
        // so trend toward the direction of events[n-2] (which IS the opposite type)
        var rightVal = events[n - 1].value + (events[n - 2].value - events[n - 1].value) * 0.4;
        curvePts.push({ x: W, y: my(rightVal) });

        var pathD = catmullRomPath(curvePts);

        // Dense samples for y-lookup (scrubber + now dot)
        var samples = sampleCatmullRom(curvePts, 200);

        // Time ↔ x mapping through event anchors
        function timeToX(t) {
            if (t <= events[0].time) {
                var rate = (evX[1] - evX[0]) / (events[1].time - events[0].time);
                return evX[0] + (t - events[0].time) * rate;
            }
            if (t >= events[n - 1].time) {
                var rate = (evX[n - 1] - evX[n - 2]) / (events[n - 1].time - events[n - 2].time);
                return evX[n - 1] + (t - events[n - 1].time) * rate;
            }
            for (var i = 0; i < n - 1; i++) {
                if (t >= events[i].time && t <= events[i + 1].time) {
                    var f = (t - events[i].time) / (events[i + 1].time - events[i].time);
                    return evX[i] + f * (evX[i + 1] - evX[i]);
                }
            }
            return evX[0];
        }
        function xToTime(x) {
            if (x <= evX[0]) {
                var rate = (events[1].time - events[0].time) / (evX[1] - evX[0]);
                return events[0].time + (x - evX[0]) * rate;
            }
            if (x >= evX[n - 1]) {
                var rate = (events[n - 1].time - events[n - 2].time) / (evX[n - 1] - evX[n - 2]);
                return events[n - 1].time + (x - evX[n - 1]) * rate;
            }
            for (var i = 0; i < n - 1; i++) {
                if (x >= evX[i] && x <= evX[i + 1]) {
                    var f = (x - evX[i]) / (evX[i + 1] - evX[i]);
                    return events[i].time + f * (events[i + 1].time - events[i].time);
                }
            }
            return events[0].time;
        }

        // Compute "now" x position for splitting the curve
        var now = Date.now();
        var nowX = -1;
        var nowY = 0;
        if (now >= events[0].time && now <= events[n - 1].time) {
            nowX = timeToX(now);
            nowY = curveYAtX(samples, nowX);
        }

        // Split samples into past (before now) and future (after now) for two-tone line
        var pastPts = [], futurePts = [];
        if (nowX >= 0) {
            for (var i = 0; i < samples.length; i++) {
                if (samples[i].x <= nowX) {
                    pastPts.push(samples[i]);
                } else {
                    if (futurePts.length === 0) {
                        // Add the now point as the bridge
                        pastPts.push({ x: nowX, y: nowY });
                        futurePts.push({ x: nowX, y: nowY });
                    }
                    futurePts.push(samples[i]);
                }
            }
        } else {
            // Now is outside range — entire curve is one tone
            pastPts = samples;
        }

        // Build SVG path strings from sample points
        function samplesPath(pts) {
            if (pts.length < 2) return '';
            var d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
            for (var i = 1; i < pts.length; i++) {
                d += ' L' + pts[i].x.toFixed(1) + ',' + pts[i].y.toFixed(1);
            }
            return d;
        }

        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';

        // Gradient fill beneath the curve
        svg += '<defs><linearGradient id="tide-fill-grad" x1="0" y1="0" x2="0" y2="1">';
        svg += '<stop offset="0%" stop-color="#254A7A" stop-opacity="0.7"/>';
        svg += '<stop offset="100%" stop-color="#254A7A" stop-opacity="0.05"/>';
        svg += '</linearGradient></defs>';
        var fillD = pathD + ' L' + W + ',' + H + ' L0,' + H + ' Z';
        svg += '<path d="' + fillD + '" fill="url(#tide-fill-grad)"/>';

        // Curve lines — past (dimmer) and future (highlighted)
        if (futurePts.length > 1) {
            svg += '<path d="' + samplesPath(pastPts) + '" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>';
            svg += '<path d="' + samplesPath(futurePts) + '" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2.5"/>';
        } else {
            svg += '<path d="' + pathD + '" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>';
        }

        // Hi/lo event dots and labels
        var valSize = Math.round(H * 0.14);
        var timeSize = Math.round(H * 0.11);
        var gapAbove = Math.round(H * 0.09);
        var gapBelow = Math.round(H * 0.16);

        for (var i = 0; i < n; i++) {
            var e = events[i];
            var cx = evX[i];
            var cy = my(e.value);

            svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.5" fill="white"/>';
            svg += '<text x="' + cx.toFixed(1) + '" y="' + (cy - gapAbove).toFixed(1) + '" fill="white" font-size="' + valSize + '" font-family="Monda,sans-serif" font-weight="500" text-anchor="middle">' + e.value.toFixed(1) + '</text>';
            svg += '<text x="' + cx.toFixed(1) + '" y="' + (cy + gapBelow).toFixed(1) + '" fill="white" font-size="' + timeSize + '" font-family="Inter,sans-serif" font-weight="500" text-anchor="middle" opacity="0.5">' + formatTideAMPM(e.time) + '</text>';
        }

        // "Now" dot — persistent on the curve
        if (nowX >= 0) {
            svg += '<circle cx="' + nowX.toFixed(1) + '" cy="' + nowY.toFixed(1) + '" r="4.5" fill="white"/>';
        }

        // Scrubber elements (hidden initially)
        svg += '<line id="tide-scrub-line" x1="0" y1="0" x2="0" y2="' + H + '" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-dasharray="3,3" visibility="hidden"/>';
        svg += '<circle id="tide-scrub-dot-top" cx="0" cy="0" r="3" fill="white" visibility="hidden"/>';
        svg += '<circle id="tide-scrub-dot-bot" cx="0" cy="0" r="3" fill="white" visibility="hidden"/>';

        svg += '</svg>';

        container.innerHTML = svg;

        // Store data for scrubber
        container._td = {
            hourly: hourly, events: events, evX: evX,
            xToTime: xToTime, samples: samples,
            vMin: vMin, vMax: vMax, W: W, H: H,
            padTop: padTop, padBot: padBot
        };

        initTideScrubber(container);
    }

    function interpolateTide(hourly, time) {
        for (var i = 0; i < hourly.length - 1; i++) {
            if (time >= hourly[i].time && time <= hourly[i + 1].time) {
                var f = (time - hourly[i].time) / (hourly[i + 1].time - hourly[i].time);
                return hourly[i].value + (hourly[i + 1].value - hourly[i].value) * f;
            }
        }
        return time <= hourly[0].time ? hourly[0].value : hourly[hourly.length - 1].value;
    }

    function getTideState(hourly, time) {
        for (var i = 0; i < hourly.length - 1; i++) {
            if (time >= hourly[i].time && time <= hourly[i + 1].time) {
                return hourly[i + 1].value > hourly[i].value ? 'Rising' : 'Falling';
            }
        }
        return '--';
    }

    function initTideScrubber(container) {
        var svgEl = container.querySelector('svg');
        if (!svgEl) return;

        function scrubTo(clientX) {
            var td = container._td;
            if (!td) return;

            var rect = svgEl.getBoundingClientRect();
            var pct = (clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));

            var sx = pct * td.W;
            var time = td.xToTime(sx);
            var height = interpolateTide(td.hourly, time);
            var state = getTideState(td.hourly, time);

            // Update scrubber visuals
            var line = document.getElementById('tide-scrub-line');
            var dotTop = document.getElementById('tide-scrub-dot-top');
            var dotBot = document.getElementById('tide-scrub-dot-bot');
            if (line) {
                line.setAttribute('x1', sx.toFixed(1));
                line.setAttribute('x2', sx.toFixed(1));
                line.setAttribute('visibility', 'visible');
            }
            if (dotTop) {
                dotTop.setAttribute('cx', sx.toFixed(1));
                dotTop.setAttribute('cy', '0');
                dotTop.setAttribute('visibility', 'visible');
            }
            if (dotBot) {
                dotBot.setAttribute('cx', sx.toFixed(1));
                dotBot.setAttribute('cy', td.H.toFixed(1));
                dotBot.setAttribute('visibility', 'visible');
            }

            // Update header
            document.getElementById('tide-val').textContent = height.toFixed(1);
            document.getElementById('tide-state').textContent = state;
            document.getElementById('tide-time').textContent = formatTideAMPM(time);
        }

        svgEl.addEventListener('mousemove', function (e) { scrubTo(e.clientX); });
        svgEl.addEventListener('touchstart', function (e) { scrubTo(e.touches[0].clientX); e.stopPropagation(); }, { passive: true });
        svgEl.addEventListener('touchmove', function (e) { scrubTo(e.touches[0].clientX); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    }

    function getPeriodLabel(period) {
        if (period < 6) return 'Short';
        if (period < 10) return 'Medium';
        if (period < 14) return 'Long';
        return 'Very Long';
    }

    // --- Bar chart rendering ---
    var BAR_COUNT = 6;

    function updateBars(hourly) {
        renderBars('bars-temp',   hourly.seaSurfaceTemp, 'temp');
        renderBars('bars-wind',   hourly.windSpeed,  'wind');
        renderBars('bars-swell',  hourly.waveHeight, 'height');
        renderBars('bars-period', hourly.wavePeriod, 'period');
    }

    function renderBars(containerId, data, metric) {
        var container = document.getElementById(containerId);
        if (!container || !data || data.length === 0) return;

        // Only use first 24 hours for spark charts (data may be 72h now)
        var sparks = data.length > 24 ? data.slice(0, 24) : data;

        // Sample BAR_COUNT evenly-spaced points from the data
        var n = sparks.length;
        var samples = [];
        for (var i = 0; i < BAR_COUNT; i++) {
            var idx = Math.round(i * (n - 1) / (BAR_COUNT - 1));
            var v = sparks[idx];
            samples.push(v == null || isNaN(v) ? 0 : v);
        }

        // Find max for scaling
        var max = 0;
        for (var i = 0; i < samples.length; i++) {
            if (samples[i] > max) max = samples[i];
        }
        if (max === 0) max = 1;

        // Create structure: labels row + bars row
        var barRow = container.querySelector('.bar-row');
        if (!barRow || barRow.children.length !== BAR_COUNT) {
            container.innerHTML = '';
            barRow = document.createElement('div');
            barRow.className = 'bar-row';
            for (var i = 0; i < BAR_COUNT; i++) {
                var bar = document.createElement('div');
                bar.className = 'card-bar';
                barRow.appendChild(bar);
            }
            container.appendChild(barRow);
        }

        // Set height and per-bar forecasted severity color
        for (var i = 0; i < BAR_COUNT; i++) {
            var pct = (samples[i] / max) * 100;
            pct = Math.max(pct, 12);
            barRow.children[i].style.height = pct + '%';
            barRow.children[i].style.background = severityColor(samples[i], metric);
        }
    }

    // --- Forecast carousel ---
    var FORECAST_CONFIGS = [
        { id: 'forecast-temp', cardId: 'card-temp', dataKey: 'seaSurfaceTemp', metric: 'temp', label: 'SEA TEMP', unit: '°F', dirKey: null },
        { id: 'forecast-wind', cardId: 'card-wind', dataKey: 'windSpeed', metric: 'wind', label: 'WIND', unit: ' MPH', dirKey: 'windDirection' },
        { id: 'forecast-swell', cardId: 'card-swell', dataKey: 'waveHeight', metric: 'height', label: 'SWELL', unit: ' FT', dirKey: 'waveDirection' },
        { id: 'forecast-period', cardId: 'card-period', dataKey: 'wavePeriod', metric: 'period', label: 'PERIOD', unit: 'S', dirKey: null }
    ];

    function getDayLabel(unixTime, index, currentIndex) {
        if (index === currentIndex) return 'Now';
        var d = new Date(unixTime * 1000);
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[d.getDay()];
    }

    function renderForecast(hourly) {
        if (!hourly || !hourly.times || hourly.times.length === 0) return;

        var times = hourly.times;
        var currentIdx = hourly.currentIndex;

        FORECAST_CONFIGS.forEach(function (cfg) {
            var container = document.getElementById(cfg.id);
            if (!container) return;

            var data = hourly[cfg.dataKey];
            if (!data || data.length === 0) return;

            // Current values for header
            var currentVal = data[currentIdx] != null ? data[currentIdx] : 0;
            var dirDeg = cfg.dirKey && hourly[cfg.dirKey] ? hourly[cfg.dirKey][currentIdx] : null;
            var dirText = dirDeg != null ? OceanWeather.degreesToCompass(dirDeg) : '';
            var color = severityColor(currentVal, cfg.metric);

            // Format current value
            var displayVal;
            if (cfg.metric === 'temp') {
                displayVal = Math.round(currentVal);
            } else if (cfg.metric === 'height') {
                displayVal = currentVal.toFixed(1);
            } else {
                displayVal = Math.round(currentVal);
            }

            // Current time
            var now = new Date();
            var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

            // Build header
            var headerHTML = '<div class="forecast-header">' +
                '<div class="forecast-header-left">' +
                    '<span class="forecast-label">' + cfg.label + '</span>' +
                    '<span class="forecast-direction">' + (dirText || (cfg.metric === 'temp' ? getTempLabel(currentVal) : getPeriodLabel(currentVal))) + '</span>' +
                '</div>' +
                '<div class="forecast-header-right">' +
                    '<span class="forecast-time">' + timeStr + '</span>' +
                    '<div class="forecast-pill" style="background:' + color + '">' + displayVal + cfg.unit + '</div>' +
                '</div>' +
            '</div>';

            // Build bars — use all data from currentIndex onward (up to 72h)
            var barData = data.slice(currentIdx);
            var barTimes = times.slice(currentIdx);

            // Find max for scaling
            var max = 0;
            for (var i = 0; i < barData.length; i++) {
                var v = barData[i];
                if (v != null && !isNaN(v) && v > max) max = v;
            }
            if (max === 0) max = 1;

            var barsHTML = '<div class="forecast-bars">';
            for (var i = 0; i < barData.length; i++) {
                var v = barData[i] != null && !isNaN(barData[i]) ? barData[i] : 0;
                var pct = (v / max) * 100;
                pct = Math.max(pct, 6);
                var barColor = severityColor(v, cfg.metric);
                var selected = i === 0 ? ' is-selected' : '';
                barsHTML += '<div class="forecast-bar' + selected + '" data-index="' + i + '" style="height:' + pct + '%;background:' + barColor + '"></div>';
            }
            barsHTML += '</div>';

            // Time labels — "Now" + day boundaries
            var labels = [];
            labels.push({ pos: 0, text: 'Now' });
            var lastDay = new Date(barTimes[0] * 1000).getDay();
            for (var i = 1; i < barTimes.length; i++) {
                var d = new Date(barTimes[i] * 1000);
                if (d.getDay() !== lastDay && d.getHours() === 0) {
                    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    labels.push({ pos: i, text: days[d.getDay()] });
                    lastDay = d.getDay();
                }
            }

            var labelsHTML = '<div class="forecast-time-labels">';
            // Place labels using flex with spacer approach
            var totalBars = barData.length;
            for (var i = 0; i < labels.length; i++) {
                var leftPct = (labels[i].pos / (totalBars - 1)) * 100;
                labelsHTML += '<span class="forecast-time-label" style="position:absolute;left:' + leftPct + '%">' + labels[i].text + '</span>';
            }
            labelsHTML += '</div>';

            container.innerHTML = headerHTML +
                '<div class="forecast-bars-wrap">' + barsHTML +
                '<div style="position:relative;height:20px">' + labelsHTML + '</div></div>';

            // Store data for bar selection updates
            container._forecastData = {
                data: barData,
                times: barTimes,
                dirData: cfg.dirKey ? (hourly[cfg.dirKey] || []).slice(currentIdx) : null,
                metric: cfg.metric,
                label: cfg.label,
                unit: cfg.unit,
                hasDirKey: !!cfg.dirKey
            };

            // Scrubber: drag/touch across bars to select
            var barsEl = container.querySelector('.forecast-bars');
            if (barsEl) {
                initForecastScrubber(barsEl, container);
            }
        });
    }

    function selectForecastBar(container, idx) {
        var fd = container._forecastData;
        if (!fd) return;

        // Move selection
        var bars = container.querySelectorAll('.forecast-bar');
        bars.forEach(function (b) { b.classList.remove('is-selected'); });
        if (bars[idx]) bars[idx].classList.add('is-selected');

        // Update header values
        var val = fd.data[idx] != null ? fd.data[idx] : 0;
        var color = severityColor(val, fd.metric);

        var displayVal;
        if (fd.metric === 'temp') {
            displayVal = Math.round(val);
        } else if (fd.metric === 'height') {
            displayVal = val.toFixed(1);
        } else {
            displayVal = Math.round(val);
        }

        // Direction or descriptive label
        var dirText = '';
        if (fd.hasDirKey && fd.dirData && fd.dirData[idx] != null) {
            dirText = OceanWeather.degreesToCompass(fd.dirData[idx]);
        } else if (fd.metric === 'temp') {
            dirText = getTempLabel(val);
        } else {
            dirText = getPeriodLabel(val);
        }

        // Time for selected bar
        var timeStr = '';
        if (fd.times[idx]) {
            var d = new Date(fd.times[idx] * 1000);
            timeStr = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }

        // Update DOM
        var dirEl = container.querySelector('.forecast-direction');
        var timeEl = container.querySelector('.forecast-time');
        var pillEl = container.querySelector('.forecast-pill');
        if (dirEl) dirEl.textContent = dirText;
        if (timeEl) timeEl.textContent = timeStr;
        if (pillEl) {
            pillEl.textContent = displayVal + fd.unit;
            pillEl.style.background = color;
        }
    }

    function getBarIndexFromX(barsEl, clientX) {
        var rect = barsEl.getBoundingClientRect();
        var x = clientX - rect.left;
        var pct = x / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        var bars = barsEl.querySelectorAll('.forecast-bar');
        return Math.round(pct * (bars.length - 1));
    }

    function initForecastScrubber(barsEl, container) {
        var scrubbing = false;

        function scrubTo(clientX) {
            var idx = getBarIndexFromX(barsEl, clientX);
            selectForecastBar(container, idx);
        }

        // Touch: drag to scrub
        barsEl.addEventListener('touchstart', function (e) {
            scrubbing = true;
            scrubTo(e.touches[0].clientX);
            e.stopPropagation();
        }, { passive: true });

        barsEl.addEventListener('touchmove', function (e) {
            if (!scrubbing) return;
            scrubTo(e.touches[0].clientX);
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        barsEl.addEventListener('touchend', function () {
            scrubbing = false;
        });

        // Desktop: hover to scrub (no click needed)
        barsEl.addEventListener('mousemove', function (e) {
            scrubTo(e.clientX);
        });
    }

    // --- Swipe handling for card carousels ---
    function initCardSwipe() {
        var cards = document.querySelectorAll('.data-card');
        cards.forEach(function (card) {
            var carousel = card.querySelector('.card-carousel');
            if (!carousel) return;

            var startX = 0;
            var startY = 0;
            var isDragging = false;
            var isHorizontal = null;
            var currentOffset = 0;
            var isForecast = false;
            var cardWidth = 0;

            carousel.addEventListener('touchstart', function (e) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                isDragging = true;
                isHorizontal = null;
                cardWidth = card.offsetWidth;
                carousel.style.transition = 'none';
            }, { passive: true });

            carousel.addEventListener('touchmove', function (e) {
                if (!isDragging) return;

                var dx = e.touches[0].clientX - startX;
                var dy = e.touches[0].clientY - startY;

                // Determine direction on first significant move
                if (isHorizontal === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    isHorizontal = Math.abs(dx) > Math.abs(dy);
                }

                if (!isHorizontal) {
                    isDragging = false;
                    return;
                }

                e.preventDefault();

                var baseOffset = isForecast ? -cardWidth : 0;
                var offset = baseOffset + dx;
                // Clamp
                offset = Math.max(-cardWidth, Math.min(0, offset));
                carousel.style.transform = 'translateX(' + offset + 'px)';
                currentOffset = dx;
            }, { passive: false });

            carousel.addEventListener('touchend', function () {
                if (!isDragging || isHorizontal === null) {
                    isDragging = false;
                    carousel.style.transition = '';
                    return;
                }
                isDragging = false;

                var threshold = cardWidth * 0.2;
                carousel.style.transition = '';

                if (!isForecast && currentOffset < -threshold) {
                    // Swipe left → show forecast
                    carousel.classList.add('showing-forecast');
                    isForecast = true;
                } else if (isForecast && currentOffset > threshold) {
                    // Swipe right → show current
                    carousel.classList.remove('showing-forecast');
                    isForecast = false;
                } else {
                    // Snap back
                    if (isForecast) {
                        carousel.classList.add('showing-forecast');
                    } else {
                        carousel.classList.remove('showing-forecast');
                    }
                }

                carousel.style.transform = '';
                currentOffset = 0;
            });

            // Mouse drag support for desktop
            carousel.addEventListener('mousedown', function (e) {
                startX = e.clientX;
                isDragging = true;
                isHorizontal = true;
                cardWidth = card.offsetWidth;
                carousel.style.transition = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (!isDragging || !isHorizontal) return;

                var dx = e.clientX - startX;
                var baseOffset = isForecast ? -cardWidth : 0;
                var offset = baseOffset + dx;
                offset = Math.max(-cardWidth, Math.min(0, offset));
                carousel.style.transform = 'translateX(' + offset + 'px)';
                currentOffset = dx;
            });

            document.addEventListener('mouseup', function () {
                if (!isDragging) return;
                isDragging = false;

                var threshold = cardWidth * 0.2;
                carousel.style.transition = '';

                if (!isForecast && currentOffset < -threshold) {
                    carousel.classList.add('showing-forecast');
                    isForecast = true;
                } else if (isForecast && currentOffset > threshold) {
                    carousel.classList.remove('showing-forecast');
                    isForecast = false;
                } else {
                    if (isForecast) {
                        carousel.classList.add('showing-forecast');
                    } else {
                        carousel.classList.remove('showing-forecast');
                    }
                }

                carousel.style.transform = '';
                currentOffset = 0;
            });
        });
    }

    initCardSwipe();

    function applyWeatherData(data) {
        if (!data) return;
        if (pauseWeather) return;
        target.windX = data.windX;
        target.windY = data.windY;
        target.size = data.size;
        target.choppiness = data.choppiness;
        updateHUD(data);
    }

    OceanWeather.init(applyWeatherData);

    // --- Location picker ---
    function clearHUD() {
        document.getElementById('condition-icon').innerHTML = '';
        document.getElementById('condition-text').textContent = '--';
        document.getElementById('sea-state-label').textContent = '--';
        document.getElementById('wave-height').textContent = '--';
        document.getElementById('wave-period').textContent = '--';
        document.getElementById('wind-speed').textContent = '--';
        document.getElementById('wind-gust').textContent = '--';
        document.getElementById('card-temp-val').textContent = '--';
        document.getElementById('card-temp-detail').textContent = '--';
        document.getElementById('tide-val').textContent = '--';
        document.getElementById('tide-state').textContent = '--';
        ['trend-temp', 'trend-wind', 'trend-swell', 'trend-period'].forEach(function (id) {
            document.getElementById(id).innerHTML = '';
        });
    }

    function loadLocation(loc) {
        document.getElementById('location-name').textContent = loc.name;
        document.getElementById('location-coords').textContent = 'Near Coastal';
        clearHUD();
        OceanWeather.setLocation(loc);
    }

    // --- Determine location from URL params or default ---
    var urlParams = new URLSearchParams(window.location.search);
    var paramLat = urlParams.get('lat');
    var paramLng = urlParams.get('lng');

    if (paramLat && paramLng) {
        var lat = parseFloat(paramLat);
        var lng = parseFloat(paramLng);
        var name = urlParams.get('name');
        if (!name) {
            name = lat.toFixed(3) + ', ' + lng.toFixed(3);
        }
        loadLocation({ name: name, lat: lat, lng: lng });
    } else {
        loadLocation(OceanWeather.getDefaultLocation());
    }

    // --- Card scroll-in animations ---
    var cardObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                cardObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.data-card').forEach(function (card) {
        cardObserver.observe(card);
    });

    // --- Header collapse on scroll ---
    var heroTop = document.getElementById('hero-top');
    var heroSection = document.getElementById('hero');
    var isCollapsed = false;

    function checkHeaderCollapse() {
        var scrollY = window.scrollY || document.documentElement.scrollTop;
        var triggerPoint = heroSection.offsetHeight * 0.65;
        var shouldCollapse = scrollY > triggerPoint;

        if (shouldCollapse !== isCollapsed) {
            isCollapsed = shouldCollapse;
            if (shouldCollapse) {
                heroTop.classList.add('collapsed');
            } else {
                heroTop.classList.remove('collapsed');
            }
            // CSS clamp() handles font resizing automatically
        }
    }

    window.addEventListener('scroll', checkHeaderCollapse, { passive: true });

    // --- Render loop ---
    var lastTime = 0;
    var started = false;

    function render(time) {
        requestAnimationFrame(render);

        var timeSeconds = time / 1000;
        var dt = lastTime ? timeSeconds - lastTime : 1 / 60;
        lastTime = timeSeconds;

        dt = Math.min(dt, 1 / 15);

        lerpParams(dt);
        checkPerformance(dt);
        simulator.render(dt, projectionMatrix, camera.getViewMatrix(), camera.getPosition());

        if (!started) {
            started = true;
            var loadingEl = document.getElementById('loading');
            loadingEl.classList.add('hidden');
            setTimeout(function () {
                loadingEl.style.display = 'none';
            }, 800);
        }
    }

    requestAnimationFrame(render);

    // --- Admin tuning panel ---
    var adminPanel = document.getElementById('admin-panel');

    document.getElementById('admin-toggle').addEventListener('click', function () {
        adminPanel.classList.toggle('open');
        if (adminPanel.classList.contains('open')) syncSlidersToCurrentValues();
    });
    document.getElementById('admin-close').addEventListener('click', function () {
        adminPanel.classList.remove('open');
    });

    function syncSlidersToCurrentValues() {
        var speed = Math.sqrt(current.windX * current.windX + current.windY * current.windY);
        var dir = (Math.atan2(current.windX, current.windY) * 180 / Math.PI + 360) % 360;
        setSlider('slider-windspeed', speed);
        setSlider('slider-winddir', Math.round(dir));
        setSlider('slider-windx', current.windX);
        setSlider('slider-windy', current.windY);
        setSlider('slider-size', current.size);
        setSlider('slider-chop', current.choppiness);
        setSlider('slider-elevation', camera.getElevation());
    }

    function setSlider(id, value) {
        var el = document.getElementById(id);
        el.value = value;
        var valId = 'val-' + id.replace('slider-', '');
        var decimals = id === 'slider-winddir' ? 0
            : id === 'slider-size' ? 0
            : id === 'slider-elevation' ? 2
            : 1;
        document.getElementById(valId).textContent = parseFloat(value).toFixed(decimals);
    }

    function applyFromSpeedDir() {
        var speed = parseFloat(document.getElementById('slider-windspeed').value);
        var dir = parseFloat(document.getElementById('slider-winddir').value) * Math.PI / 180;
        var wx = speed * Math.sin(dir);
        var wy = speed * Math.cos(dir);
        setSlider('slider-windx', wx);
        setSlider('slider-windy', wy);
        applyManualParams(wx, wy);
    }

    function applyFromComponents() {
        var wx = parseFloat(document.getElementById('slider-windx').value);
        var wy = parseFloat(document.getElementById('slider-windy').value);
        var speed = Math.sqrt(wx * wx + wy * wy);
        var dir = (Math.atan2(wx, wy) * 180 / Math.PI + 360) % 360;
        setSlider('slider-windspeed', speed);
        setSlider('slider-winddir', Math.round(dir));
        applyManualParams(wx, wy);
    }

    function applyManualParams(wx, wy) {
        pauseWeather = true;
        var size = parseFloat(document.getElementById('slider-size').value);
        var chop = parseFloat(document.getElementById('slider-chop').value);
        target.windX = wx;
        target.windY = wy;
        target.size = size;
        target.choppiness = chop;
    }

    ['slider-windspeed', 'slider-winddir'].forEach(function (id) {
        document.getElementById(id).addEventListener('input', function () {
            document.getElementById('val-' + id.replace('slider-', '')).textContent =
                parseFloat(this.value).toFixed(id === 'slider-winddir' ? 0 : 1);
            applyFromSpeedDir();
        });
    });

    ['slider-windx', 'slider-windy'].forEach(function (id) {
        document.getElementById(id).addEventListener('input', function () {
            document.getElementById('val-' + id.replace('slider-', '')).textContent =
                parseFloat(this.value).toFixed(1);
            applyFromComponents();
        });
    });

    document.getElementById('slider-size').addEventListener('input', function () {
        document.getElementById('val-size').textContent = parseFloat(this.value).toFixed(0);
        pauseWeather = true;
        target.size = parseFloat(this.value);
    });

    document.getElementById('slider-chop').addEventListener('input', function () {
        document.getElementById('val-chop').textContent = parseFloat(this.value).toFixed(2);
        pauseWeather = true;
        target.choppiness = parseFloat(this.value);
    });

    document.getElementById('slider-elevation').addEventListener('input', function () {
        var val = parseFloat(this.value);
        document.getElementById('val-elevation').textContent = val.toFixed(2);
        camera.setElevation(val);
    });

    var PRESETS = {
        calm: { windX: 2, windY: 2, size: 150, choppiness: 0.3 },
        moderate: { windX: 8, windY: 8, size: 300, choppiness: 1.2 },
        stormy: { windX: 16, windY: 16, size: 600, choppiness: 2.0 },
        hurricane: { windX: 20, windY: 18, size: 900, choppiness: 2.5 }
    };

    document.querySelectorAll('.preset-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var p = PRESETS[this.dataset.preset];
            if (!p) return;
            pauseWeather = true;
            target.windX = p.windX;
            target.windY = p.windY;
            target.size = p.size;
            target.choppiness = p.choppiness;
            syncSlidersToCurrentValues();
            setSlider('slider-windx', p.windX);
            setSlider('slider-windy', p.windY);
            setSlider('slider-size', p.size);
            setSlider('slider-chop', p.choppiness);
            var speed = Math.sqrt(p.windX * p.windX + p.windY * p.windY);
            var dir = (Math.atan2(p.windX, p.windY) * 180 / Math.PI + 360) % 360;
            setSlider('slider-windspeed', speed);
            setSlider('slider-winddir', Math.round(dir));
        });
    });

    document.getElementById('btn-copy-params').addEventListener('click', function () {
        var params = {
            windX: +current.windX.toFixed(2),
            windY: +current.windY.toFixed(2),
            size: +current.size.toFixed(1),
            choppiness: +current.choppiness.toFixed(3)
        };
        navigator.clipboard.writeText(JSON.stringify(params, null, 2)).then(function () {
            var btn = document.getElementById('btn-copy-params');
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = 'Copy Params'; }, 1500);
        });
    });

    document.getElementById('btn-resume-weather').addEventListener('click', function () {
        pauseWeather = false;
        var conditions = OceanWeather.getCurrentConditions();
        if (conditions) applyWeatherData(conditions);
    });

    // --- Dev console API ---
    window.waves = {
        setWind: function (x, y) { target.windX = x; target.windY = y; },
        setSize: function (s) { target.size = s; },
        setChoppiness: function (c) { target.choppiness = c; },
        setImmediate: function (windX, windY, size, choppiness) {
            current.windX = target.windX = windX;
            current.windY = target.windY = windY;
            current.size = target.size = size;
            current.choppiness = target.choppiness = choppiness;
            simulator.setWind(windX, windY);
            simulator.setSize(size);
            simulator.setChoppiness(choppiness);
        },
        getParams: function () {
            return { current: Object.assign({}, current), target: Object.assign({}, target) };
        }
    };

})();
