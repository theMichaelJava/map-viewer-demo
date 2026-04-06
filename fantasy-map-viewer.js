/* ============================================================
   fantasy-map-viewer.js
   Global script for Leaflet-based fantasy map viewer.
   Load once via Squarespace Code Injection → <FOOTER>.
   Leaflet must be loaded BEFORE this script.

   Auto-initializes all .fantasy-map-viewer elements on DOM ready.
   Supports multiple independent instances on the same page.
   ============================================================ */

(function () {
  'use strict';

  // ── Utility: debounce ──────────────────────────────────────────────────────
  function debounce(fn, delay) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  // ── Utility: read data attribute with fallback ─────────────────────────────
  function dataAttr(el, key, fallback) {
    var val = el.dataset[key];
    if (val === undefined || val === '') return fallback;
    if (typeof fallback === 'number') {
      var num = parseFloat(val);
      return isNaN(num) ? fallback : num;
    }
    if (typeof fallback === 'boolean') {
      return val.toLowerCase() !== 'false';
    }
    return val;
  }

  // ── SVG icons (inline, no external dependency) ─────────────────────────────
  var ICONS = {
    zoomIn:   '<svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    zoomOut:  '<svg viewBox="0 0 20 20"><path d="M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
    reset:    '<svg viewBox="0 0 20 20"><path d="M10 3a7 7 0 1 0 4.9 2.05M14 1v4h-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    fit:      '<svg viewBox="0 0 20 20"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    fullscreen:'<svg viewBox="0 0 20 20"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    exitFS:   '<svg viewBox="0 0 20 20"><path d="M7 3v4H3M17 7h-4V3M3 13h4v4M13 17v-4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  };

  // ── Create a toolbar button ────────────────────────────────────────────────
  function makeButton(iconKey, title) {
    var btn = document.createElement('button');
    btn.className = 'fmv-btn';
    btn.title = title;
    btn.type = 'button';
    btn.innerHTML = ICONS[iconKey] || iconKey;
    return btn;
  }

  // ── Initialize a single viewer instance ───────────────────────────────────
  function initViewer(sourceEl) {
    // ── 1. Read configuration ────────────────────────────────────────────────
    var imageUrl      = dataAttr(sourceEl, 'image',           '');
    var imageWidth    = dataAttr(sourceEl, 'width',           2048);
    var imageHeight   = dataAttr(sourceEl, 'height',          1024);
    var minZoom       = dataAttr(sourceEl, 'minZoom',         -3);
    var maxZoom       = dataAttr(sourceEl, 'maxZoom',          4);
    var startZoom     = dataAttr(sourceEl, 'startZoom',        0);
    var padding       = dataAttr(sourceEl, 'padding',          100);
    var minimapEnabled = dataAttr(sourceEl, 'minimapEnabled', true);
    var minimapPos    = dataAttr(sourceEl, 'minimapPosition', 'bottom-right');
    var zoomSpeed     = dataAttr(sourceEl, 'zoomSpeed',        1);
    var viewerHeight  = dataAttr(sourceEl, 'viewerHeight',    '520px');

    if (!imageUrl) {
      console.warn('[FantasyMapViewer] data-image is required but was not provided.');
      return;
    }

    // ── 2. Build DOM wrapper ─────────────────────────────────────────────────
    var wrapper = document.createElement('div');
    wrapper.className = 'fmv-wrapper';
    wrapper.style.height = typeof viewerHeight === 'number'
      ? viewerHeight + 'px'
      : viewerHeight;

    // Loading overlay
    var loading = document.createElement('div');
    loading.className = 'fmv-loading';
    var spinner = document.createElement('div');
    spinner.className = 'fmv-loading-spinner';
    loading.appendChild(spinner);
    wrapper.appendChild(loading);

    // Leaflet mount point
    var mapEl = document.createElement('div');
    mapEl.style.cssText = 'width:100%;height:100%;';
    wrapper.appendChild(mapEl);

    // Replace the source element with our wrapper
    sourceEl.parentNode.replaceChild(wrapper, sourceEl);

    // ── 3. Initialize Leaflet ────────────────────────────────────────────────
    // L.CRS.Simple maps pixel coords directly; no geographic projection.
    var map = L.map(mapEl, {
      crs:              L.CRS.Simple,
      minZoom:          minZoom,
      maxZoom:          maxZoom,
      zoomControl:      false,        // We use custom buttons
      attributionControl: false,
      scrollWheelZoom:  true,
      zoomSnap:         0.25,         // Smooth fractional zoom steps
      zoomDelta:        0.5 * zoomSpeed,
      wheelPxPerZoomLevel: 120 / zoomSpeed,
      doubleClickZoom:  true,
      keyboard:         true,         // Arrow keys + +/- handled by Leaflet
    });

    // Image bounds in Simple CRS (origin top-left, y-axis flipped)
    // Leaflet Simple CRS: [lat, lng] = [y, x]; top-left = [0, 0], bottom-right = [-height, width]
    var imageBounds = [
      [0,           0          ],  // top-left  (lat=0,  lng=0)
      [-imageHeight, imageWidth],  // bottom-right
    ];

    // Add the image overlay
    L.imageOverlay(imageUrl, imageBounds, {
      // No opacity needed; we handle it via CSS
      interactive: false,
    }).addTo(map);

    // ── 4. Pan limits ────────────────────────────────────────────────────────
    // Extend bounds by `padding` pixels (in image-pixel units at zoom 0)
    var pad = padding;
    var maxBounds = [
      [pad,              -pad            ],  // top-left with padding
      [-imageHeight - pad, imageWidth + pad], // bottom-right with padding
    ];
    map.setMaxBounds(maxBounds);
    map.options.maxBoundsViscosity = 0.85;  // Rubbery resistance at edges

    // ── 5. Initial view ──────────────────────────────────────────────────────
    var centerLat = -imageHeight / 2;
    var centerLng =  imageWidth  / 2;
    map.setView([centerLat, centerLng], startZoom);

    // Store the "home" view for reset
    function getHomeBounds() {
      return L.latLngBounds(imageBounds);
    }

    // ── 6. Build control buttons ─────────────────────────────────────────────
    var controls = document.createElement('div');
    controls.className = 'fmv-controls';

    var btnZoomIn   = makeButton('zoomIn',    'Zoom in (+)');
    var btnZoomOut  = makeButton('zoomOut',   'Zoom out (−)');
    var sep1        = document.createElement('div');
    sep1.className  = 'fmv-btn-sep';
    var btnReset    = makeButton('reset',     'Reset view');
    var btnFit      = makeButton('fit',       'Fit to window');
    var sep2        = document.createElement('div');
    sep2.className  = 'fmv-btn-sep';
    var btnFS       = makeButton('fullscreen', 'Fullscreen');

    controls.appendChild(btnZoomIn);
    controls.appendChild(btnZoomOut);
    controls.appendChild(sep1);
    controls.appendChild(btnReset);
    controls.appendChild(btnFit);

    // Only show fullscreen button if the API is available
    if (document.fullscreenEnabled ||
        document.webkitFullscreenEnabled ||
        document.mozFullScreenEnabled) {
      controls.appendChild(sep2);
      controls.appendChild(btnFS);
    }

    wrapper.appendChild(controls);

    // ── 7. Zoom badge ────────────────────────────────────────────────────────
    var badge = document.createElement('div');
    badge.className = 'fmv-zoom-badge';
    badge.textContent = 'z ' + startZoom.toFixed(1);
    wrapper.appendChild(badge);

    function updateBadge() {
      badge.textContent = 'z ' + map.getZoom().toFixed(1);
    }

    // ── 8. Minimap ───────────────────────────────────────────────────────────
    var minimapEl = null;
    var minimapCanvas = null;
    var minimapCtx = null;
    var minimapViewport = null;
    var minimapImg = null;
    var minimapSize = 140; // px, matches CSS var at desktop
    var MINIMAP_RENDER_DELAY = 120; // ms after image load

    function buildMinimap() {
      if (!minimapEnabled) return;

      minimapEl = document.createElement('div');
      minimapEl.className = 'fmv-minimap fmv-minimap-' + minimapPos;

      minimapCanvas = document.createElement('canvas');
      minimapCanvas.width  = minimapSize;
      minimapCanvas.height = minimapSize;
      minimapCtx = minimapCanvas.getContext('2d');

      minimapViewport = document.createElement('div');
      minimapViewport.className = 'fmv-minimap-viewport';

      minimapEl.appendChild(minimapCanvas);
      minimapEl.appendChild(minimapViewport);
      wrapper.appendChild(minimapEl);

      // Pre-load image for minimap rendering
      minimapImg = new Image();
      minimapImg.crossOrigin = 'anonymous';
      minimapImg.onload = function () {
        setTimeout(drawMinimap, MINIMAP_RENDER_DELAY);
      };
      minimapImg.onerror = function () {
        // Minimap silently fails; main viewer still works
        console.warn('[FantasyMapViewer] Minimap could not load image (possible CORS issue). Minimap disabled.');
        if (minimapEl) minimapEl.style.display = 'none';
      };
      minimapImg.src = imageUrl;

      // Click-to-pan on minimap
      minimapEl.addEventListener('click', function (e) {
        var rect = minimapEl.getBoundingClientRect();
        var relX = (e.clientX - rect.left) / minimapSize;
        var relY = (e.clientY - rect.top)  / minimapSize;

        // Map minimap fraction → image coordinates
        var targetLat = -relY * imageHeight;
        var targetLng =  relX * imageWidth;
        map.panTo([targetLat, targetLng], { animate: true, duration: 0.35 });
      });
    }

    // Compute minimap image scale to fit within the square minimap
    function getMinimapScale() {
      var aspect = imageWidth / imageHeight;
      if (aspect >= 1) {
        // Wider than tall
        return {
          scale:  minimapSize / imageWidth,
          drawW:  minimapSize,
          drawH:  minimapSize / aspect,
          offsetX: 0,
          offsetY: (minimapSize - minimapSize / aspect) / 2,
        };
      } else {
        // Taller than wide
        return {
          scale:  minimapSize / imageHeight,
          drawW:  minimapSize * aspect,
          drawH:  minimapSize,
          offsetX: (minimapSize - minimapSize * aspect) / 2,
          offsetY: 0,
        };
      }
    }

    function drawMinimap() {
      if (!minimapCtx || !minimapImg || !minimapImg.complete) return;

      var s = getMinimapScale();
      minimapCtx.clearRect(0, 0, minimapSize, minimapSize);
      minimapCtx.drawImage(minimapImg, s.offsetX, s.offsetY, s.drawW, s.drawH);
    }

    function updateMinimapViewport() {
      if (!minimapViewport || !minimapEnabled) return;

      var bounds = map.getBounds();
      var s = getMinimapScale();

      // Convert Leaflet bounds to image pixel fractions
      // Leaflet Simple CRS: lat = -y, lng = x
      var topFrac    = Math.max(0, Math.min(1,  (-bounds.getNorth()) / imageHeight));
      var leftFrac   = Math.max(0, Math.min(1,    bounds.getWest()  / imageWidth));
      var bottomFrac = Math.max(0, Math.min(1, (-bounds.getSouth()) / imageHeight));
      var rightFrac  = Math.max(0, Math.min(1,   bounds.getEast()  / imageWidth));

      // Convert fractions to minimap pixel coordinates
      var top    = s.offsetY + topFrac    * s.drawH;
      var left   = s.offsetX + leftFrac   * s.drawW;
      var bottom = s.offsetY + bottomFrac * s.drawH;
      var right  = s.offsetX + rightFrac  * s.drawW;

      var vpW = Math.max(4, right  - left);
      var vpH = Math.max(4, bottom - top);

      minimapViewport.style.top    = top  + 'px';
      minimapViewport.style.left   = left + 'px';
      minimapViewport.style.width  = vpW  + 'px';
      minimapViewport.style.height = vpH  + 'px';
    }

    // ── 9. Control button event listeners ────────────────────────────────────
    btnZoomIn.addEventListener('click', function (e) {
      e.stopPropagation();
      map.zoomIn(0.5);
    });

    btnZoomOut.addEventListener('click', function (e) {
      e.stopPropagation();
      map.zoomOut(0.5);
    });

    btnReset.addEventListener('click', function (e) {
      e.stopPropagation();
      map.setView([centerLat, centerLng], startZoom, { animate: true, duration: 0.4 });
    });

    btnFit.addEventListener('click', function (e) {
      e.stopPropagation();
      map.fitBounds(getHomeBounds(), { animate: true, duration: 0.4 });
    });

    // ── 10. Fullscreen ───────────────────────────────────────────────────────
    function requestFullscreen() {
      if (wrapper.requestFullscreen)             return wrapper.requestFullscreen();
      if (wrapper.webkitRequestFullscreen)       return wrapper.webkitRequestFullscreen();
      if (wrapper.mozRequestFullScreen)          return wrapper.mozRequestFullScreen();
    }

    function exitFullscreen() {
      if (document.exitFullscreen)              return document.exitFullscreen();
      if (document.webkitExitFullscreen)        return document.webkitExitFullscreen();
      if (document.mozCancelFullScreen)         return document.mozCancelFullScreen();
    }

    function isFullscreen() {
      return !!(document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement);
    }

    btnFS.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isFullscreen()) {
        exitFullscreen();
      } else {
        requestFullscreen();
      }
    });

    function onFullscreenChange() {
      // Brief delay lets the browser finish the transition
      setTimeout(function () {
        map.invalidateSize();
        updateMinimapViewport();
        if (isFullscreen()) {
          btnFS.innerHTML = ICONS['exitFS'];
          btnFS.title = 'Exit fullscreen';
        } else {
          btnFS.innerHTML = ICONS['fullscreen'];
          btnFS.title = 'Fullscreen';
        }
      }, 120);
    }

    document.addEventListener('fullscreenchange',       onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange',    onFullscreenChange);

    // ── 11. Leaflet event listeners ──────────────────────────────────────────
    map.on('move zoom', function () {
      updateBadge();
      updateMinimapViewport();
    });

    // ── 12. Resize handling ──────────────────────────────────────────────────
    var onResize = debounce(function () {
      map.invalidateSize();
      updateMinimapViewport();
    }, 150);

    window.addEventListener('resize', onResize);

    // Also watch the wrapper itself for Squarespace layout-triggered resizes
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(debounce(function () {
        map.invalidateSize();
        updateMinimapViewport();
      }, 100));
      ro.observe(wrapper);
    }

    // ── 13. Image load → hide spinner ────────────────────────────────────────
    var probeImg = new Image();
    probeImg.onload = function () {
      loading.classList.add('fmv-loaded');
      // Remove loading overlay from DOM after transition
      setTimeout(function () {
        if (loading.parentNode) loading.parentNode.removeChild(loading);
      }, 500);
    };
    probeImg.onerror = function () {
      spinner.style.display = 'none';
      loading.innerHTML = '<span style="color:rgba(232,220,200,0.5);font-size:13px;">Image could not be loaded.</span>';
    };
    probeImg.src = imageUrl;

    // ── 14. Build minimap after everything is wired up ────────────────────────
    buildMinimap();
    // Initial badge
    updateBadge();
    // Initial viewport indicator (drawn after Leaflet finishes its first render)
    setTimeout(updateMinimapViewport, 200);
  }

  // ── Auto-initialize all .fantasy-map-viewer elements ──────────────────────
  function initAll() {
    if (typeof L === 'undefined') {
      console.error('[FantasyMapViewer] Leaflet (L) is not loaded. ' +
        'Ensure Leaflet JS is included before fantasy-map-viewer.js.');
      return;
    }

    var elements = document.querySelectorAll('.fantasy-map-viewer');
    if (elements.length === 0) {
      // No viewers on this page — do nothing, no console noise
      return;
    }

    // Work on a static array; initViewer replaces each element in the DOM
    Array.prototype.slice.call(elements).forEach(function (el) {
      try {
        initViewer(el);
      } catch (err) {
        console.error('[FantasyMapViewer] Failed to initialize viewer:', err);
      }
    });
  }

  // ── Boot: wait for DOM ready ───────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    // Already interactive or complete (script loaded late/async)
    initAll();
  }

})();
