document.addEventListener('DOMContentLoaded', function () {
  var canvas = document.getElementById('gridCanvas');
  var ctx = canvas.getContext('2d');

  var SPACING  = 26;
  var MAX_DIST = 160;
  var CHARS    = ['+', '\u00d7', '\u25c9'];
  var CHAR_N   = CHARS.length;

  var W = 0, H = 0, points = [];
  var mouse = { x: -9999, y: -9999 };
  var pageScrollY = 0;
  var ripples = [];
  var hoveredEl = null, hoverRect = null, snapIntensity = 0;
  var textZones = [], textZoneDirty = true, textZoneTimer = null;
  var scrollGlow = 0, scrollGlowTarget = 0, scrollStopTimer = null;
  var lastScrollY = 0, lastFrame = 0;

  function refreshTextZones() {
    textZones = [];
    var scrollTop = window.scrollY;
    document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, span, hr').forEach(function (el) {
      if (el.closest('a, button, nav, .btn-demo, .card-demo')) return;
      var r = el.getBoundingClientRect();
      if (r.width < 5) return;
      var isHr = el.tagName === 'HR';
      textZones.push({
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2 + scrollTop,
        radius: isHr ? SPACING * 1.8 : Math.max(r.width, r.height) / 1.5,
        isHr: isHr
      });
    });
    textZoneDirty = false;
  }

  function scheduleTextZone() {
    textZoneDirty = true;
    clearTimeout(textZoneTimer);
    textZoneTimer = setTimeout(refreshTextZones, 300);
  }

  function buildGrid() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    points = [];
    var SPACING = Math.max(26, Math.ceil(W / 60));
    var pageH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, H * 2);
    for (var y = 0; y <= pageH; y += SPACING) {
      for (var x = 0; x <= W; x += SPACING) {
        points.push({ bx: x, by: y, x: x, y: y, vx: 0, vy: 0 });
      }
    }
    scheduleTextZone();
  }

  function bindHover(el) {
    if (el._gridBound) return;
    el._gridBound = true;
    el.addEventListener('mouseenter', function () { hoveredEl = el; hoverRect = el.getBoundingClientRect(); });
    el.addEventListener('mouseleave', function (e) {
      if (hoveredEl === el && !el.contains(e.relatedTarget)) { hoveredEl = null; hoverRect = null; }
    });
  }

  document.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
  document.addEventListener('mouseleave', function () { mouse.x = -9999; mouse.y = -9999; });

  // Touch support
  document.addEventListener('touchmove', function (e) {
    var t = e.touches[0];
    mouse.x = t.clientX;
    mouse.y = t.clientY;
  }, { passive: true });
  document.addEventListener('touchend', function () { mouse.x = -9999; mouse.y = -9999; });
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    ripples.push({ x: t.clientX, y: t.clientY + pageScrollY, r: 0, alpha: 1.0 });
    if (ripples.length > 6) ripples.shift();
  }, { passive: true });

  window.addEventListener('scroll', function () {
    var newY = window.scrollY;
    scrollGlowTarget = Math.min(1, Math.abs(newY - lastScrollY) / 50);
    lastScrollY = newY;
    pageScrollY = newY;
    scheduleTextZone();
    clearTimeout(scrollStopTimer);
    scrollStopTimer = setTimeout(function () { scrollGlowTarget = 0; }, 150);
  }, { passive: true });

  var resizeT;
  window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(buildGrid, 200); });

  document.addEventListener('click', function (e) {
    ripples.push({ x: e.clientX, y: e.clientY + pageScrollY, r: 0, alpha: 1.0 });
    if (ripples.length > 6) ripples.shift();
  });

  document.querySelectorAll('nav li').forEach(bindHover);
  document.querySelectorAll('a:not(.eldib), button, .btn-demo, .card-demo').forEach(bindHover);
  new MutationObserver(function () {
    document.querySelectorAll('nav li, a:not(.eldib), button, .btn-demo, .card-demo').forEach(function (el) {
      if (!el._gridBound) bindHover(el);
    });
  }).observe(document.body, { childList: true, subtree: true });

  function animate(now) {
    requestAnimationFrame(animate);
    if (now - lastFrame < 14) return;
    lastFrame = now;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px monospace';

    var isDark = document.body.classList.contains('dark-mode');
    scrollGlow    += (scrollGlowTarget - scrollGlow) * 0.35;
    snapIntensity += ((hoveredEl ? 1 : 0) - snapIntensity) * 0.35;
    if (hoveredEl) hoverRect = hoveredEl.getBoundingClientRect();

    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].r     += 6;
      ripples[i].alpha *= 0.976;
      if (ripples[i].alpha < 0.01) ripples.splice(i, 1);
    }

    if (textZoneDirty) refreshTextZones();

    var hR = 255, hG = isDark ? 20 : 90, hB = 0;
    var bR = isDark ? 160 : 10, bG = isDark ? 160 : 10, bB = isDark ? 160 : 10;
    var baseO = isDark ? 0.40 : 0.60;
    var drawCalls = [];

    for (var i = 0; i < points.length; i++) {
      var p  = points[i];
      var sy = p.y - pageScrollY;
      var mdx = mouse.x - p.x, mdy = mouse.y - sy;
      var mdSq = mdx * mdx + mdy * mdy;

      if (mdSq < MAX_DIST * MAX_DIST) {
        var md = Math.sqrt(mdSq);
        var f  = (MAX_DIST - md) / MAX_DIST * 0.35 / md;
        p.vx += mdx * f; p.vy += mdy * f;
      }
      for (var r = 0; r < ripples.length; r++) {
        var rp = ripples[r];
        var rdx = p.x - rp.x, rdy = p.y - rp.y;
        var rd  = Math.sqrt(rdx * rdx + rdy * rdy);
        var df  = Math.abs(rd - rp.r);
        if (df < 80 && rd > 0) { var push = (1 - df / 80) * rp.alpha * 2.0 / rd; p.vx += rdx * push; p.vy += rdy * push; }
      }
      p.vx += (p.bx - p.x) * 0.10; p.vy += (p.by - p.y) * 0.10;
      p.vx *= 0.80; p.vy *= 0.80;
      p.x  += p.vx; p.y  += p.vy;
      if (sy < -SPACING * 2 || sy > H + SPACING * 2) continue;

      var textFade = 1;
      for (var t = 0; t < textZones.length; t++) {
        var tz = textZones[t];
        var td = tz.isHr ? Math.abs(p.y - tz.cy) : Math.sqrt((p.x - tz.cx) * (p.x - tz.cx) + (p.y - tz.cy) * (p.y - tz.cy));
        if (td < tz.radius) textFade = Math.min(textFade, td / tz.radius);
      }
var hrFade = 0;
for (var t = 0; t < textZones.length; t++) {
  var tz = textZones[t];
  if (!tz.isHr) continue;
  var td = Math.abs(p.y - tz.cy);
  if (td < tz.radius) hrFade = Math.max(hrFade, 1 - td / tz.radius);
}
var restFade = textFade * textFade;

      var distMouse = Math.sqrt(mdSq);
      var cursorI   = distMouse < 40 ? 1 - distMouse / 40 : 0;

      var ripI = 0;
      for (var r = 0; r < ripples.length; r++) {
        var rp2 = ripples[r];
        var rd2 = Math.sqrt((p.x - rp2.x) * (p.x - rp2.x) + (p.y - rp2.y) * (p.y - rp2.y));
        var df2 = Math.abs(rd2 - rp2.r);
        if (df2 < 80) ripI = Math.max(ripI, Math.pow(1 - df2 / 80, 2) * rp2.alpha);
      }

      var borderI = 0;
      /* HOVER BORDER EFFECT — commented out
      if (hoverRect && snapIntensity > 0.01) {
        var hl = hoverRect.left, hr2 = hoverRect.right, ht = hoverRect.top, hb = hoverRect.bottom;
        var ZONE = SPACING * 1.1;
        if (p.x >= hl - ZONE && p.x <= hr2 + ZONE && sy >= ht - ZONE && sy <= hb + ZONE) {
          var dEdge = Math.min(Math.abs(p.x - hl), Math.abs(p.x - hr2), Math.abs(sy - ht), Math.abs(sy - hb));
          if (dEdge < ZONE) borderI = snapIntensity;
        }
      }
      */

      var marginI = 0;
      if (scrollGlow > 0.01) {
        var bf = 0.05 + scrollGlow * 0.10, bL = W * bf, bRight = W * (1 - bf);
        if (p.x < bL)          marginI = (1 - p.x / bL) * scrollGlow;
        else if (p.x > bRight) marginI = ((p.x - bRight) / (W - bRight)) * scrollGlow;
      }

      var mouseCharI = distMouse < 40 ? (1 - distMouse / 40) : 0;
      var charIdx = (borderI > 0.05) ? CHAR_N - 1 : Math.min(CHAR_N - 1, Math.floor(mouseCharI * CHAR_N));
      var combinedI = Math.max(ripI, marginI);
      var opacity, fr, fg, fb;

      if (borderI > 0)        { fr = hR; fg = hG; fb = hB; opacity = borderI; }
      else if (cursorI > 0)   { fr = hR; fg = hG; fb = hB; opacity = 0.4 + cursorI * 0.6; }
      else if (combinedI > 0) {
        fr = Math.round(bR + (hR - bR) * combinedI);
        fg = Math.round(bG + (hG - bG) * combinedI);
        fb = Math.round(bB + (hB - bB) * combinedI);
        opacity = (baseO + (1 - baseO) * combinedI) * restFade;
      } else { fr = bR; fg = bG; fb = bB; opacity = baseO * restFade; }
if (hrFade > 0) {
  var inv = isDark ? 255 : 0;
  fr = Math.round(fr + (inv - fr) * hrFade);
  fg = Math.round(fg + (inv - fg) * hrFade);
  fb = Math.round(fb + (inv - fb) * hrFade);
  opacity = Math.max(opacity, hrFade);
}
      if (opacity < 0.01) continue;
      drawCalls.push({ charIdx: charIdx, x: p.x, sy: sy, style: 'rgba('+fr+','+fg+','+fb+','+opacity.toFixed(2)+')' });
    }

    drawCalls.sort(function (a, b) { return a.style < b.style ? -1 : a.style > b.style ? 1 : 0; });
    var lastStyle = null;
    for (var i = 0; i < drawCalls.length; i++) {
      var d = drawCalls[i];
      if (d.style !== lastStyle) { ctx.fillStyle = d.style; lastStyle = d.style; }
      ctx.fillText(CHARS[d.charIdx], d.x, d.sy);
    }
  }

  buildGrid();
  window.addEventListener('load', buildGrid);
  setTimeout(refreshTextZones, 100);
  document.fonts.ready.then(refreshTextZones);
  requestAnimationFrame(animate);
});