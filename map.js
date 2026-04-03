// map.js — Mapbox location picker for Waves

(function () {
    'use strict';

    mapboxgl.accessToken = (typeof MAPBOX_TOKEN !== 'undefined') ? MAPBOX_TOKEN : '';

    // --- California harbor / coastal locations ---
    var CA_HARBORS = [
        { name: 'Crescent City', lat: 41.745, lng: -124.202 },
        { name: 'Trinidad', lat: 41.059, lng: -124.143 },
        { name: 'Eureka', lat: 40.802, lng: -124.163 },
        { name: 'Shelter Cove', lat: 40.027, lng: -124.073 },
        { name: 'Fort Bragg', lat: 39.445, lng: -123.804 },
        { name: 'Point Arena', lat: 38.909, lng: -123.707 },
        { name: 'Bodega Bay', lat: 38.333, lng: -123.048 },
        { name: 'Tomales Bay', lat: 38.189, lng: -122.935 },
        { name: 'Bolinas', lat: 37.909, lng: -122.687 },
        { name: 'Stinson Beach', lat: 37.898, lng: -122.643 },
        { name: 'San Francisco', lat: 37.808, lng: -122.477 },
        { name: 'Pillar Point Harbor', lat: 37.494, lng: -122.482 },
        { name: 'Half Moon Bay', lat: 37.464, lng: -122.428 },
        { name: 'Pacifica', lat: 37.613, lng: -122.501 },
        { name: 'Santa Cruz', lat: 36.963, lng: -122.017 },
        { name: 'Moss Landing', lat: 36.804, lng: -121.789 },
        { name: 'Monterey', lat: 36.600, lng: -121.894 },
        { name: 'Pacific Grove', lat: 36.626, lng: -121.920 },
        { name: 'Big Sur', lat: 36.270, lng: -121.807 },
        { name: 'San Simeon', lat: 35.643, lng: -121.190 },
        { name: 'Morro Bay', lat: 35.371, lng: -120.849 },
        { name: 'Avila Beach', lat: 35.180, lng: -120.731 },
        { name: 'Pismo Beach', lat: 35.143, lng: -120.641 },
        { name: 'Santa Barbara', lat: 34.403, lng: -119.693 },
        { name: 'Ventura', lat: 34.275, lng: -119.264 },
        { name: 'Oxnard', lat: 34.187, lng: -119.225 },
        { name: 'Malibu', lat: 34.036, lng: -118.677 },
        { name: 'Santa Monica', lat: 34.008, lng: -118.497 },
        { name: 'Manhattan Beach', lat: 33.885, lng: -118.411 },
        { name: 'Redondo Beach', lat: 33.849, lng: -118.388 },
        { name: 'Long Beach', lat: 33.762, lng: -118.189 },
        { name: 'Huntington Beach', lat: 33.656, lng: -118.000 },
        { name: 'Newport Beach', lat: 33.607, lng: -117.930 },
        { name: 'Laguna Beach', lat: 33.542, lng: -117.785 },
        { name: 'Dana Point', lat: 33.460, lng: -117.698 },
        { name: 'Oceanside', lat: 33.196, lng: -117.380 },
        { name: 'Carlsbad', lat: 33.159, lng: -117.351 },
        { name: 'Encinitas', lat: 33.037, lng: -117.292 },
        { name: 'Del Mar', lat: 32.959, lng: -117.265 },
        { name: 'La Jolla', lat: 32.851, lng: -117.274 },
        { name: 'San Diego', lat: 32.715, lng: -117.169 },
        { name: 'Coronado', lat: 32.681, lng: -117.178 }
    ];

    // --- Initialize map ---
    var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-120.5, 36.5],
        zoom: 5.8,
        minZoom: 3,
        maxZoom: 14,
        attributionControl: false
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    // --- Darken map to match ocean aesthetic ---
    map.on('style.load', function () {
        try {
            map.setPaintProperty('water', 'fill-color', '#081428');
            map.setPaintProperty('land', 'background-color', '#0a1a2e');
        } catch (e) {
            // Some layers may not exist in all zoom levels
        }

        // Reduce label brightness
        var layers = map.getStyle().layers;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                try {
                    map.setPaintProperty(layer.id, 'text-color', 'rgba(255, 255, 255, 0.5)');
                } catch (e) {}
            }
        }
    });

    // --- Track temporary ocean marker ---
    var tempMarker = null;

    // --- Create harbor markers ---
    function createPopupHTML(name, lat, lng) {
        var coordsText = lat.toFixed(3) + ', ' + lng.toFixed(3);
        var params = 'lat=' + lat + '&lng=' + lng;
        if (name) params += '&name=' + encodeURIComponent(name);
        return '<div class="popup-name">' + (name || 'Ocean Point') + '</div>' +
               '<div class="popup-coords">' + coordsText + '</div>' +
               '<a class="popup-link" href="index.html?' + params + '">View Waves →</a>';
    }

    var markerClickedRecently = false;

    CA_HARBORS.forEach(function (loc) {
        var el = document.createElement('div');
        el.className = 'marker-harbor';

        var popup = new mapboxgl.Popup({ offset: 12, closeButton: true })
            .setHTML(createPopupHTML(loc.name, loc.lat, loc.lng));

        var marker = new mapboxgl.Marker({ element: el })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(popup)
            .addTo(map);

        // Prevent map click from firing when clicking a marker
        el.addEventListener('click', function () {
            markerClickedRecently = true;
            setTimeout(function () { markerClickedRecently = false; }, 100);
        });
    });

    // --- Ocean click: place temporary pin ---
    map.on('click', function (e) {
        if (markerClickedRecently) return;

        var lat = e.lngLat.lat;
        var lng = e.lngLat.lng;

        // Remove previous temporary marker
        if (tempMarker) {
            tempMarker.remove();
            tempMarker = null;
        }

        // Check if click is over water (not land)
        var features = map.queryRenderedFeatures(e.point, { layers: ['land'] });
        if (features.length > 0) return; // Clicked on land, ignore

        // Create temporary ocean marker
        var el = document.createElement('div');
        el.className = 'marker-ocean';

        var popup = new mapboxgl.Popup({ offset: 12, closeButton: true })
            .setHTML(createPopupHTML(null, lat, lng));

        tempMarker = new mapboxgl.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map);

        tempMarker.togglePopup();
    });

    // --- Change cursor on water ---
    map.on('mousemove', function (e) {
        var features = map.queryRenderedFeatures(e.point, { layers: ['land'] });
        map.getCanvas().style.cursor = features.length > 0 ? '' : 'crosshair';
    });

})();
