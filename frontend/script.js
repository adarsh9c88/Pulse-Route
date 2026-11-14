// PulseRoute: Google Maps + shortest-road routing + traffic-signal green corridor (simulation)
const GOOGLE_API_KEY = "AIzaSyACJ7r-lMb9TRqwuUq9__BUjNoSM0ZfZPk";
const START = [30.9045, 75.8560];      // ambulance start (edit freely)
let   HOSPITAL = [30.8895, 75.8425];   // click on the map to move the hospital
const GREEN_RANGE = 200;               // metres before a signal it turns green
const RED_AFTER   = 25;                // metres after passing it turns red again
const $ = id => document.getElementById(id);

// load Google Maps with the key
const gs = document.createElement('script');
gs.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&callback=initMap&v=weekly`;
gs.async = true; gs.onerror = () => { $('incidentStatus').textContent = 'Google Maps failed to load'; };
document.head.appendChild(gs);

const DARK = [
    { elementType: 'geometry', stylers: [{ color: '#0f1b2f' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9db4d3' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a1424' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e3250' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2b4a73' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#08111f' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] }
];

let map, amb, hosp, line = null, pts = [], cum = [], total = 0, signals = [], raf = null, running = false;
const ll = p => ({ lat: p[0], lng: p[1] });
const dot = (fill, scale, stroke = '#fff', w = 3) => ({ path: google.maps.SymbolPath.CIRCLE, scale, fillColor: fill, fillOpacity: 1, strokeColor: stroke, strokeWeight: w });
const sigIcon = s => dot(s === 'red' ? '#ff4d6a' : '#2cf5b0', 7, '#0a1424', 2);
function dist(a, b) {
    const R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function log(title, sub, cls = '') {
    const list = $('activityList');
    list.insertAdjacentHTML('afterbegin', `<div class="activity-item"><span class="activity-marker ${cls}"></span><div><strong>${title}</strong><small>${sub}</small></div></div>`);
    while (list.children.length > 7) list.lastChild.remove();
}

// shortest route: Google Directions (alternatives, pick min distance); OSRM as fallback
function googleRoute(a, b) {
    return new Promise((res, rej) => new google.maps.DirectionsService().route(
        { origin: ll(a), destination: ll(b), travelMode: 'DRIVING', provideRouteAlternatives: true },
        (r, s) => {
            if (s !== 'OK') return rej(s);
            const c = r.routes.map(rt => ({
                d: rt.legs.reduce((t, l) => t + l.distance.value, 0),
                p: rt.legs.flatMap(l => l.steps.flatMap(st => st.path.map(q => [q.lat(), q.lng()])))
            })).sort((x, y) => x.d - y.d);
            res(c[0].p);
        }));
}
async function osrmRoute(a, b) {
    const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson&alternatives=true`)).json();
    if (j.code !== 'Ok') throw new Error(j.code);
    return j.routes.sort((x, y) => x.distance - y.distance)[0].geometry.coordinates.map(c => [c[1], c[0]]);
}

function pointAt(d) {
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}

async function loadSignals() {
    let found = [], real = true;
    try {
        const la = pts.map(p => p[0]), ln = pts.map(p => p[1]);
        const bb = [Math.min(...la), Math.min(...ln), Math.max(...la), Math.max(...ln)].join(',');
        const q = `[out:json][timeout:15];node["highway"="traffic_signals"](${bb});out;`;
        const j = await (await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) })).json();
        j.elements.forEach(e => {
            let best = 1e9, bi = 0;
            pts.forEach((p, i) => { const d = dist(p, [e.lat, e.lon]); if (d < best) { best = d; bi = i; } });
            if (best < 30) found.push({ pos: cum[bi], ll: [e.lat, e.lon] });
        });
    } catch (err) { found = []; }
    found.sort((a, b) => a.pos - b.pos);
    found = found.filter((s, i) => i === 0 || s.pos - found[i - 1].pos > 40);
    if (!found.length) { real = false; for (let d = 350; d < total - 100; d += 400) found.push({ pos: d, ll: pointAt(d) }); }
    signals.forEach(s => s.m.setMap(null));
    signals = found.map(s => {
        s.state = Math.random() < 0.65 ? 'red' : 'green'; s.waited = false;
        s.m = new google.maps.Marker({ position: ll(s.ll), map, icon: sigIcon(s.state), clickable: false }); return s;
    });
    $('signalInfo').textContent = `${signals.length} signals on route${real ? '' : ' (simulated)'}`;
}

function setState(s, st) { if (s.state !== st) { s.state = st; s.m.setIcon(sigIcon(st)); } }

function clearRoute() {
    if (raf) cancelAnimationFrame(raf);
    raf = null; running = false;
    if (line) { line.setMap(null); line = null; }
    signals.forEach(s => s.m.setMap(null)); signals = [];
    amb.setPosition(ll(START)); map.setCenter(ll(START)); map.setZoom(14);
    $('eta').textContent = '08 minutes'; $('incidentStatus').textContent = 'Standby';
    $('activeCount').textContent = '01'; $('ambulanceCount').textContent = '04';
    $('signalInfo').textContent = 'Signals: -'; $('startDemo').disabled = false;
}

async function start() {
    clearRoute(); $('startDemo').disabled = true; $('incidentStatus').textContent = 'Planning route...';
    let engine = 'Google Directions';
    try { pts = await googleRoute(START, HOSPITAL); }
    catch (e) {
        try { pts = await osrmRoute(START, HOSPITAL); engine = 'OSRM (Google Directions returned ' + e + ')'; }
        catch (e2) { $('incidentStatus').textContent = 'Routing failed'; log('Route error', 'Check internet and API key settings'); $('startDemo').disabled = false; return; }
    }
    cum = [0]; for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
    total = cum[cum.length - 1];
    line = new google.maps.Polyline({ path: pts.map(ll), map, strokeColor: '#19d3ff', strokeWeight: 5, strokeOpacity: .95 });
    const bounds = new google.maps.LatLngBounds(); pts.forEach(p => bounds.extend(ll(p))); map.fitBounds(bounds, 50);
    await loadSignals();

    log('Shortest route found', `${(total / 1000).toFixed(2)} km via ${engine}`, 'green-marker');
    $('ambulanceCount').textContent = '03'; running = true; $('incidentStatus').textContent = 'En Route';
    log('Ambulance dispatched', 'AMB-04 heading to hospital');

    const speed = Math.max(total / 40, 18);
    let d = 0, last = performance.now(), pauseUntil = 0;
    const frame = now => {
        if (!running) return;
        if (now < pauseUntil) { last = now; raf = requestAnimationFrame(frame); return; }
        d = Math.min(total, d + speed * (now - last) / 1000); last = now;
        const auto = $('autoSignals').checked;
        for (const s of signals) {
            const ahead = s.pos - d;
            if (auto && ahead < GREEN_RANGE && ahead > -RED_AFTER) {
                if (s.state === 'red') log('Signal cleared', 'Red changed to green for ambulance', 'blue-marker');
                setState(s, 'green');
            } else if (ahead <= -RED_AFTER) setState(s, 'red');
            if (!auto && s.state === 'red' && ahead < 12 && ahead > -5 && !s.waited) {
                s.waited = true; pauseUntil = now + 3000; log('Stopped at red signal', 'Auto corridor is off, ambulance delayed 3 s');
            }
        }
        amb.setPosition(ll(pointAt(d)));
        $('eta').textContent = Math.max(1, Math.ceil((total - d) / 13.9 / 60)) + ' min';
        if (d >= total) {
            running = false; $('eta').textContent = 'Arrived'; $('incidentStatus').textContent = 'Arrived';
            $('activeCount').textContent = '00'; $('ambulanceCount').textContent = '04'; $('startDemo').disabled = false;
            log('Ambulance arrived', 'Patient handed over to City Hospital', 'green-marker'); return;
        }
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
}

window.initMap = function () {
    map = new google.maps.Map($('map'), { center: ll(START), zoom: 14, styles: DARK, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
    amb  = new google.maps.Marker({ position: ll(START), map, icon: dot('#ff4d6a', 9), zIndex: 1000 });
    hosp = new google.maps.Marker({ position: ll(HOSPITAL), map, icon: dot('#4d9dff', 9) });
    map.addListener('click', e => {
        if (running) return;
        HOSPITAL = [e.latLng.lat(), e.latLng.lng()]; hosp.setPosition(e.latLng); clearRoute();
        log('Hospital moved', 'Click Start to plan a new shortest route');
    });
    $('startDemo').addEventListener('click', start);
    $('resetDemo').addEventListener('click', clearRoute);
};

// clock + simulated vitals
setInterval(() => { $('clock').textContent = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }, 1000);
setInterval(() => {
    const hr = (running ? 96 : 78) + Math.round(Math.random() * 10), sp = 97 + Math.round(Math.random() * 2);
    $('heartRate').innerHTML = `${hr} <small>BPM</small>`; $('spo2').innerHTML = `${sp} <small>%</small>`;
}, 1500);
