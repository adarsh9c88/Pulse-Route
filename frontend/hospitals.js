// Nearby hospitals, map full screen, and status events (loaded after script.js)
window.destName = 'Selected destination';
let nearby = [], hMarks = [], pickedName = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- full screen ----
const fsBtn = $('fsBtn'), wrap = $('mapWrap');
fsBtn.onclick = () => document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen().catch(() => {});
document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? '✕ Exit full screen' : '⛶ Full screen';
    if (map) setTimeout(() => google.maps.event.trigger(map, 'resize'), 150);
});
$('hudStart').onclick = () => $('startDemo').click();

// ---- nearby hospitals (OpenStreetMap via Overpass) ----
async function loadHospitals() {
    $('hospCount').textContent = 'Searching...';
    $('hospList').innerHTML = '<p class="hosp-msg">Finding hospitals near the ambulance...</p>';
    try {
        const q = `[out:json][timeout:20];nwr["amenity"="hospital"](around:7000,${START[0]},${START[1]});out center tags 60;`;
        const j = await (await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) })).json();
        const seen = new Set();
        nearby = j.elements.map(e => ({ name: e.tags && (e.tags.name || e.tags['name:en']), lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, er: e.tags && e.tags.emergency === 'yes' }))
            .filter(h => h.name && h.lat && !seen.has(h.name) && seen.add(h.name))
            .map(h => ({ ...h, d: dist(START, [h.lat, h.lng]) })).sort((a, b) => a.d - b.d).slice(0, 7);
        if (!nearby.length) throw new Error('none');
        hMarks.forEach(m => m.setMap(null));
        hMarks = nearby.map(h => {
            const m = new google.maps.Marker({ position: { lat: h.lat, lng: h.lng }, map, icon: dot('#4d9dff', 6, '#fff', 2), title: h.name });
            m.addListener('click', () => pick(h)); return m;
        });
        $('hospCount').textContent = nearby.length + ' NEARBY'; render();
    } catch (e) {
        $('hospCount').textContent = 'OFFLINE';
        $('hospList').innerHTML = '<p class="hosp-msg">Could not load hospitals. <button class="secondary-btn" id="retryH">Retry</button></p>';
        $('retryH').onclick = loadHospitals;
    }
}

function render() {
    $('hospList').innerHTML = nearby.map((h, i) => `<button class="hosp-item ${h.name === pickedName ? 'sel' : ''}" data-i="${i}">
        <span class="hospital-icon">✚</span>
        <span class="hospital-info"><strong>${esc(h.name)}</strong><small>${(h.d / 1000).toFixed(1)} km away${h.er ? ' · emergency 24/7' : ''}</small></span>
        ${i === 0 ? '<span class="available">Nearest</span>' : '<span class="go">Dispatch ›</span>'}</button>`).join('');
}
$('hospList').onclick = e => { const b = e.target.closest('.hosp-item'); if (b) pick(nearby[b.dataset.i]); };

function pick(h) {
    if ($('incidentStatus').textContent === 'Planning route...') return;
    pickedName = h.name; window.destName = h.name; HOSPITAL = [h.lat, h.lng];
    hosp.setMap(map); hosp.setPosition({ lat: h.lat, lng: h.lng }); $('destName').textContent = h.name; render();
    log('Destination selected', `${h.name} (${(h.d / 1000).toFixed(1)} km away)`, 'blue-marker');
    start();   // plan the shortest route and send the ambulance
}
document.addEventListener('pr:destchange', () => { pickedName = null; if (nearby.length) render(); });

if (map) loadHospitals(); else window.afterMapInit = loadHospitals;

// ---- watch status, update HUD + route length, and broadcast events ----
let prev = '';
setInterval(() => {
    const s = $('incidentStatus').textContent;
    $('hudStatus').textContent = s; $('hudEta').textContent = $('eta').textContent;
    $('routeKm').textContent = (running || s === 'Arrived') && total ? (total / 1000).toFixed(2) + ' km' : '—';
    if (s === prev) return; prev = s;
    if (s === 'En Route') document.dispatchEvent(new Event('pr:dispatch'));
    else if (s === 'Arrived') document.dispatchEvent(new Event('pr:arrived'));
    else if (s === 'Standby' || s === 'Planning route...') document.dispatchEvent(new Event('pr:reset'));
}, 300);

// ---- start location: use GPS or pick on the map ----
window.pickingStart = false;
function pickMode(on) {
    window.pickingStart = on; $('pickBtn').classList.toggle('on', on);
    $('pickBtn').textContent = on ? 'Click the map...' : '✥ Set start';
    if (map) map.setOptions({ draggableCursor: on ? 'crosshair' : null });
}
function setStart(lat, lng, how) {
    if ($('incidentStatus').textContent === 'Planning route...') return;
    START = [lat, lng]; pickMode(false); clearRoute(); hosp.setMap(null);
    pickedName = null; $('destName').textContent = 'Select a hospital';
    $('startInfo').textContent = 'Start: ' + how;
    log('Start location set', how, 'blue-marker'); loadHospitals();
}
$('pickBtn').onclick = () => pickMode(!window.pickingStart);
$('locBtn').onclick = () => {
    if (!navigator.geolocation) { log('Location unavailable', 'This browser does not support location'); return; }
    $('startInfo').textContent = 'Finding your location...';
    navigator.geolocation.getCurrentPosition(
        p => { const a = p.coords.accuracy; setStart(p.coords.latitude, p.coords.longitude, 'My location (' + (a > 1000 ? '±' + (a / 1000).toFixed(1) + ' km, approximate' : '±' + Math.round(a) + ' m') + ')'); },
        err => { $('startInfo').textContent = 'Location blocked'; log('Location unavailable', err.code === 1 ? 'Allow location access in the browser, or use Set start' : 'Could not get your location, try Set start'); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
};
