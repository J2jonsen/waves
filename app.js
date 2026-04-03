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
        return SEVERITY_COLORS[getSeverity(value, metric)];
    }

    function updateHUD(data) {
        if (!data || !data.raw) return;
        var r = data.raw;

        // Weather condition + sea state
        document.getElementById('weather-condition').textContent = r.weatherCondition;
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

        // Update bar charts
        var hourly = OceanWeather.getHourlyData();
        if (hourly) updateBars(hourly);
    }

    function updateCards(r) {
        var heightFt = r.waveHeight * 3.281;
        var windColor   = severityColor(r.windSpeedMph, 'wind');
        var swellColor  = severityColor(heightFt, 'height');
        var periodColor = severityColor(r.wavePeriod, 'period');

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

    function getPeriodLabel(period) {
        if (period < 6) return 'Short';
        if (period < 10) return 'Medium';
        if (period < 14) return 'Long';
        return 'Very Long';
    }

    // --- Bar chart rendering ---
    var BAR_COUNT = 6;

    function updateBars(hourly) {
        renderBars('bars-wind',   hourly.windSpeed,  'wind');
        renderBars('bars-swell',  hourly.waveHeight, 'height');
        renderBars('bars-period', hourly.wavePeriod, 'period');
    }

    function renderBars(containerId, data, metric) {
        var container = document.getElementById(containerId);
        if (!container || !data || data.length === 0) return;

        // Sample BAR_COUNT evenly-spaced points from the data
        var n = data.length;
        var samples = [];
        for (var i = 0; i < BAR_COUNT; i++) {
            var idx = Math.round(i * (n - 1) / (BAR_COUNT - 1));
            var v = data[idx];
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
            var labelsRow = document.createElement('div');
            labelsRow.className = 'bar-labels';
            var labelNow = document.createElement('span');
            labelNow.className = 'bar-label';
            labelNow.textContent = 'now';
            var labelEnd = document.createElement('span');
            labelEnd.className = 'bar-label';
            labelEnd.textContent = '+24hr';
            labelsRow.appendChild(labelNow);
            labelsRow.appendChild(labelEnd);
            container.appendChild(labelsRow);

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
    var locations = OceanWeather.getLocations();
    var currentLocationIndex = 0;

    function fitLocationName(el) {
        // Reset to base size so CSS takes effect
        el.style.fontSize = '';
        var headerEl = document.getElementById('hero-top');
        if (!headerEl) return;
        var collapsed = headerEl.classList.contains('collapsed');
        var logoEl = document.getElementById('logo');
        var logoWidth = logoEl ? logoEl.offsetWidth : 60;
        // Use header width as stable reference (doesn't shrink with text)
        var padding = 40; // left + right padding on hero-top
        var arrowWidth = 40; // arrow button + gap
        var maxWidth = collapsed
            ? (headerEl.offsetWidth - logoWidth - padding - arrowWidth - 12) // 12 = grid gap
            : (headerEl.offsetWidth - padding - arrowWidth);
        var fontSize = parseFloat(getComputedStyle(el).fontSize);
        var minSize = collapsed ? 22 : 24;
        while (el.scrollWidth > maxWidth && fontSize > minSize) {
            fontSize -= 1;
            el.style.fontSize = fontSize + 'px';
        }
    }

    function setLocation(idx) {
        currentLocationIndex = idx;
        var loc = locations[idx];
        var nameEl = document.getElementById('location-name');
        nameEl.textContent = loc.name;
        fitLocationName(nameEl);
        document.getElementById('location-coords').textContent =
            'LAT ' + loc.lat.toFixed(3) + '    LON ' + Math.abs(loc.lng).toFixed(3);
        OceanWeather.setLocation(loc);
    }

    window.addEventListener('resize', function () {
        var nameEl = document.getElementById('location-name');
        fitLocationName(nameEl);
    });

    document.getElementById('location-next').addEventListener('click', function () {
        setLocation((currentLocationIndex + 1) % locations.length);
    });

    setLocation(0);

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
            // Refit location name for new size
            setTimeout(function () {
                fitLocationName(document.getElementById('location-name'));
            }, 50);
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
