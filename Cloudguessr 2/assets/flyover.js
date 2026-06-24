/* flyover.js — the "synthesized" footage type.
 *
 * Creates the moving overhead-shot effect by slowly orbiting and breathing the
 * zoom over Esri World Imagery satellite tiles (free, no API key). The map is
 * fully non-interactive so it reads as footage, not a slippy map, and the
 * imagery carries no place labels — nothing leaks the answer.
 */
(function (global) {
  'use strict';

  var ESRI_IMAGERY =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  function Flyover(elId) {
    this.map = L.map(elId, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0,            // allow fractional zoom for smooth "altitude" drift
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      inertia: false,
      fadeAnimation: true
    });
    L.tileLayer(ESRI_IMAGERY, {
      maxZoom: 19,
      attribution: 'Imagery © Esri'
    }).addTo(this.map);

    this._raf = null;
    this._t0 = null;
  }

  // Begin (or restart) the orbiting fly-over around a round's target.
  Flyover.prototype.play = function (round) {
    this.stop();
    var map = this.map;
    map.invalidateSize(false);

    var lat = round.lat;
    var lng = round.lng;
    var startZoom = round.startZoom != null ? round.startZoom : 16.5;
    var driftZoom = round.driftZoom != null ? round.driftZoom : startZoom - 0.8;

    // Orbit radius in degrees — a little wider when zoomed out so there is
    // always fresh landscape sliding through frame to read clues from.
    var radius = 0.0016 * Math.pow(2, 16 - driftZoom);
    var startAngle = (Math.abs(lat * 7 + lng * 13) % 360) * Math.PI / 180; // varies per place
    var PERIOD = 48000; // ms for one full slow orbit

    map.setView([lat, lng], startZoom, { animate: false });

    var self = this;
    function frame(ts) {
      if (self._t0 == null) self._t0 = ts;
      var elapsed = ts - self._t0;
      var phase = (elapsed / PERIOD) * 2 * Math.PI;

      var angle = startAngle + phase;
      var dLat = radius * Math.sin(angle);
      var dLng = (radius * Math.cos(angle)) / Math.max(0.2, Math.cos(lat * Math.PI / 180));

      // Ease from the close "start" altitude out to the cruising "drift"
      // altitude over the first orbit, then gently breathe.
      var settle = Math.min(1, elapsed / PERIOD);
      var z = startZoom + (driftZoom - startZoom) * settle
              + 0.18 * Math.sin(phase * 0.5);

      map.setView([lat + dLat, lng + dLng], z, { animate: false });
      self._raf = global.requestAnimationFrame(frame);
    }
    this._raf = global.requestAnimationFrame(frame);
  };

  Flyover.prototype.stop = function () {
    if (this._raf) global.cancelAnimationFrame(this._raf);
    this._raf = null;
    this._t0 = null;
  };

  Flyover.prototype.show = function (visible) {
    var el = this.map.getContainer();
    el.style.display = visible ? '' : 'none';
    if (visible) this.map.invalidateSize(false);
  };

  global.Flyover = Flyover;
})(window);
