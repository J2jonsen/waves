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
    var LERP_SPEED = 1.5; // per second — full convergence in ~2-3s
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
        var changed = false;

        var newWindX = current.windX + (target.windX - current.windX) * t;
        var newWindY = current.windY + (target.windY - current.windY) * t;
        if (Math.abs(newWindX - current.windX) > 0.001 || Math.abs(newWindY - current.windY) > 0.001) {
            current.windX = newWindX;
            current.windY = newWindY;
            simulator.setWind(current.windX, current.windY);
            changed = true;
        }

        var newSize = current.size + (target.size - current.size) * t;
        if (Math.abs(newSize - current.size) > 0.1) {
            current.size = newSize;
            simulator.setSize(current.size);
            changed = true;
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
                // Drop to DPR 1.0 for better perf
                renderScale = 1.0;
                resizeCanvas();
                simulator.resize(canvas.width, canvas.height);
                updateProjection();
                console.log('Reduced render scale for performance');
            }
            perfCheckDone = true;
        }
    }

    // --- Weather integration ---
    var hudVisible = false;

    function updateHUD(data) {
        if (!data || !data.raw) return;
        var r = data.raw;
        document.getElementById('wave-height').textContent = r.waveHeight.toFixed(1) + 'm';
        document.getElementById('wave-period').textContent = r.wavePeriod.toFixed(0) + 's';
        document.getElementById('wind-speed').textContent = r.windSpeedMs.toFixed(0) + ' m/s';

        if (!hudVisible) {
            document.getElementById('hud').classList.add('visible');
            hudVisible = true;
        }
    }

    function applyWeatherData(data) {
        if (!data) return;
        target.windX = data.windX;
        target.windY = data.windY;
        target.size = data.size;
        target.choppiness = data.choppiness;
        updateHUD(data);
    }

    OceanWeather.init(applyWeatherData);

    // --- Location picker ---
    var selectEl = document.getElementById('location-select');
    var locations = OceanWeather.getLocations();
    for (var i = 0; i < locations.length; i++) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = locations[i].name;
        selectEl.appendChild(opt);
    }
    selectEl.addEventListener('change', function () {
        var loc = locations[parseInt(selectEl.value)];
        document.getElementById('location-name').textContent = loc.name;
        OceanWeather.setLocation(loc);
    });

    // Start with first location
    document.getElementById('location-name').textContent = locations[0].name;
    OceanWeather.setLocation(locations[0]);

    // --- Render loop ---
    var lastTime = 0;
    var started = false;

    function render(time) {
        requestAnimationFrame(render);

        var timeSeconds = time / 1000;
        var dt = lastTime ? timeSeconds - lastTime : 1 / 60;
        lastTime = timeSeconds;

        // Cap delta to avoid huge jumps on tab refocus
        dt = Math.min(dt, 1 / 15);

        // Smooth parameter transitions
        lerpParams(dt);

        // Performance check
        checkPerformance(dt);

        // Render ocean
        simulator.render(dt, projectionMatrix, camera.getViewMatrix(), camera.getPosition());

        // Hide loading screen after first frame
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

    // --- Dev console API ---
    window.waves = {
        setWind: function (x, y) {
            target.windX = x;
            target.windY = y;
        },
        setSize: function (s) {
            target.size = s;
        },
        setChoppiness: function (c) {
            target.choppiness = c;
        },
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
