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

        // Pill value
        document.getElementById('card-tide-val').textContent = tide.height.toFixed(1);

        // State label
        document.getElementById('card-tide-state').textContent = tide.state;

        // Time labels
        document.getElementById('tide-time-top').textContent = OceanWeather.formatTideTime(tide.prevTime);
        document.getElementById('tide-time-bottom').textContent = OceanWeather.formatTideTime(tide.nextTime);

        // Dot position (8% to 92% range to keep dot within track)
        var indicator = document.getElementById('tide-indicator');
        var topPct = 8 + (tide.progress * 84);
        indicator.style.top = topPct + '%';

        // Rising/falling direction
        if (tide.rising) {
            indicator.classList.add('rising');
            indicator.classList.remove('falling');
        } else {
            indicator.classList.add('falling');
            indicator.classList.remove('rising');
        }
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
                var isNow = i === 0 ? ' is-now' : '';
                barsHTML += '<div class="forecast-bar' + isNow + '" style="height:' + pct + '%;background:' + barColor + '"></div>';
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
        document.getElementById('card-tide-val').textContent = '--';
        document.getElementById('card-tide-state').textContent = '--';
        document.getElementById('tide-time-top').textContent = '--:--';
        document.getElementById('tide-time-bottom').textContent = '--:--';
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
