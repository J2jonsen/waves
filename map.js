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

    // --- Build GeoJSON from harbors ---
    var harborsGeoJSON = {
        type: 'FeatureCollection',
        features: CA_HARBORS.map(function (loc) {
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [loc.lng, loc.lat] },
                properties: { name: loc.name, lat: loc.lat, lng: loc.lng }
            };
        })
    };

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

    // --- Popup helper ---
    function createPopupHTML(name, lat, lng) {
        var coordsText = lat.toFixed(3) + ', ' + lng.toFixed(3);
        var params = 'lat=' + lat + '&lng=' + lng;
        if (name) params += '&name=' + encodeURIComponent(name);
        return '<div class="popup-name">' + (name || 'Ocean Point') + '</div>' +
               '<div class="popup-coords">' + coordsText + '</div>' +
               '<a class="popup-link" href="index.html?' + params + '">View Waves →</a>';
    }

    // --- Track state ---
    var tempMarker = null;
    var harborPopup = new mapboxgl.Popup({ offset: 12, closeButton: true });

    // --- On style load: add harbor layer + darken map ---
    map.on('load', function () {
        // Darken map colors
        var layers = map.getStyle().layers;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.id.indexOf('water') !== -1 && layer.type === 'fill') {
                try { map.setPaintProperty(layer.id, 'fill-color', '#081428'); } catch (e) {}
            }
            if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                try { map.setPaintProperty(layer.id, 'text-color', 'rgba(255, 255, 255, 0.5)'); } catch (e) {}
            }
        }

        // Add harbors as a GeoJSON source + circle layer (GPU-rendered)
        map.addSource('harbors', {
            type: 'geojson',
            data: harborsGeoJSON
        });

        map.addLayer({
            id: 'harbors-circle',
            type: 'circle',
            source: 'harbors',
            paint: {
                'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    4, 4,
                    8, 6,
                    12, 8
                ],
                'circle-color': '#AFC3D5',
                'circle-stroke-color': 'rgba(255, 255, 255, 0.3)',
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.9
            }
        });

        // Hover effect: enlarge on hover
        map.addLayer({
            id: 'harbors-circle-hover',
            type: 'circle',
            source: 'harbors',
            paint: {
                'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    4, 7,
                    8, 9,
                    12, 12
                ],
                'circle-color': '#AFC3D5',
                'circle-stroke-color': 'rgba(255, 255, 255, 0.5)',
                'circle-stroke-width': 2,
                'circle-opacity': 0.5
            },
            filter: ['==', ['get', 'name'], '']
        });

        // --- Harbor click: show popup ---
        map.on('click', 'harbors-circle', function (e) {
            if (!e.features || !e.features.length) return;
            var props = e.features[0].properties;
            var coords = e.features[0].geometry.coordinates.slice();

            harborPopup
                .setLngLat(coords)
                .setHTML(createPopupHTML(props.name, props.lat, props.lng))
                .addTo(map);
        });

        // --- Harbor hover: pointer cursor + highlight ---
        map.on('mouseenter', 'harbors-circle', function (e) {
            map.getCanvas().style.cursor = 'pointer';
            if (e.features && e.features.length) {
                map.setFilter('harbors-circle-hover', ['==', ['get', 'name'], e.features[0].properties.name]);
            }
        });

        map.on('mouseleave', 'harbors-circle', function () {
            map.getCanvas().style.cursor = 'crosshair';
            map.setFilter('harbors-circle-hover', ['==', ['get', 'name'], '']);
        });

        // --- Ocean click: place temporary pin ---
        map.on('click', function (e) {
            // If a harbor was clicked, the harbors-circle handler already fired
            var harborFeatures = map.queryRenderedFeatures(e.point, { layers: ['harbors-circle'] });
            if (harborFeatures.length > 0) return;

            var lat = e.lngLat.lat;
            var lng = e.lngLat.lng;

            // Remove previous temporary marker
            if (tempMarker) {
                tempMarker.remove();
                tempMarker = null;
            }

            // Close any open harbor popup
            harborPopup.remove();

            // Create temporary ocean marker (DOM — only 1 at a time, no lag)
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
    });

})();
