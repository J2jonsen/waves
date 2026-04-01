// data.js — Weather data cards page logic

(function () {
    'use strict';

    var locations = OceanWeather.getLocations();
    var currentLocation = locations[0];
    var useFahrenheit = false;
    var useFeet = false;
    var lastData = null;

    // --- Location picker ---
    var selectEl = document.getElementById('location-select');
    for (var i = 0; i < locations.length; i++) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = locations[i].name;
        selectEl.appendChild(opt);
    }
    selectEl.addEventListener('change', function () {
        currentLocation = locations[parseInt(selectEl.value)];
        document.getElementById('location-name').textContent = currentLocation.name;
        document.getElementById('updated-at').textContent = 'Fetching data...';
        fetchData();
    });

    // --- Unit toggles ---
    document.getElementById('toggle-sst').addEventListener('click', function () {
        useFahrenheit = !useFahrenheit;
        this.textContent = useFahrenheit ? 'Switch to \u00B0C' : 'Switch to \u00B0F';
        document.getElementById('unit-sst').innerHTML = useFahrenheit ? '&deg;F' : '&deg;C';
        if (lastData) updateCards(lastData);
    });

    document.getElementById('toggle-height').addEventListener('click', function () {
        useFeet = !useFeet;
        this.textContent = useFeet ? 'Switch to m' : 'Switch to ft';
        document.getElementById('unit-height').textContent = useFeet ? 'ft' : 'm';
        if (lastData) updateCards(lastData);
    });

    // --- Fetch and display ---
    function fetchData() {
        OceanWeather.fetchForLocation(currentLocation).then(function (data) {
            if (!data || !data.raw) return;
            lastData = data;
            updateCards(data);
            document.getElementById('updated-at').textContent =
                'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
    }

    function updateCards(data) {
        var r = data.raw;

        // Sea Surface Temperature
        var tempC = r.seaSurfaceTemp;
        var tempDisplay = useFahrenheit ? (tempC * 9 / 5 + 32).toFixed(1) : tempC.toFixed(1);
        var valSST = document.getElementById('val-sst');
        valSST.textContent = tempDisplay;
        valSST.className = 'card-value ' + getTempClass(tempC);

        // Wave Height
        var heightM = r.waveHeight;
        var heightDisplay = useFeet ? (heightM * 3.281).toFixed(1) : heightM.toFixed(1);
        document.getElementById('val-height').textContent = heightDisplay;

        // Wave Direction
        var dir = r.waveDirection;
        document.getElementById('val-direction').textContent = Math.round(dir);
        document.getElementById('sub-direction').textContent = OceanWeather.degreesToCompass(dir);

        // Rotate compass arrow
        var arrow = document.getElementById('compass-arrow');
        if (arrow) {
            arrow.style.transformOrigin = '12px 12px';
            arrow.style.transform = 'rotate(' + dir + 'deg)';
        }

        // Wave Period
        var period = r.wavePeriod;
        document.getElementById('val-period').textContent = period.toFixed(1);
        document.getElementById('sub-period').textContent = getPeriodLabel(period);
    }

    function getTempClass(tempC) {
        if (tempC < 10) return 'temp-cold';
        if (tempC < 16) return 'temp-cool';
        if (tempC < 22) return 'temp-mild';
        if (tempC < 28) return 'temp-warm';
        return 'temp-hot';
    }

    function getPeriodLabel(period) {
        if (period < 6) return 'Short period (wind swell)';
        if (period < 10) return 'Medium period';
        if (period < 14) return 'Long period (ground swell)';
        return 'Very long period';
    }

    // --- Init ---
    document.getElementById('location-name').textContent = currentLocation.name;
    fetchData();

    // Refresh every 15 minutes
    setInterval(fetchData, 15 * 60 * 1000);
})();
