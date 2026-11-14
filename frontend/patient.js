// Patient live monitoring + emergency checklist sent to the destination hospital (simulated)
(() => {
    const ITEMS = { er: 'Emergency doctor on standby', icu: 'ICU bed reserved', oxy: 'Oxygen supply ready', vent: 'Ventilator available',
        blood: 'Blood units cross-matched', ot: 'Operation theatre prepared', scan: 'CT / X-ray room free', cardio: 'Cardiac team and defibrillator', neuro: 'Neurologist on call' };
    const COND = {
        cardiac: { hr: 118, spo2: 93, sys: 155, dia: 98, rr: 22, temp: 36.8, need: ['er', 'icu', 'oxy', 'cardio'] },
        trauma:  { hr: 124, spo2: 94, sys: 100, dia: 64, rr: 24, temp: 36.4, need: ['er', 'blood', 'ot', 'scan', 'oxy'] },
        stroke:  { hr: 96,  spo2: 95, sys: 172, dia: 100, rr: 18, temp: 37.0, need: ['er', 'scan', 'neuro', 'icu'] },
        breath:  { hr: 112, spo2: 88, sys: 135, dia: 85, rr: 30, temp: 37.6, need: ['er', 'oxy', 'vent', 'icu'] }
    };
    const sel = $('condition'); let need = new Set(COND.cardiac.need), status = {}, timers = [], arrived = false;
    const rnd = (a, b) => a + Math.random() * (b - a);

    // ---------- checklist ----------
    function drawList() {
        $('checklist').innerHTML = Object.entries(ITEMS).map(([id, label]) => {
            const st = status[id] || 'none', on = need.has(id);
            const txt = st === 'ready' ? 'Ready' : st === 'req' ? 'Requested' : on ? 'Not sent' : '';
            return `<label class="chk"><input type="checkbox" data-id="${id}" ${on ? 'checked' : ''}><span class="box"></span><span class="chk-name">${label}</span><em class="pill ${st}">${txt}</em></label>`;
        }).join('');
        const ids = [...need].filter(i => status[i]), ready = ids.filter(i => status[i] === 'ready').length;
        $('readyBar').style.width = ids.length ? (ready / ids.length * 100) + '%' : '0%';
        $('readyText').textContent = ids.length ? `${ready} of ${ids.length} ready at ${window.destName}` : 'Checklist not sent yet';
    }
    function request(id) {
        status[id] = 'req';
        timers.push(setTimeout(() => {
            if (status[id] !== 'req') return;
            status[id] = 'ready'; log(ITEMS[id], `${window.destName} confirmed: ready`, 'green-marker'); drawList();
        }, 2000 + Math.random() * 14000));
    }
    function sendAll() {
        const ids = [...need].filter(i => !status[i]); if (!ids.length) return;
        ids.forEach(request); log('Hospital notified', `${window.destName} received ${ids.length} requirements`, 'blue-marker'); drawList();
    }
    $('checklist').onchange = e => {
        const id = e.target.dataset.id; e.target.checked ? need.add(id) : (need.delete(id), delete status[id]);
        if (e.target.checked && sent()) request(id); drawList();
    };
    const sent = () => Object.keys(status).length > 0;
    $('sendBtn').onclick = sendAll;
    sel.onchange = () => { need = new Set(COND[sel.value].need); status = {}; timers.forEach(clearTimeout); drawList(); };
    document.addEventListener('pr:dispatch', () => { arrived = false; sendAll(); });
    document.addEventListener('pr:arrived', () => {
        arrived = true; Object.keys(status).forEach(i => status[i] = 'ready'); drawList();
        log('Hospital fully prepared', `${window.destName} is ready for the patient`, 'green-marker');
    });
    document.addEventListener('pr:reset', () => { arrived = false; status = {}; timers.forEach(clearTimeout); drawList(); });

    // ---------- live vitals ----------
    function vitals() {
        const b = COND[sel.value], k = arrived ? .88 : 1;
        const hr = Math.round(b.hr * k + rnd(-4, 4)), sp = Math.min(100, Math.round(b.spo2 + (arrived ? 3 : 0) + rnd(-1, 1))),
              sys = Math.round(b.sys + rnd(-5, 5)), dia = Math.round(b.dia + rnd(-3, 3)), rr = Math.round(b.rr * k + rnd(-1, 1)), t = (b.temp + rnd(-.1, .1)).toFixed(1);
        const w = { hr: hr > 110 || hr < 50, spo2: sp < 94, bp: sys > 160 || sys < 90, rr: rr > 24, temp: t > 38 };
        $('heartRate').innerHTML = `${hr} <small>BPM</small>`; $('spo2').innerHTML = `${sp} <small>%</small>`;
        $('bp').innerHTML = `${sys}/${dia} <small>mmHg</small>`; $('resp').innerHTML = `${rr} <small>/min</small>`; $('temp').innerHTML = `${t} <small>°C</small>`;
        Object.entries({ 'v-hr': w.hr, 'v-spo2': w.spo2, 'v-bp': w.bp, 'v-rr': w.rr, 'v-temp': w.temp }).forEach(([id, on]) => $(id).classList.toggle('warn', on));
        const n = Object.values(w).filter(Boolean).length;
        $('ptStatus').textContent = n >= 2 ? 'Critical' : n === 1 ? 'Unstable' : 'Stable';
        $('v-st').className = 'vital ' + (n >= 2 ? 'warn' : n === 1 ? 'amber' : 'ok'); window.__hr = hr;
    }
    setInterval(vitals, 1000);

    // ---------- ECG ----------
    const cv = $('ecg'), cx = cv.getContext('2d'); let W = 0, H = 120, trace = [], t0 = performance.now(), phase = 0;
    function size() { const d = window.devicePixelRatio || 1; W = cv.clientWidth; cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0); }
    const g = (p, c, w, a) => a * Math.exp(-(((p - c) / w) ** 2));
    const wave = p => g(p, .18, .04, .12) - g(p, .37, .012, .15) + g(p, .40, .012, 1) - g(p, .43, .012, .25) + g(p, .65, .06, .22);
    function draw(now) {
        const dt = Math.min((now - t0) / 1000, .1); t0 = now;
        phase = (phase + dt * (window.__hr || 82) / 60) % 1; trace.push(wave(phase));
        const n = Math.ceil(W / 2); if (trace.length > n) trace.splice(0, trace.length - n);
        cx.clearRect(0, 0, W, H); cx.lineWidth = 2; cx.lineJoin = 'round'; cx.strokeStyle = '#2cf5b0'; cx.shadowColor = '#2cf5b0'; cx.shadowBlur = 8; cx.beginPath();
        trace.forEach((v, i) => { const x = W - (trace.length - i) * 2, y = H * .7 - v * H * .55; i ? cx.lineTo(x, y) : cx.moveTo(x, y); });
        cx.stroke(); requestAnimationFrame(draw);
    }
    size(); addEventListener('resize', size); requestAnimationFrame(draw);
    vitals(); drawList();
})();
