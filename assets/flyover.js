/* flyover.js — the "synthesized" footage type.
 *
 * Creates the moving overhead-shot effect by slowly orbiting Esri World Imagery
 * satellite tiles (free, no API key). It sets the view once so the tiles load,
 * then uses Leaflet's own smooth pan-animation to drift between waypoints around
 * the target — reliable tile rendering plus continuous motion. The map is fully
 * non-interactive so it reads as footage, and the imagery has no place labels,
 * so nothing leaks the answer.
 */
(function (global) {
  'use strict';

  var ESRI_IMAGERY =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  function Flyover(elId) {
    this.map = L.map(elId, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      inertia: false
    });
    L.tileLayer(ESRI_IMAGERY, {
      maxZoom: 19,
      keepBuffer: 6,           // preload surrounding tiles so the drift reveals loaded imagery
      attribution: 'Imagery © Esri'
    }).addTo(this.map);

    this._timer = null;
    this._stopped = true;
  }

  // Begin (or restart) the orbiting fly-over around a round's target.
  Flyover.prototype.play = function (round) {
    this.stop();
    var map = this.map;
    var lat = round.lat;
    var lng = round.lng;
    var zoom = round.driftZoom != null ? round.driftZoom
             : (round.startZoom != null ? round.startZoom - 0.6 : 16);

    // Paint imagery immediately so the player always sees the location, even if
    // the drift below somehow stalls.
    map.invalidateSize(false);
    map.setView([lat, lng], zoom, { animate: false });

    // Orbit radius in metres — wider when zoomed out so there is always fresh
    // landscape sliding through frame to read clues from.
    var radiusM = 650 * Math.pow(2, 16 - zoom);
    var mPerDegLat = 111320;
    var mPerDegLng = 111320 * Math.cos(lat * Math.PI / 180);
    var startAngle = (Math.abs(lat * 7 + lng * 13) % 360) * Math.PI / 180; // varies per place

    var STEPS = 64;          // waypoints around the circle
    var STEP_MS = 1800;      // time (and pan duration) per waypoint → slow drift
    var i = 0;
    var self = this;
    this._stopped = false;

    function tick() {
      if (self._stopped) return;
      i++;
      var a = startAngle + (i / STEPS) * 2 * Math.PI;
      var dLat = (radiusM * Math.sin(a)) / mPerDegLat;
      var dLng = (radiusM * Math.cos(a)) / Math.max(1, mPerDegLng);
      map.panTo([lat + dLat, lng + dLng], {
        animate: true, duration: STEP_MS / 1000, easeLinearity: 1
      });
      self._timer = global.setTimeout(tick, STEP_MS);
    }

    // A second sizing pass guards against a 0-size race on first paint, then the
    // gentle orbit begins.
    this._timer = global.setTimeout(function () {
      if (self._stopped) return;
      map.invalidateSize(false);
      map.setView([lat, lng], zoom, { animate: false });
      self._timer = global.setTimeout(tick, STEP_MS);
    }, 350);
  };

  Flyover.prototype.stop = function () {
    this._stopped = true;
    if (this._timer) { global.clearTimeout(this._timer); this._timer = null; }
  };

  Flyover.prototype.show = function (visible) {
    var el = this.map.getContainer();
    el.style.display = visible ? '' : 'none';
    if (visible) this.map.invalidateSize(false);
  };

  global.Flyover = Flyover;
})(window);
