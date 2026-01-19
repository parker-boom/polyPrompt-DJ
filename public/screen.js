(() => {
  const state = {
    music: null,
    authorized: false,
    socketConnected: false,
    vibe: null,
    lastStatus: null
  };

  const AUTH_STORAGE_KEY = "promptdj_music_user_token";

  const el = {
    djName: document.getElementById("djName"),
    djTag: document.getElementById("djTag"),
    socketStatus: document.getElementById("socketStatus"),
    authStatus: document.getElementById("authStatus"),
    authorizeBtn: document.getElementById("authorizeBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    playPauseBtn: document.getElementById("playPauseBtn"),
    nextBtn: document.getElementById("nextBtn"),
    prevBtn: document.getElementById("prevBtn"),
    debugLine: document.getElementById("debugLine"),
    artwork: document.getElementById("artwork"),
    artPlaceholder: document.getElementById("artPlaceholder"),
    trackTitle: document.getElementById("trackTitle"),
    trackArtist: document.getElementById("trackArtist"),
    vibeName: document.getElementById("vibeName"),
    upNextList: document.getElementById("upNextList"),
    progressFill: document.getElementById("progressFill"),
    timeCurrent: document.getElementById("timeCurrent"),
    timeTotal: document.getElementById("timeTotal"),
    toastStack: document.getElementById("toastStack")
  };

  const socket = io();

  function readSavedToken() {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function saveToken(token) {
    if (!token) return;
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, token);
    } catch (err) {
      // Ignore storage errors.
    }
  }

  function setSocketStatus(text, ok) {
    el.socketStatus.textContent = `Socket: ${text}`;
    el.socketStatus.style.color = ok ? "#1f8a70" : "#b3422e";
  }

  function setAuthStatus(text, ok) {
    el.authStatus.textContent = `Music: ${text}`;
    el.authStatus.style.color = ok ? "#1f8a70" : "#b3422e";
  }

  function updateAuthUI() {
    if (state.authorized) {
      el.authorizeBtn.textContent = "Authorized";
      el.authorizeBtn.disabled = true;
    } else {
      el.authorizeBtn.textContent = "Authorize Apple Music";
      el.authorizeBtn.disabled = false;
    }
  }

  function formatError(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (err.message) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  function showToast(message, tone) {
    const div = document.createElement("div");
    div.className = "toast";
    div.innerHTML = tone === "accent" ? `<strong>${message}</strong>` : message;
    el.toastStack.prepend(div);
    setTimeout(() => {
      div.remove();
    }, 6000);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function setArtwork(url) {
    if (url) {
      el.artwork.src = url;
      el.artwork.style.display = "block";
      el.artPlaceholder.style.display = "none";
    } else {
      el.artwork.style.display = "none";
      el.artPlaceholder.style.display = "grid";
    }
  }

  function isPlaying() {
    if (!state.music) return false;
    const player = state.music.player;
    if (typeof player.isPlaying === "boolean") return player.isPlaying;
    const playing = window.MusicKit?.PlaybackStates?.playing;
    if (playing !== undefined) return player.playbackState === playing;
    return player.playbackState === 2;
  }

  function playbackStateLabel() {
    if (!state.music) return "--";
    const stateVal = state.music.player.playbackState;
    const states = window.MusicKit?.PlaybackStates;
    if (states) {
      if (stateVal === states.playing) return "playing";
      if (stateVal === states.paused) return "paused";
      if (stateVal === states.stopped) return "stopped";
      if (stateVal === states.loading) return "loading";
      if (stateVal === states.seeking) return "seeking";
    }
    return String(stateVal ?? "--");
  }

  function updatePlayPauseLabel() {
    if (!el.playPauseBtn) return;
    el.playPauseBtn.textContent = isPlaying() ? "Pause" : "Play";
  }

  function updateDebugLine() {
    if (!el.debugLine) return;
    const queueLength = state.music?.player?.queue?.items?.length || 0;
    const authorized = state.music?.isAuthorized ? "yes" : "no";
    el.debugLine.textContent = `Auth: ${authorized} | Playback: ${playbackStateLabel()} | Queue: ${queueLength}`;
  }

  function updateUI(status) {
    const now = status?.nowPlaying;
    el.trackTitle.textContent = now?.title || "Waiting for a drop";
    el.trackArtist.textContent = now?.artist || "Connect Discord and queue a song.";
    setArtwork(now?.artworkUrl || "");
    el.vibeName.textContent = status?.vibe?.name || "--";

    const progress = status?.progress || 0;
    const total = status?.duration || 0;
    const pct = total ? Math.min(100, Math.max(0, (progress / total) * 100)) : 0;
    el.progressFill.style.width = `${pct}%`;
    el.timeCurrent.textContent = formatTime(progress);
    el.timeTotal.textContent = formatTime(total);

    el.upNextList.innerHTML = "";
    const upNext = status?.upNext || [];
    if (upNext.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Queue is empty.";
      el.upNextList.appendChild(li);
    } else {
      upNext.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.title} — ${item.artist}`;
        const span = document.createElement("span");
        span.textContent = item.album || "";
        li.appendChild(span);
        el.upNextList.appendChild(li);
      });
    }

    updatePlayPauseLabel();
    updateDebugLine();
  }

  function buildStatus() {
    if (!state.music) return null;
    const player = state.music.player;
    const item = player.nowPlayingItem;
    const artwork = item?.attributes?.artwork;
    const artworkUrl = artwork
      ? artwork.url.replace("{w}", "600").replace("{h}", "600")
      : "";

    const duration = item?.attributes?.durationInMillis
      ? Math.floor(item.attributes.durationInMillis / 1000)
      : 0;
    const progress = Number.isFinite(player.currentPlaybackTime)
      ? Math.floor(player.currentPlaybackTime)
      : 0;

    const queueItems = player.queue?.items || [];
    const upNext = queueItems
      .filter((q) => q?.id && q.id !== item?.id)
      .slice(0, 3)
      .map((q) => ({
        id: q.id,
        title: q.attributes?.name || "Unknown",
        artist: q.attributes?.artistName || "Unknown",
        album: q.attributes?.albumName || ""
      }));

    return {
      nowPlaying: item
        ? {
            id: item.id,
            title: item.attributes?.name || "Unknown",
            artist: item.attributes?.artistName || "Unknown",
            album: item.attributes?.albumName || "",
            artworkUrl
          }
        : null,
      upNext,
      progress,
      duration,
      vibe: state.vibe
    };
  }

  function pushStatus() {
    const status = buildStatus();
    if (!status) return;
    state.lastStatus = status;
    updateUI(status);
    if (socket.connected) {
      socket.emit("screen:status", status);
    }
  }

  async function attemptPlay(contextLabel) {
    if (!state.music?.isAuthorized) {
      showToast("Authorize Apple Music first.", "accent");
      return false;
    }
    try {
      await state.music.player.play();
    } catch (err) {
      showToast(`Playback error (${contextLabel}): ${formatError(err)}`, "accent");
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (!isPlaying()) {
      showToast("Playback didn't start. Click the page once, then Play again.", "accent");
      return false;
    }
    return true;
  }

  async function initMusicKit() {
    try {
      const res = await fetch("/token");
      const data = await res.json();
      if (!data.token) throw new Error(data.error || "No token returned");

      const savedToken = readSavedToken();
      const config = {
        developerToken: data.token,
        app: { name: "PromptDJ", build: "0.1" }
      };
      if (savedToken) {
        config.userToken = savedToken;
        config.musicUserToken = savedToken;
      }

      MusicKit.configure(config);

      state.music = MusicKit.getInstance();
      state.authorized = state.music.isAuthorized;
      setAuthStatus(state.authorized ? "Ready" : "Sign in", state.authorized);
      updateAuthUI();

      const player = state.music.player;
      ["nowPlayingItemDidChange", "playbackStateDidChange", "playbackTimeDidChange"].forEach((event) => {
        try {
          player.addEventListener(event, () => pushStatus());
        } catch (err) {
          // Ignore event registration issues.
        }
      });

      pushStatus();
    } catch (err) {
      setAuthStatus("Error", false);
      showToast(`MusicKit error: ${err.message}`, "accent");
    }
  }

  async function authorize() {
    if (!state.music) return;
    try {
      const userToken = await state.music.authorize();
      saveToken(userToken);
      state.authorized = true;
      setAuthStatus("Authorized", true);
      updateAuthUI();
      showToast("Authorized. Ready to spin.");
      pushStatus();
    } catch (err) {
      showToast(`Authorize failed: ${formatError(err)}`, "accent");
    }
  }

  async function playPause() {
    if (!state.music) return;
    const player = state.music.player;
    const queueItems = player.queue?.items || [];
    if (!player.nowPlayingItem && queueItems.length === 0) {
      showToast("Queue is empty. Ask Tempo to play something first.", "accent");
      return;
    }
    if (isPlaying()) {
      try {
        await player.pause();
      } catch (err) {
        showToast(`Pause error: ${formatError(err)}`, "accent");
      }
      pushStatus();
      return;
    }

    const started = await attemptPlay("play");
    if (started) {
      pushStatus();
    }
  }

  async function skipNext() {
    if (!state.music) return;
    try {
      await state.music.player.skipToNextItem();
    } catch (err) {
      showToast(`Next failed: ${formatError(err)}`, "accent");
    }
    pushStatus();
  }

  async function skipPrev() {
    if (!state.music) return;
    try {
      await state.music.player.skipToPreviousItem();
    } catch (err) {
      showToast(`Prev failed: ${formatError(err)}`, "accent");
    }
    pushStatus();
  }

  async function searchSong(query) {
    const res = await state.music.api.search(query, { types: "songs", limit: 5 });
    return res?.songs?.data || [];
  }

  async function queueSongBestMatch(query) {
    if (!state.music.isAuthorized) throw new Error("Not authorized");
    const results = await searchSong(query);
    if (!results.length) throw new Error("No results found");

    const song = results[0];
    const player = state.music.player;
    const descriptor = { song: song.id };
    const shouldStartFresh = !player.nowPlayingItem || !isPlaying();

    try {
      if (shouldStartFresh) {
        await state.music.setQueue({ song: song.id, startPlaying: true });
      } else if (player.queue?.prepend) {
        await player.queue.prepend(descriptor);
      } else if (player.queue?.append) {
        await player.queue.append(descriptor);
      } else {
        await state.music.setQueue({ song: song.id, startPlaying: true });
      }
    } catch (err) {
      await state.music.setQueue({ song: song.id, startPlaying: true });
    }

    const started = await attemptPlay("queue");
    if (!started) {
      showToast("If Play does nothing, try the /sandbox page to confirm playback.", "accent");
    }

    pushStatus();
    return {
      id: song.id,
      title: song.attributes?.name || "Unknown",
      artist: song.attributes?.artistName || "Unknown",
      album: song.attributes?.albumName || "",
      artworkUrl: song.attributes?.artwork?.url
        ? song.attributes.artwork.url.replace("{w}", "400").replace("{h}", "400")
        : ""
    };
  }

  async function setVibePlaylist(playlistId, vibeName) {
    if (!state.music.isAuthorized) throw new Error("Not authorized");
    await state.music.setQueue({ playlist: playlistId, startPlaying: true });
    state.vibe = { id: playlistId, name: vibeName };
    try {
      await state.music.player.play();
    } catch (err) {
      // ignore
    }
    pushStatus();
    return state.vibe;
  }

  socket.on("connect", () => {
    state.socketConnected = true;
    setSocketStatus("Connected", true);
    socket.emit("screen:hello", { client: "screen" });
  });

  socket.on("disconnect", () => {
    state.socketConnected = false;
    setSocketStatus("Offline", false);
  });

  socket.on("server:hello", (payload) => {
    if (payload?.djName) el.djName.textContent = payload.djName;
    if (payload?.djTagline) el.djTag.textContent = payload.djTagline;
    if (payload?.vibe) {
      state.vibe = payload.vibe;
      el.vibeName.textContent = payload.vibe.name;
    }
  });

  socket.on("server:toast", (payload) => {
    showToast(payload?.message || "", payload?.tone);
  });

  socket.on("server:action", async (action) => {
    const { id, type, payload } = action || {};
    if (!id || !type) return;

    try {
      let data = null;
      if (type === "queueSong") {
        data = await queueSongBestMatch(payload?.query || "");
      } else if (type === "setVibe") {
        data = await setVibePlaylist(payload?.vibeId, payload?.vibeName);
      } else if (type === "getStatus") {
        data = buildStatus();
      } else if (type === "searchSong") {
        const results = await searchSong(payload?.query || "");
        data = results.map((song) => ({
          id: song.id,
          title: song.attributes?.name || "Unknown",
          artist: song.attributes?.artistName || "Unknown"
        }));
      }

      socket.emit("screen:actionResult", { id, ok: true, data });
    } catch (err) {
      socket.emit("screen:actionResult", {
        id,
        ok: false,
        error: formatError(err)
      });
    }
  });

  el.authorizeBtn.addEventListener("click", authorize);
  el.refreshBtn.addEventListener("click", async () => {
    await attemptPlay("refresh");
    pushStatus();
  });
  el.playPauseBtn?.addEventListener("click", playPause);
  el.nextBtn?.addEventListener("click", skipNext);
  el.prevBtn?.addEventListener("click", skipPrev);

  setSocketStatus("Connecting", false);
  setAuthStatus("Loading", false);
  if (window.MusicKit) {
    initMusicKit();
  } else {
    document.addEventListener("musickitloaded", initMusicKit, { once: true });
  }

  setInterval(() => {
    if (state.music) pushStatus();
  }, 5000);
})();
