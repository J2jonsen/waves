// map.js — Mapbox location picker for Waves

(function () {
    'use strict';

    mapboxgl.accessToken = (typeof MAPBOX_TOKEN !== 'undefined') ? MAPBOX_TOKEN : '';

    // --- US Coastal Harbors & Surf Spots ---
    var US_HARBORS = [

        // =============================================
        // PACIFIC — Alaska
        // =============================================
        { name: 'Juneau', lat: 58.301, lng: -134.420 },
        { name: 'Sitka', lat: 57.053, lng: -135.330 },
        { name: 'Kodiak', lat: 57.790, lng: -152.407 },
        { name: 'Seward', lat: 60.104, lng: -149.443 },
        { name: 'Homer', lat: 59.643, lng: -151.548 },
        { name: 'Valdez', lat: 61.131, lng: -146.348 },

        // =============================================
        // PACIFIC — Washington
        // =============================================
        { name: 'Neah Bay', lat: 48.365, lng: -124.614 },
        { name: 'La Push', lat: 47.908, lng: -124.636 },
        { name: 'Westport', lat: 46.890, lng: -124.104 },
        { name: 'Long Beach, WA', lat: 46.352, lng: -124.054 },
        { name: 'Bellingham', lat: 48.752, lng: -122.479 },
        { name: 'Anacortes', lat: 48.513, lng: -122.613 },
        { name: 'Port Townsend', lat: 48.117, lng: -122.760 },
        { name: 'Seattle', lat: 47.606, lng: -122.342 },

        // =============================================
        // PACIFIC — Oregon
        // =============================================
        { name: 'Astoria', lat: 46.188, lng: -123.831 },
        { name: 'Seaside, OR', lat: 45.993, lng: -123.922 },
        { name: 'Cannon Beach', lat: 45.892, lng: -123.961 },
        { name: 'Pacific City', lat: 45.204, lng: -123.964 },
        { name: 'Lincoln City', lat: 44.958, lng: -124.018 },
        { name: 'Newport, OR', lat: 44.637, lng: -124.053 },
        { name: 'Florence', lat: 43.983, lng: -124.100 },
        { name: 'Coos Bay', lat: 43.367, lng: -124.218 },
        { name: 'Gold Beach', lat: 42.408, lng: -124.422 },
        { name: 'Brookings', lat: 42.053, lng: -124.284 },

        // =============================================
        // PACIFIC — California
        // =============================================
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
        { name: 'Coronado', lat: 32.681, lng: -117.178 },

        // =============================================
        // PACIFIC — Hawaii
        // =============================================
        { name: 'Pipeline (North Shore)', lat: 21.665, lng: -158.051 },
        { name: 'Sunset Beach', lat: 21.678, lng: -158.041 },
        { name: 'Haleiwa', lat: 21.579, lng: -158.103 },
        { name: 'Waimea Bay', lat: 21.643, lng: -158.066 },
        { name: 'Waikiki', lat: 21.276, lng: -157.827 },
        { name: 'Honolulu Harbor', lat: 21.308, lng: -157.867 },
        { name: 'Makaha', lat: 21.473, lng: -158.219 },
        { name: 'Kailua (Oahu)', lat: 21.402, lng: -157.744 },
        { name: 'Lahaina, Maui', lat: 20.872, lng: -156.678 },
        { name: 'Hookipa Beach, Maui', lat: 20.937, lng: -156.356 },
        { name: 'Peahi (Jaws), Maui', lat: 20.943, lng: -156.297 },
        { name: 'Hilo', lat: 19.730, lng: -155.090 },
        { name: 'Kona', lat: 19.640, lng: -155.997 },
        { name: 'Poipu, Kauai', lat: 21.877, lng: -159.455 },
        { name: 'Hanalei Bay, Kauai', lat: 22.209, lng: -159.505 },

        // =============================================
        // GULF — Texas
        // =============================================
        { name: 'South Padre Island', lat: 26.107, lng: -97.165 },
        { name: 'Port Isabel', lat: 26.073, lng: -97.209 },
        { name: 'Port Aransas', lat: 27.834, lng: -97.061 },
        { name: 'Corpus Christi', lat: 27.801, lng: -97.396 },
        { name: 'Galveston', lat: 29.301, lng: -94.797 },
        { name: 'Surfside Beach, TX', lat: 28.943, lng: -95.293 },
        { name: 'Port O\'Connor', lat: 28.446, lng: -96.406 },

        // =============================================
        // GULF — Louisiana
        // =============================================
        { name: 'Grand Isle', lat: 29.236, lng: -89.987 },
        { name: 'Port Fourchon', lat: 29.114, lng: -90.199 },
        { name: 'Venice', lat: 29.275, lng: -89.353 },
        { name: 'Cameron', lat: 29.797, lng: -93.325 },

        // =============================================
        // GULF — Mississippi
        // =============================================
        { name: 'Biloxi', lat: 30.396, lng: -88.885 },
        { name: 'Gulfport', lat: 30.368, lng: -89.093 },
        { name: 'Ocean Springs', lat: 30.411, lng: -88.828 },
        { name: 'Pass Christian', lat: 30.315, lng: -89.247 },

        // =============================================
        // GULF — Alabama
        // =============================================
        { name: 'Gulf Shores', lat: 30.246, lng: -87.701 },
        { name: 'Orange Beach', lat: 30.294, lng: -87.573 },
        { name: 'Dauphin Island', lat: 30.255, lng: -88.110 },
        { name: 'Mobile Bay', lat: 30.438, lng: -88.010 },

        // =============================================
        // GULF — Florida (Gulf Coast)
        // =============================================
        { name: 'Pensacola Beach', lat: 30.329, lng: -87.142 },
        { name: 'Destin', lat: 30.394, lng: -86.496 },
        { name: 'Panama City Beach', lat: 30.177, lng: -85.805 },
        { name: 'Apalachicola', lat: 29.726, lng: -84.983 },
        { name: 'Cedar Key', lat: 29.139, lng: -83.035 },
        { name: 'Clearwater Beach', lat: 27.978, lng: -82.827 },
        { name: 'St. Pete Beach', lat: 27.725, lng: -82.741 },
        { name: 'Sarasota', lat: 27.337, lng: -82.543 },
        { name: 'Fort Myers Beach', lat: 26.452, lng: -81.951 },
        { name: 'Naples', lat: 26.142, lng: -81.795 },
        { name: 'Marco Island', lat: 25.941, lng: -81.718 },
        { name: 'Key West', lat: 24.556, lng: -81.782 },

        // =============================================
        // ATLANTIC — Florida (Atlantic Coast)
        // =============================================
        { name: 'Key Largo', lat: 25.087, lng: -80.437 },
        { name: 'Miami Beach', lat: 25.790, lng: -80.130 },
        { name: 'Fort Lauderdale', lat: 26.121, lng: -80.103 },
        { name: 'Boca Raton', lat: 26.346, lng: -80.073 },
        { name: 'Palm Beach', lat: 26.705, lng: -80.036 },
        { name: 'Jupiter', lat: 26.934, lng: -80.071 },
        { name: 'Sebastian Inlet', lat: 27.857, lng: -80.449 },
        { name: 'Cocoa Beach', lat: 28.320, lng: -80.608 },
        { name: 'New Smyrna Beach', lat: 29.026, lng: -80.927 },
        { name: 'Daytona Beach', lat: 29.211, lng: -81.023 },
        { name: 'St. Augustine', lat: 29.901, lng: -81.313 },
        { name: 'Jacksonville Beach', lat: 30.284, lng: -81.393 },
        { name: 'Amelia Island', lat: 30.636, lng: -81.441 },

        // =============================================
        // ATLANTIC — Georgia
        // =============================================
        { name: 'Tybee Island', lat: 32.000, lng: -80.846 },
        { name: 'St. Simons Island', lat: 31.150, lng: -81.370 },
        { name: 'Jekyll Island', lat: 31.056, lng: -81.421 },
        { name: 'Cumberland Island', lat: 30.853, lng: -81.451 },
        { name: 'Savannah', lat: 32.081, lng: -81.091 },

        // =============================================
        // ATLANTIC — South Carolina
        // =============================================
        { name: 'Hilton Head', lat: 32.149, lng: -80.753 },
        { name: 'Folly Beach', lat: 32.655, lng: -79.940 },
        { name: 'Charleston', lat: 32.776, lng: -79.931 },
        { name: 'Isle of Palms', lat: 32.787, lng: -79.795 },
        { name: 'Pawleys Island', lat: 33.430, lng: -79.121 },
        { name: 'Myrtle Beach', lat: 33.689, lng: -78.887 },

        // =============================================
        // ATLANTIC — North Carolina
        // =============================================
        { name: 'Wrightsville Beach', lat: 34.209, lng: -77.796 },
        { name: 'Carolina Beach', lat: 34.035, lng: -77.893 },
        { name: 'Topsail Beach', lat: 34.328, lng: -77.643 },
        { name: 'Atlantic Beach, NC', lat: 34.698, lng: -76.740 },
        { name: 'Cape Hatteras', lat: 35.223, lng: -75.535 },
        { name: 'Kill Devil Hills', lat: 36.031, lng: -75.676 },
        { name: 'Nags Head', lat: 35.957, lng: -75.624 },
        { name: 'Duck, NC', lat: 36.169, lng: -75.752 },

        // =============================================
        // ATLANTIC — Virginia
        // =============================================
        { name: 'Virginia Beach', lat: 36.853, lng: -75.978 },
        { name: 'Sandbridge', lat: 36.719, lng: -75.933 },
        { name: 'Norfolk', lat: 36.847, lng: -76.292 },
        { name: 'Cape Charles', lat: 37.264, lng: -76.017 },
        { name: 'Chincoteague', lat: 37.933, lng: -75.379 },

        // =============================================
        // ATLANTIC — Maryland
        // =============================================
        { name: 'Ocean City, MD', lat: 38.336, lng: -75.085 },
        { name: 'Assateague Island', lat: 38.208, lng: -75.154 },
        { name: 'Chesapeake Beach', lat: 38.687, lng: -76.535 },
        { name: 'Annapolis', lat: 38.979, lng: -76.492 },

        // =============================================
        // ATLANTIC — Delaware
        // =============================================
        { name: 'Rehoboth Beach', lat: 38.721, lng: -75.076 },
        { name: 'Bethany Beach', lat: 38.540, lng: -75.055 },
        { name: 'Dewey Beach', lat: 38.690, lng: -75.077 },
        { name: 'Lewes', lat: 38.774, lng: -75.139 },

        // =============================================
        // ATLANTIC — New Jersey
        // =============================================
        { name: 'Cape May', lat: 38.935, lng: -74.906 },
        { name: 'Wildwood', lat: 38.992, lng: -74.815 },
        { name: 'Atlantic City', lat: 39.364, lng: -74.423 },
        { name: 'Long Beach Island', lat: 39.630, lng: -74.189 },
        { name: 'Seaside Heights', lat: 39.944, lng: -74.072 },
        { name: 'Asbury Park', lat: 40.220, lng: -73.998 },
        { name: 'Sandy Hook', lat: 40.467, lng: -73.990 },
        { name: 'Belmar', lat: 40.178, lng: -74.015 },

        // =============================================
        // ATLANTIC — New York
        // =============================================
        { name: 'Rockaway Beach', lat: 40.579, lng: -73.836 },
        { name: 'Long Beach, NY', lat: 40.588, lng: -73.658 },
        { name: 'Fire Island', lat: 40.632, lng: -73.175 },
        { name: 'Montauk', lat: 41.036, lng: -71.955 },
        { name: 'Ditch Plains', lat: 41.040, lng: -71.929 },
        { name: 'Hampton Bays', lat: 40.869, lng: -72.522 },

        // =============================================
        // ATLANTIC — Connecticut
        // =============================================
        { name: 'Mystic', lat: 41.354, lng: -71.966 },
        { name: 'New London', lat: 41.356, lng: -72.100 },
        { name: 'Old Saybrook', lat: 41.292, lng: -72.377 },
        { name: 'Bridgeport', lat: 41.179, lng: -73.190 },

        // =============================================
        // ATLANTIC — Rhode Island
        // =============================================
        { name: 'Narragansett', lat: 41.432, lng: -71.449 },
        { name: 'Newport, RI', lat: 41.490, lng: -71.313 },
        { name: 'Misquamicut', lat: 41.333, lng: -71.793 },
        { name: 'Block Island', lat: 41.173, lng: -71.577 },
        { name: 'Point Judith', lat: 41.362, lng: -71.482 },

        // =============================================
        // ATLANTIC — Massachusetts
        // =============================================
        { name: 'Westport', lat: 41.510, lng: -71.080 },
        { name: 'New Bedford', lat: 41.636, lng: -70.927 },
        { name: 'Martha\'s Vineyard', lat: 41.390, lng: -70.645 },
        { name: 'Nantucket', lat: 41.283, lng: -70.099 },
        { name: 'Chatham', lat: 41.682, lng: -69.960 },
        { name: 'Wellfleet', lat: 41.931, lng: -70.031 },
        { name: 'Provincetown', lat: 42.052, lng: -70.187 },
        { name: 'Plymouth', lat: 41.958, lng: -70.662 },
        { name: 'Scituate', lat: 42.200, lng: -70.716 },
        { name: 'Gloucester', lat: 42.614, lng: -70.662 },
        { name: 'Rockport, MA', lat: 42.660, lng: -70.620 },
        { name: 'Newburyport', lat: 42.812, lng: -70.872 },

        // =============================================
        // ATLANTIC — New Hampshire
        // =============================================
        { name: 'Hampton Beach', lat: 42.909, lng: -70.811 },
        { name: 'Rye Beach', lat: 43.005, lng: -70.753 },
        { name: 'Portsmouth, NH', lat: 43.072, lng: -70.763 },

        // =============================================
        // ATLANTIC — Maine
        // =============================================
        { name: 'Kittery', lat: 43.088, lng: -70.736 },
        { name: 'York Beach', lat: 43.172, lng: -70.609 },
        { name: 'Kennebunkport', lat: 43.362, lng: -70.476 },
        { name: 'Old Orchard Beach', lat: 43.517, lng: -70.377 },
        { name: 'Portland, ME', lat: 43.657, lng: -70.249 },
        { name: 'Boothbay Harbor', lat: 43.850, lng: -69.629 },
        { name: 'Camden', lat: 44.210, lng: -69.065 },
        { name: 'Bar Harbor', lat: 44.388, lng: -68.204 },
        { name: 'Eastport', lat: 44.906, lng: -66.990 }
    ];

    // --- Build GeoJSON from harbors ---
    var harborsGeoJSON = {
        type: 'FeatureCollection',
        features: US_HARBORS.map(function (loc) {
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
        center: [-98, 38],
        zoom: 3.5,
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
               '<a class="popup-link" href="./?'  + params + '">View Waves →</a>';
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
                try { map.setPaintProperty(layer.id, 'fill-color', '#040C1A'); } catch (e) {}
            }
            if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                try { map.setPaintProperty(layer.id, 'text-color', 'rgba(120, 170, 220, 0.30)'); } catch (e) {}
            }
        }

        // --- Get background/land color for masking ---
        var landColor = '#0A1628';
        try {
            var bgLayer = layers.find(function (l) { return l.type === 'background'; });
            if (bgLayer) landColor = map.getPaintProperty(bgLayer.id, 'background-color') || '#121212';
        } catch (e) {}

        // --- Radar dot scatter overlay (ocean only) ---
        function seededRandom(seed) {
            var x = Math.sin(seed) * 43758.5453;
            return x - Math.floor(x);
        }

        function buildRadarDots(spacing) {
            var features = [];
            for (var lat = -60; lat <= 65; lat += spacing) {
                for (var lng = -180; lng <= 180; lng += spacing) {
                    features.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [lng, lat] },
                        properties: {}
                    });
                }
            }
            return { type: 'FeatureCollection', features: features };
        }

        // Radar dots: corner + center of each 0.5° box (0.25° grid offset by half)
        var dotFeatures = [];
        for (var lat = -60; lat <= 65; lat += 0.5) {
            for (var lng = -180; lng <= 180; lng += 0.5) {
                // Corner dot
                dotFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} });
                // Center dot
                dotFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng + 0.25, lat + 0.25] }, properties: {} });
            }
        }
        map.addSource('radar-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: dotFeatures } });
        map.addLayer({
            id: 'radar-dots',
            type: 'circle',
            source: 'radar-dots',
            minzoom: 6,
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.0, 8, 1.5, 10, 2.5],
                'circle-color': 'rgba(140, 190, 240, 1)',
                'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.18, 8, 0.28, 10, 0.35]
            }
        });

        // --- Multi-resolution lat/lon graticule ---
        var graticuleSteps = [
            { step: 10,   minzoom: 0,  id: '10',   opacity: 0.18, width: 1.0,  labels: true  },
            { step: 5,    minzoom: 2,  id: '5',    opacity: 0.12, width: 0.7,  labels: true  },
            { step: 2,    minzoom: 4,  id: '2',    opacity: 0.08, width: 0.5,  labels: false },
            { step: 1,    minzoom: 5,  id: '1',    opacity: 0.07, width: 0.4,  labels: true  },
            { step: 0.5,  minzoom: 7,  id: '0_5',  opacity: 0.05, width: 0.35, labels: false },
            { step: 0.25, minzoom: 9,  id: '0_25', opacity: 0.04, width: 0.3,  labels: false }
        ];

        function buildGraticule(step) {
            var features = [];
            var res = step < 1 ? 0.5 : 1;
            for (var lat = -80; lat <= 80; lat += step) {
                var coords = [];
                for (var lng = -180; lng <= 180; lng += res) {
                    coords.push([lng, lat]);
                }
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: { label: Math.abs(lat) + '°' + (lat >= 0 ? 'N' : 'S') }
                });
            }
            for (var lng = -180; lng <= 180; lng += step) {
                var coords = [];
                for (var lat = -80; lat <= 80; lat += res) {
                    coords.push([lng, lat]);
                }
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: { label: Math.abs(lng) + '°' + (lng >= 0 ? 'E' : 'W') }
                });
            }
            return { type: 'FeatureCollection', features: features };
        }

        // Find the first layer above water to insert graticule + mask before harbors
        for (var g = 0; g < graticuleSteps.length; g++) {
            var gs = graticuleSteps[g];
            var srcId = 'graticule-' + gs.id;

            map.addSource(srcId, {
                type: 'geojson',
                data: buildGraticule(gs.step)
            });

            map.addLayer({
                id: srcId + '-lines',
                type: 'line',
                source: srcId,
                minzoom: gs.minzoom,
                paint: {
                    'line-color': 'rgba(100, 160, 220, ' + gs.opacity + ')',
                    'line-width': gs.width
                }
            });

            if (gs.labels) {
                map.addLayer({
                    id: srcId + '-labels',
                    type: 'symbol',
                    source: srcId,
                    minzoom: gs.minzoom,
                    layout: {
                        'symbol-placement': 'line',
                        'text-field': ['get', 'label'],
                        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                        'text-size': 10,
                        'symbol-spacing': 400,
                        'text-keep-upright': true,
                        'text-rotation-alignment': 'map',
                        'text-allow-overlap': false,
                        'text-padding': 5
                    },
                    paint: {
                        'text-color': 'rgba(100, 180, 230, 0.30)',
                        'text-halo-color': 'rgba(4, 10, 24, 0.95)',
                        'text-halo-width': 1.5
                    }
                });
            }
        }

        // --- Land mask: covers graticule lines over land ---
        try {
            map.addSource('terrain-mask', {
                type: 'vector',
                url: 'mapbox://mapbox.mapbox-terrain-v2'
            });
            map.addLayer({
                id: 'land-mask',
                type: 'fill',
                source: 'terrain-mask',
                'source-layer': 'landcover',
                paint: {
                    'fill-color': landColor,
                    'fill-opacity': 1,
                    'fill-outline-color': 'rgba(60, 120, 180, 0.08)'
                }
            });
        } catch (e) {
            console.warn('Land mask failed:', e);
        }

        // --- Live cursor coordinate display (bottom center, Monda font) ---
        var coordsEl = document.createElement('div');
        coordsEl.id = 'map-coords';
        coordsEl.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);font-family:Monda,-apple-system,sans-serif;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;color:rgba(255,255,255,0.5);pointer-events:none;z-index:5;letter-spacing:1.2px;text-transform:uppercase;';
        document.body.appendChild(coordsEl);

        map.on('mousemove', function (e) {
            var lat = e.lngLat.lat;
            var lng = e.lngLat.lng;
            coordsEl.textContent = Math.abs(lat).toFixed(3) + '°' + (lat >= 0 ? 'N' : 'S') + '  ' + Math.abs(lng).toFixed(3) + '°' + (lng >= 0 ? 'E' : 'W');
        });

        map.on('mouseout', function () {
            coordsEl.textContent = '';
        });

        // Add harbors as a clustered GeoJSON source
        map.addSource('harbors', {
            type: 'geojson',
            data: harborsGeoJSON,
            cluster: true,
            clusterMaxZoom: 10,
            clusterRadius: 50
        });

        // --- Cluster circles ---
        map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'harbors',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step', ['get', 'point_count'],
                    '#2A4A6B', 5,
                    '#1E3A58', 10,
                    '#152D48'
                ],
                'circle-radius': [
                    'step', ['get', 'point_count'],
                    16, 5,
                    20, 10,
                    26
                ],
                'circle-stroke-color': 'rgba(60, 130, 200, 0.12)',
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.7
            }
        });

        // --- Cluster count labels ---
        map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'harbors',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 13,
                'text-allow-overlap': true
            },
            paint: {
                'text-color': 'rgba(180, 210, 240, 0.9)'
            }
        });

        // --- Unclustered individual points ---
        map.addLayer({
            id: 'harbors-circle',
            type: 'circle',
            source: 'harbors',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    4, 4,
                    8, 6,
                    12, 8
                ],
                'circle-color': '#3A6A9B',
                'circle-stroke-color': 'rgba(80, 160, 220, 0.20)',
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.75
            }
        });

        // Hover effect: enlarge on hover (unclustered only)
        map.addLayer({
            id: 'harbors-circle-hover',
            type: 'circle',
            source: 'harbors',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'name'], '']],
            paint: {
                'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    4, 7,
                    8, 9,
                    12, 12
                ],
                'circle-color': '#4A8AC0',
                'circle-stroke-color': 'rgba(100, 180, 240, 0.35)',
                'circle-stroke-width': 2,
                'circle-opacity': 0.5
            }
        });

        // --- Cluster click: zoom into cluster ---
        map.on('click', 'clusters', function (e) {
            var features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            if (!features.length) return;
            var clusterId = features[0].properties.cluster_id;
            map.getSource('harbors').getClusterExpansionZoom(clusterId, function (err, zoom) {
                if (err) return;
                map.easeTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom
                });
            });
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

        // --- Cursor changes for clusters + harbors ---
        map.on('mouseenter', 'clusters', function () {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'clusters', function () {
            map.getCanvas().style.cursor = 'crosshair';
        });

        // --- Harbor hover: pointer cursor + highlight ---
        map.on('mouseenter', 'harbors-circle', function (e) {
            map.getCanvas().style.cursor = 'pointer';
            if (e.features && e.features.length) {
                map.setFilter('harbors-circle-hover', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'name'], e.features[0].properties.name]]);
            }
        });

        map.on('mouseleave', 'harbors-circle', function () {
            map.getCanvas().style.cursor = 'crosshair';
            map.setFilter('harbors-circle-hover', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'name'], '']]);
        });

        // --- Ocean click: place temporary pin ---
        map.on('click', function (e) {
            // If a harbor or cluster was clicked, their handlers already fired
            var harborFeatures = map.queryRenderedFeatures(e.point, { layers: ['harbors-circle', 'clusters'] });
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

    // Expose map for swell overlay
    window.__wavesMap = map;

})();
