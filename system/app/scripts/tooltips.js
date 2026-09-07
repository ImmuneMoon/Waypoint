/* Fast tooltips. Native title bubbles wait on the operating system's delay (about a second);
   this shows the same text after ~150 ms in a panel styled to the theme. Titles are moved to
   data-tip on first hover so the browser's own bubble does not appear as well; an element whose
   title changes later (e.g. a caret's Expand / Collapse) is re-read on the next hover. */
(function() {
    var DELAY = 150, tip, timer, current;
    function box() {
        if (tip) return tip;
        tip = document.createElement('div');
        tip.id = 'wpTip';
        tip.setAttribute('role', 'tooltip');
        document.body.appendChild(tip);
        return tip;
    }
    function textOf(el) {
        if (el.hasAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
        return el.dataset.tip || '';
    }
    function show(el) {
        var text = textOf(el); if (!text) return;
        var t = box();
        t.textContent = text;
        t.style.display = 'block';
        t.style.left = '0px'; t.style.top = '0px';
        var r = el.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
        var x = r.left + r.width / 2 - tw / 2, y = r.bottom + 8;
        if (y + th > vh - 6) y = r.top - th - 8;              // no room below: above
        if (y < 6) y = 6;
        x = Math.max(6, Math.min(x, vw - tw - 6));
        t.style.left = x + 'px'; t.style.top = y + 'px';
        t.classList.add('show');
        current = el;
    }
    function hide() {
        clearTimeout(timer); timer = null; current = null;
        if (tip) { tip.classList.remove('show'); tip.style.display = 'none'; }
    }
    document.addEventListener('mouseover', function(e) {
        var el = e.target && e.target.closest && e.target.closest('[title], [data-tip]');
        if (!el || el === current) return;
        clearTimeout(timer);
        hide();
        timer = setTimeout(function() { show(el); }, DELAY);
    });
    document.addEventListener('mouseout', function(e) {
        var el = e.target && e.target.closest && e.target.closest('[data-tip], [title]');
        if (!el) return;
        var to = e.relatedTarget;
        if (to && el.contains(to)) return;                    // still inside the same element
        hide();
    });
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('keydown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
})();
