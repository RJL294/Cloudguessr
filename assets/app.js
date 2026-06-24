/* app.js — Cloudguessr game engine.
 *
 * Flow:  start → [play round → guess → result] × N → final summary
 *
 * Footage types (each round declares `type`):
 *   synthesized — orbiting Esri satellite fly-over (flyover.js)
 *   youtube     — embedded YouTube clip at given coordinates
 *   video       — direct public-domain / CC <video> (mp4/webm)
 */
(function () {
  'use strict';

  // ---------- tiny helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function show(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('is-active');
    $(screenId).classList.add('is-active');
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Great-circle distance in km.
  function haversine(a, b) {
    var R = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function fmtDist(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    if (km < 100) return km.toFixed(1) + ' km';
    return Math.round(km).toLocaleString() + ' km';
  }

  // Accuracy: 5000 at the bullseye, decaying with distance. ~50% at 1500 km.
  function accuracyScore(km, maxScore) {
    return Math.round(maxScore * Math.exp(-km / 2000));
  }
  // Speed bonus: full if you answer instantly, zero at the time limit.
  function speedBonus(secondsUsed, limit, maxBonus) {
    var frac = 1 - clamp(secondsUsed / limit, 0, 1);
    return Math.round(maxBonus * frac);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(((i + 1) * (Math.sin(i * 99.7 + a.length) * 0.5 + 0.5)));
      j = clamp(j, 0, i);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- state ----------
  var CFG = null;
  var POOL = [];
  var game = null;     // { rounds:[], idx, scores:[] }
  var flyover = null;
  var guessMap = null, guessMarker = null, guess = null;
  var resultMap = null;
  var roundTimer = null, secondsLeft = 0, roundStartedAt = 0;

  // ---------- load round data ----------
  fetch('data/rounds.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      CFG = data.config;
      POOL = (data.rounds || []).filter(function (r) { return !r.disabled; });
      $('start-meta').textContent =
        POOL.length + ' locations loaded · ' + CFG.roundsPerGame + ' per game';
      $('btn-start').disabled = false;
    })
    .catch(function () {
      $('start-meta').textContent = 'Could not load rounds.json';
    });

  // ---------- start / new game ----------
  function newGame() {
    var picks = shuffle(POOL).slice(0, Math.min(CFG.roundsPerGame, POOL.length));
    game = { rounds: picks, idx: 0, scores: [] };
    show('screen-game');
    setupGuessMap();
    startRound();
  }

  // ---------- a single round ----------
  function startRound() {
    var round = game.rounds[game.idx];
    guess = null;
    if (guessMarker) { guessMap.removeLayer(guessMarker); guessMarker = null; }
    $('btn-guess').disabled = true;
    $('guess-hint').textContent = 'Click the map to place your guess';
    $('hud-round').textContent = 'Round ' + (game.idx + 1) + ' / ' + game.rounds.length;
    $('hud-score').textContent = totalScore() + ' pts';
    $('guess-panel').classList.remove('expanded');
    $('media-error').hidden = true;

    playFootage(round);

    secondsLeft = CFG.roundTimeLimit;
    roundStartedAt = nowSec();
    $('hud-timer').textContent = secondsLeft + 's';
    clearInterval(roundTimer);
    roundTimer = setInterval(function () {
      secondsLeft--;
      $('hud-timer').textContent = Math.max(0, secondsLeft) + 's';
      if (secondsLeft <= 0) { submitGuess(true); }
    }, 1000);
  }

  function nowSec() { return performance.now() / 1000; }

  function playFootage(round) {
    var flyEl = $('flyover');
    var host = $('media-host');
    host.hidden = true; host.innerHTML = '';
    flyEl.style.display = 'none';

    if (round.type === 'synthesized') {
      flyEl.style.display = '';
      if (!flyover) flyover = new Flyover('flyover');
      flyover.play(round);
      return;
    }

    // Media-backed types share the host element + an error fallback.
    if (round.type === 'youtube') {
      var src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(round.videoId) +
                '?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&start=' +
                (round.start || 0);
      var iframe = document.createElement('iframe');
      iframe.className = 'media';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.setAttribute('frameborder', '0');
      iframe.src = src;
      host.appendChild(iframe);
      host.hidden = false;
      return;
    }

    if (round.type === 'video') {
      var v = document.createElement('video');
      v.className = 'media';
      v.src = round.src;
      v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
      if (round.poster) v.poster = round.poster;
      v.onerror = function () { mediaError(); };
      host.appendChild(v);
      host.hidden = false;
      v.play().catch(function () {/* autoplay policies — muted should pass */});
      return;
    }

    mediaError();
  }

  function mediaError() {
    $('media-host').hidden = true;
    $('media-error').hidden = false;
  }

  function stopFootage() {
    if (flyover) flyover.stop();
    $('media-host').innerHTML = '';
  }

  // ---------- guess map ----------
  function setupGuessMap() {
    if (guessMap) return;
    guessMap = L.map('guess-map', { worldCopyJump: true, zoomControl: true })
      .setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(guessMap);
    guessMap.on('click', function (e) {
      guess = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (!guessMarker) guessMarker = L.marker(e.latlng, { draggable: true }).addTo(guessMap);
      else guessMarker.setLatLng(e.latlng);
      guessMarker.on('drag', function (ev) {
        guess = { lat: ev.latlng.lat, lng: ev.latlng.lng };
      });
      $('btn-guess').disabled = false;
      $('guess-hint').textContent = 'Move the pin or press Guess';
    });
  }

  function submitGuess(timedOut) {
    if (!game) return;
    clearInterval(roundTimer);
    var round = game.rounds[game.idx];
    var actual = { lat: round.lat, lng: round.lng };

    // No guess placed (ran out of time): score the maximum distance.
    var g = guess || { lat: -actual.lat, lng: actual.lng + 180 };
    var km = haversine(g, actual);
    var used = clamp(CFG.roundTimeLimit - secondsLeft, 0, CFG.roundTimeLimit);

    var acc = guess ? accuracyScore(km, CFG.maxAccuracyScore) : 0;
    var spd = guess ? speedBonus(used, CFG.roundTimeLimit, CFG.maxSpeedBonus) : 0;

    game.scores.push({
      round: round, km: km, acc: acc, spd: spd,
      total: acc + spd, guessed: !!guess, timedOut: !!timedOut, guess: guess
    });

    stopFootage();
    showResult();
  }

  // ---------- result ----------
  function showResult() {
    var s = game.scores[game.scores.length - 1];
    var round = s.round;
    show('screen-result');

    $('result-place').textContent = round.label || 'Somewhere on Earth';
    $('result-dist').textContent = s.guessed
      ? 'You were ' + fmtDist(s.km) + ' away'
      : (s.timedOut ? 'Out of time — no guess' : 'No guess placed');
    $('result-acc').textContent = s.acc;
    $('result-speed').textContent = s.spd;
    $('result-total').textContent = s.total;
    $('result-credit').textContent = round.credit || '';

    if (!resultMap) {
      resultMap = L.map('result-map', { zoomControl: true, worldCopyJump: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      }).addTo(resultMap);
    }
    // Clear previous layers (markers/lines) but keep the basemap.
    resultMap.eachLayer(function (layer) {
      if (!(layer instanceof L.TileLayer)) resultMap.removeLayer(layer);
    });

    var actual = L.latLng(round.lat, round.lng);
    L.marker(actual).addTo(resultMap).bindTooltip('Actual', { permanent: false });
    setTimeout(function () { resultMap.invalidateSize(); }, 30);

    if (s.guess) {
      var g = L.latLng(s.guess.lat, s.guess.lng);
      L.circleMarker(g, { radius: 7, color: '#ff4d4d', fillColor: '#ff4d4d', fillOpacity: 0.9 })
        .addTo(resultMap).bindTooltip('Your guess');
      L.polyline([g, actual], { color: '#ffffff', weight: 2, dashArray: '6 6' }).addTo(resultMap);
      resultMap.fitBounds(L.latLngBounds([g, actual]).pad(0.4));
    } else {
      resultMap.setView(actual, 5);
    }
  }

  function totalScore() {
    return game.scores.reduce(function (n, s) { return n + s.total; }, 0);
  }

  function nextRound() {
    game.idx++;
    if (game.idx >= game.rounds.length) { showFinal(); return; }
    show('screen-game');
    startRound();
  }

  // ---------- final ----------
  function showFinal() {
    show('screen-final');
    var max = game.rounds.length * (CFG.maxAccuracyScore + CFG.maxSpeedBonus);
    $('final-total').textContent = totalScore().toLocaleString();
    $('final-max').textContent = max.toLocaleString();
    var ul = $('final-breakdown');
    ul.innerHTML = '';
    game.scores.forEach(function (s, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="fb-place">' + (i + 1) + '. ' +
        (s.round.label || 'Unknown') + '</span>' +
        '<span class="fb-meta">' + (s.guessed ? fmtDist(s.km) : '—') +
        '</span><span class="fb-pts">' + s.total + '</span>';
      ul.appendChild(li);
    });
  }

  // ---------- wire up controls ----------
  $('btn-start').disabled = true;
  $('btn-start').addEventListener('click', newGame);
  $('btn-again').addEventListener('click', newGame);
  $('btn-guess').addEventListener('click', function () { submitGuess(false); });
  $('btn-skip').addEventListener('click', function () { submitGuess(false); });
  $('btn-next').addEventListener('click', nextRound);
  $('btn-expand').addEventListener('click', function () {
    $('guess-panel').classList.toggle('expanded');
    setTimeout(function () { if (guessMap) guessMap.invalidateSize(); }, 220);
  });
})();
