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
        ids.forEach(request); log('Hospital notified', `${window.destName} received ${ids.length} requirements for ${val('pName').trim() || 'patient'} (${val('pAge')} yrs, ${val('pBlood')}, allergy: ${val('pAllergy') || 'none'})`, 'blue-marker'); drawList();
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
        $('v-st').className = 'vital ' + (n >= 2 ? 'warn' : n === 1 ? 'amber' : 'ok'); window.__hr = hr; window.__rr = rr; window.__sys = sys; window.__dia = dia; $('tv-ecg').textContent = hr + ' bpm'; $('tv-pleth').textContent = sp + ' %'; $('tv-abp').textContent = sys + '/' + dia; $('tv-resp').textContent = rr + ' /min';
    }
    setInterval(vitals, 1000);

    // ---------- LIVE TRACES: every beat is different (rate variability, ectopic beats, breathing effect) ----------
    const g = (p, c, w, a) => a * Math.exp(-(((p - c) / w) ** 2));
    const PROF = {                                   // how each emergency changes the signals
        cardiac: { hrv: .04, pvc: .14, af: false, pulse: 1,   depth: 1 },
        trauma:  { hrv: .03, pvc: .02, af: false, pulse: .55, depth: .8 },
        stroke:  { hrv: .24, pvc: .03, af: true,  pulse: 1,   depth: 1 },
        breath:  { hrv: .05, pvc: .04, af: false, pulse: .85, depth: .55 }
    };
    let beats = [], comp = false, clock = 0, accT = 0, respPh = 0, lastT = performance.now();
    function addBeat() {
        const P = PROF[sel.value], base = 60 / (window.__hr || 82), prev = beats[beats.length - 1];
        const pvc = !comp && Math.random() < P.pvc;
        let rr = base * (1 + rnd(-P.hrv, P.hrv));
        if (pvc) { rr *= .62; comp = true; } else if (comp) { rr *= 1.38; comp = false; }
        beats.push({ t0: prev ? prev.t0 + prev.rr : clock - 1, rr, pvc, amp: (pvc ? 1.15 : 1) * (1 + rnd(-.07, .07)) });
        if (beats.length > 8) beats.shift();
    }
    function beatAt(s) {
        while (!beats.length || beats[beats.length - 1].t0 + beats[beats.length - 1].rr <= s + .05) addBeat();
        for (let i = beats.length - 1; i >= 0; i--) if (beats[i].t0 <= s) return beats[i];
        return beats[0];
    }
    const TR = [
        { id: 'ecg', color: '#2cf5b0', delay: 0, base: .72, amp: .55, f: (b, p, P) => {
            let v = b.pvc ? g(p, .32, .085, 1.1) - g(p, .60, .10, .45)
                          : (P.af ? 0 : g(p, .18, .04, .12)) - g(p, .37, .012, .15) + g(p, .40, .012, 1) - g(p, .43, .012, .25) + g(p, .65, .06, .22);
            if (sel.value === 'cardiac' && !b.pvc) v += g(p, .52, .07, .14);              // ST elevation
            return v * b.amp + .04 * Math.sin(respPh) + (P.af ? .04 * Math.sin(clock * 55) : 0) + rnd(-.012, .012);
        } },
        { id: 'pleth', color: '#19d3ff', delay: .20, base: .88, amp: .62, f: (b, p, P) =>
            (g(p, .28, .12, 1) + g(p, .58, .09, .28)) * b.amp * P.pulse * (b.pvc ? .5 : 1) * (1 + .12 * Math.sin(respPh)) + rnd(-.008, .008) },
        { id: 'abp', color: '#ff6f91', delay: .12, base: .88, amp: .58, f: (b, p, P) =>
            (g(p, .22, .06, 1) + g(p, .50, .07, .35)) * b.amp * P.pulse * (b.pvc ? .55 : 1) *
            Math.min(1.3, Math.max(.5, ((window.__sys || 120) - (window.__dia || 80)) / 55)) + .03 * Math.sin(respPh) },
        { id: 'resp', color: '#ffc464', delay: 0, base: .5, amp: .3, f: (b, p, P) =>
            P.depth * (Math.sin(respPh) + .25 * Math.sin(2 * respPh + 1)) * (.9 + .2 * Math.sin(clock * .35)) }
    ].map(t => ({ ...t, cv: $(t.id), data: [], h: 100 }));
    let W = 0;
    function size() {
        const d = window.devicePixelRatio || 1;
        TR.forEach(t => {
            W = t.cv.clientWidth; t.h = t.cv.clientHeight || 100;
            t.cv.width = W * d; t.cv.height = t.h * d; t.cx = t.cv.getContext('2d'); t.cx.setTransform(d, 0, 0, d, 0, 0);
        });
    }
    function draw(now) {
        accT += Math.min((now - lastT) / 1000, .1); lastT = now;
        const P = PROF[sel.value], step = 1 / 60;
        while (accT >= step) {                                   // fixed scroll speed on any screen
            accT -= step; clock += step; respPh += 2 * Math.PI * (window.__rr || 16) / 60 * step;
            TR.forEach(t => {
                const s = clock - t.delay, b = beatAt(s), p = Math.min(1, Math.max(0, (s - b.t0) / b.rr));
                t.data.push(t.f(b, p, P)); if (t.data.length > Math.ceil(W / 2)) t.data.shift();
            });
        }
        TR.forEach(t => {
            const c = t.cx, h = t.h; c.clearRect(0, 0, W, h); c.lineWidth = 2; c.lineJoin = 'round';
            c.strokeStyle = t.color; c.shadowColor = t.color; c.shadowBlur = 7; c.beginPath();
            t.data.forEach((v, i) => { const x = W - (t.data.length - i) * 2, y = h * t.base - v * h * t.amp; i ? c.lineTo(x, y) : c.moveTo(x, y); });
            c.stroke();
        });
        requestAnimationFrame(draw);
    }
    size(); addEventListener('resize', size);
    if (window.ResizeObserver) new ResizeObserver(size).observe(document.querySelector('.traces'));
    requestAnimationFrame(draw);

    // ---------- patient details ----------
    const val = id => $(id).value;
    function details() {
        const n = val('pName').trim() || 'Unknown patient', m = val('pHt') / 100, w = val('pWt');
        const bmi = m && w ? (w / (m * m)).toFixed(1) : '—';
        $('ptTitle').textContent = n;
        $('ptSub').textContent = `${val('pAge') || '—'} yrs · ${val('pGender')} · ${w || '—'} kg · ${val('pHt') || '—'} cm · BMI ${bmi} · ${val('pBlood')}`;
        $('ptAvatar').textContent = n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
    }
    document.querySelector('.pt-fields').addEventListener('input', details);
    details(); vitals(); drawList();
})();
