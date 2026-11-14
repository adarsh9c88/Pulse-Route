// Visual-only extras. Does not touch your app logic in script.js.
document.querySelectorAll('.stat-card, .panel').forEach(el => {
    el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
});
