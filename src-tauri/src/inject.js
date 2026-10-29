// Injecté par l'application dans music.youtube.com (cadre principal uniquement).
(function () {
  if (location.hostname !== "music.youtube.com" || window.__ytmd) return;

  function click(selector) {
    var el = document.querySelector(selector);
    if (el) { el.click(); return true; }
    return false;
  }

  function video() {
    return document.querySelector("video");
  }

  // Lecteur YouTube : son API garde le volume synchronisé avec l'interface.
  function player() {
    var p = document.getElementById("movie_player");
    return p && p.getVolume && p.setVolume ? p : null;
  }

  function volume() {
    var p = player();
    if (p) return Math.round(p.getVolume());
    var v = video();
    return v ? Math.round(v.volume * 100) : null;
  }

  function changeVolume(delta) {
    var current = volume();
    if (current === null) return;
    var target = Math.max(0, Math.min(100, current + delta));
    var p = player();
    if (p) {
      if (p.isMuted && p.isMuted()) p.unMute();
      p.setVolume(target);
      var slider = document.querySelector("ytmusic-player-bar #volume-slider");
      if (slider) slider.value = target;
    } else {
      video().volume = target / 100;
    }
    publish();
  }

  // Contrôles appelés depuis l'application (touches multimédia, icône de notification).
  window.__ytmd = function (action) {
    switch (action) {
      case "toggle":
        if (!click("ytmusic-player-bar #play-pause-button")) {
          var v = video();
          if (v) v.paused ? v.play() : v.pause();
        }
        break;
      case "play":
        var pl = video();
        if (pl && pl.paused) window.__ytmd("toggle");
        break;
      case "pause":
        var p = video();
        if (p && !p.paused) p.pause();
        break;
      case "next":
        click("ytmusic-player-bar .next-button");
        break;
      case "prev":
        click("ytmusic-player-bar .previous-button");
        break;
      case "volup":
        changeVolume(5);
        break;
      case "voldown":
        changeVolume(-5);
        break;
    }
  };

  // Publie l'état de lecture à l'application via le titre du document
  // (lu par l'application pour le Stream Deck et le titre de la fenêtre).
  function publish() {
    var v = video();
    var m = navigator.mediaSession && navigator.mediaSession.metadata;
    // Pochette : la plus grande image proposée (dernière de la liste).
    var art = m && m.artwork && m.artwork.length ? m.artwork[m.artwork.length - 1].src : "";
    var state = {
      playing: !!(v && !v.paused && !v.ended),
      title: (m && m.title) || "",
      artist: (m && m.artist) || "",
      art: art,
      volume: volume()
    };
    var t = "YTMD:" + JSON.stringify(state);
    if (document.title !== t) document.title = t;
  }
  ["play", "pause", "ended", "loadeddata", "volumechange"].forEach(function (name) {
    // Les événements média ne remontent pas : on les capte en phase de capture.
    document.addEventListener(name, function () { setTimeout(publish, 50); }, true);
  });
  setInterval(publish, 2000);

  // Ferme automatiquement la fenêtre « Vous êtes toujours là ? » qui met la musique en pause.
  setInterval(function () {
    var btn = document.querySelector("ytmusic-you-there-renderer button");
    if (btn && btn.offsetParent !== null) btn.click();
  }, 5000);

  // Barres de défilement fines et discrètes, comme une application native.
  var css =
    "::-webkit-scrollbar{width:8px;height:8px}" +
    "::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:4px}" +
    "::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.32)}" +
    "::-webkit-scrollbar-track{background:transparent}";
  function addStyle() {
    var s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }
  if (document.head) addStyle();
  else document.addEventListener("DOMContentLoaded", addStyle, { once: true });
})();
