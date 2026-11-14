
// ======================================
// PULSEROUTE - MAIN JAVASCRIPT
// ======================================

// Paste your restricted Google Maps key here.
// Leave empty to use the free OpenStreetMap fallback.
const GOOGLE_MAPS_API_KEY = "";

const API_BASE = "http://127.0.0.1:8000";

// Demo map coordinates: Ludhiana
const hospitalLocation = { lat: 30.9010, lng: 75.8573 };

const routePoints = [
    { lat: 30.8950, lng: 75.8450 },
    { lat: 30.8970, lng: 75.8480 },
    { lat: 30.8990, lng: 75.8510 },
    { lat: 30.9000, lng: 75.8540 },
    { lat: 30.9010, lng: 75.8573 }
];

let map;
let ambulanceMarker;
let routeLine;
let ambulancePosition = 0;
let simulationTimer = null;
let incidentActive = false;
let useGoogleMaps = false;

// ======================================
// CLOCK
// ======================================

function updateClock() {
    document.getElementById("clock").textContent =
        new Date().toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "medium"
        });
}

updateClock();
setInterval(updateClock, 1000);

// ======================================
// MAP INITIALIZATION
// ======================================

function loadMap() {
    if (GOOGLE_MAPS_API_KEY.trim()) {
        loadGoogleMaps();
    } else {
        initializeLeafletMap();
    }
}

function loadGoogleMaps() {
    window.initGoogleMap = function () {
        useGoogleMaps = true;

        map = new google.maps.Map(
            document.getElementById("map"),
            {
                center: hospitalLocation,
                zoom: 14,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
                styles: [
                    {
                        elementType: "geometry",
                        stylers: [{ color: "#182b40" }]
                    },
                    {
                        elementType: "labels.text.fill",
                        stylers: [{ color: "#d5e2f0" }]
                    },
                    {
                        featureType: "road",
                        elementType: "geometry",
                        stylers: [{ color: "#344a61" }]
                    },
                    {
                        featureType: "water",
                        elementType: "geometry",
                        stylers: [{ color: "#10263b" }]
                    }
                ]
            }
        );

        ambulanceMarker = new google.maps.Marker({
            position: routePoints[0],
            map: map,
            title: "Ambulance AMB-04",
            label: "A"
        });

        new google.maps.Marker({
            position: hospitalLocation,
            map: map,
            title: "City Hospital"
        });

        routeLine = new google.maps.Polyline({
            path: routePoints,
            geodesic: true,
            strokeColor: "#22c5e5",
            strokeOpacity: 0.9,
            strokeWeight: 5,
            map: map
        });
    };

    const script = document.createElement("script");

    script.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(GOOGLE_MAPS_API_KEY) +
        "&callback=initGoogleMap";

    script.async = true;
    script.defer = true;

    script.onerror = function () {
        initializeLeafletMap();
    };

    document.head.appendChild(script);
}

// ======================================
// FREE OPENSTREETMAP FALLBACK
// ======================================

function initializeLeafletMap() {
    if (map) return;

    useGoogleMaps = false;

    map = L.map("map").setView(
        [hospitalLocation.lat, hospitalLocation.lng],
        14
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }
    ).addTo(map);

    ambulanceMarker = L.circleMarker(
        [routePoints[0].lat, routePoints[0].lng],
        {
            radius: 10,
            color: "#ffffff",
            weight: 2,
            fillColor: "#ff6278",
            fillOpacity: 1
        }
    ).addTo(map).bindPopup("Ambulance AMB-04");

    L.circleMarker(
        [hospitalLocation.lat, hospitalLocation.lng],
        {
            radius: 9,
            color: "#ffffff",
            weight: 2,
            fillColor: "#4d9dff",
            fillOpacity: 1
        }
    ).addTo(map).bindPopup("City Hospital");

    routeLine = L.polyline(
        routePoints.map(point => [point.lat, point.lng]),
        {
            color: "#22c5e5",
            weight: 5,
            dashArray: "10, 8"
        }
    ).addTo(map);
}

// ======================================
// MOVE AMBULANCE
// ======================================

function moveAmbulance() {
    if (ambulancePosition >= routePoints.length - 1) {
        clearInterval(simulationTimer);
        simulationTimer = null;

        document.getElementById("incidentStatus").textContent =
            "Arrived";

        document.getElementById("eta").textContent = "Arrived";

        addActivity(
            "Ambulance reached hospital",
            "Demo journey completed successfully",
            "green-marker"
        );

        return;
    }

    ambulancePosition++;

    const point = routePoints[ambulancePosition];

    if (useGoogleMaps) {
        ambulanceMarker.setPosition(point);
    } else {
        ambulanceMarker.setLatLng([point.lat, point.lng]);
        map.panTo([point.lat, point.lng]);
    }

    const remaining = routePoints.length - 1 - ambulancePosition;

    document.getElementById("eta").textContent =
        remaining * 2 + " minutes";

    document.getElementById("incidentStatus").textContent =
        "En Route";

    updatePatientReadings();
}

// ======================================
// START EMERGENCY
// ======================================

async function startEmergency() {
    if (simulationTimer) return;

    if (ambulancePosition >= routePoints.length - 1) {
        resetSimulation();
    }

    incidentActive = true;

    document.getElementById("incidentStatus").textContent =
        "En Route";

    document.getElementById("activeCount").textContent = "01";

    addActivity(
        "Emergency simulation started",
        "Ambulance AMB-04 is following the demo route",
        "blue-marker"
    );

    try {
        const response = await fetch(API_BASE + "/api/emergency", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                ambulance_id: "AMB-04",
                destination: "City Hospital"
            })
        });

        if (response.ok) {
            const data = await response.json();

            addActivity(
                "Backend connected",
                "Incident " + data.incident_id + " registered",
                "green-marker"
            );
        }
    } catch (error) {
        addActivity(
            "Frontend simulation active",
            "Start the Python backend for API connectivity",
            "blue-marker"
        );
    }

    simulationTimer = setInterval(moveAmbulance, 2500);
}

// ======================================
// RESET SIMULATION
// ======================================

function resetSimulation() {
    clearInterval(simulationTimer);
    simulationTimer = null;

    ambulancePosition = 0;
    incidentActive = false;

    const firstPoint = routePoints[0];

    if (ambulanceMarker) {
        if (useGoogleMaps) {
            ambulanceMarker.setPosition(firstPoint);
            map.setCenter(hospitalLocation);
        } else {
            ambulanceMarker.setLatLng([
                firstPoint.lat,
                firstPoint.lng
            ]);

            map.setView(
                [hospitalLocation.lat, hospitalLocation.lng],
                14
            );
        }
    }

    document.getElementById("eta").textContent = "08 minutes";
    document.getElementById("incidentStatus").textContent = "En Route";
    document.getElementById("activeCount").textContent = "01";

    addActivity(
        "Simulation reset",
        "Ambulance returned to its starting point",
        "green-marker"
    );
}

// ======================================
// PATIENT DATA SIMULATION
// ======================================

function updatePatientReadings() {
    const heartRate = Math.floor(78 + Math.random() * 12);
    const oxygen = Math.floor(96 + Math.random() * 4);

    document.getElementById("heartRate").innerHTML =
        heartRate + " <small>BPM</small>";

    document.getElementById("spo2").innerHTML =
        oxygen + " <small>%</small>";
}

// ======================================
// ACTIVITY LOG
// ======================================

function addActivity(title, description, markerClass) {
    const list = document.getElementById("activityList");

    const item = document.createElement("div");
    item.className = "activity-item";

    const marker = document.createElement("span");
    marker.className = "activity-marker " + markerClass;

    const content = document.createElement("div");

    const heading = document.createElement("strong");
    heading.textContent = title;

    const details = document.createElement("small");
    details.textContent = description;

    content.appendChild(heading);
    content.appendChild(details);

    item.appendChild(marker);
    item.appendChild(content);

    list.prepend(item);

    while (list.children.length > 5) {
        list.removeChild(list.lastElementChild);
    }
}

// ======================================
// BUTTON EVENTS
// ======================================

document.getElementById("startDemo")
    .addEventListener("click", startEmergency);

document.getElementById("resetDemo")
    .addEventListener("click", resetSimulation);

// ======================================
// BACKEND DASHBOARD CONNECTION
// ======================================

async function loadDashboardData() {
    try {
        const response = await fetch(API_BASE + "/api/dashboard");

        if (!response.ok) {
            throw new Error("Backend unavailable");
        }

        const data = await response.json();

        document.getElementById("ambulanceCount").textContent =
            data.available_ambulances;

    } catch (error) {
        console.log("Using demonstration dashboard data.");
    }
}

// ======================================
// START APPLICATION
// ======================================

loadMap();
loadDashboardData();

