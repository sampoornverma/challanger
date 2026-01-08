console.log("app.js loaded");

// ================= FIREBASE IMPORTS =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ================= FIREBASE CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyAP0_fXfzAtlasygmjGpsMb1GgqHQ5Di0o",
  authDomain: "challanger-943db.firebaseapp.com",
  projectId: "challanger-943db",
  storageBucket: "challanger-943db.firebasestorage.app",
  messagingSenderId: "82460696666",
  appId: "1:82460696666:web:a2eb02dbfb4047c9ee3863"
};

// ================= INIT =================
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

// ================= DOM =================
const loginBtn = document.getElementById("loginBtn");
const appDiv = document.getElementById("app");
const userInfo = document.getElementById("userInfo");
const roomInput = document.getElementById("roomId");
const playlistInput = document.getElementById("playlistUrl");
const joinRoomBtn = document.getElementById("joinRoom");
const leaderboard = document.getElementById("leaderboard");

// ================= STATE =================
let user = null;
let roomId = null;
let playlist = [];
let currentIndex = 0;
let player = null;

// Cache video durations to avoid flicker
let durationCache = {}; // videoId -> seconds

// ================= LOGIN =================
loginBtn.onclick = async () => {
  const result = await signInWithPopup(auth, provider);
  user = result.user;

  userInfo.innerText = `👤 ${user.displayName}`;
  loginBtn.style.display = "none";
  appDiv.classList.remove("hidden");
};

// ================= JOIN ROOM =================
joinRoomBtn.onclick = async () => {
  roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter Room ID");

  const playlistId = extractPlaylistId(playlistInput.value);
  if (!playlistId) return alert("Invalid playlist URL");

  playlist = await fetchPlaylistVideos(playlistId);
  if (playlist.length === 0) return alert("Playlist empty");

  await setDoc(doc(db, "rooms", roomId), {
    playlist,
    index: 0
  });

  initPlayer();
  listenRoom();
  startTracking();
};

// ================= INIT PLAYER =================
function initPlayer() {
  if (!window.ytReady) {
    return setTimeout(initPlayer, 400);
  }

  if (player) return;

  player = new YT.Player("player", {
    height: "360",
    width: "640",
    videoId: playlist[0],
    playerVars: { origin: window.location.origin },
    events: {
      onReady: () => console.log("Player ready"),
      onStateChange: onPlayerStateChange
    }
  });
}

// ================= PLAYER STATE =================
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    currentIndex++;
    if (currentIndex < playlist.length) {
      player.loadVideoById(playlist[currentIndex]);
      updateDoc(doc(db, "rooms", roomId), { index: currentIndex });
    }
  }
}

// ================= FIRESTORE SYNC =================
function listenRoom() {
  onSnapshot(doc(db, "rooms", roomId), snap => {
    if (!snap.exists()) return;
    currentIndex = snap.data().index;
    if (player) player.loadVideoById(playlist[currentIndex]);
  });

  onSnapshot(collection(db, "rooms", roomId, "users"), snap => {
    renderLeaderboard(snap.docs.map(d => d.data()));
  });
}

// ================= TRACK PROGRESS + TIME =================
function startTracking() {
  setInterval(async () => {
    if (!player || !player.getDuration()) return;

    const videoId = playlist[currentIndex];
    const duration = player.getDuration();
    const currentTime = player.getCurrentTime();

    // Cache duration
    if (!durationCache[videoId]) {
      durationCache[videoId] = duration;
    }

    const videoProgress = (currentTime / duration) * 100;

    // Remaining time in current video
    let remainingSeconds = duration - currentTime;

    // Remaining videos time (cached)
    for (let i = currentIndex + 1; i < playlist.length; i++) {
      const vid = playlist[i];
      if (durationCache[vid]) {
        remainingSeconds += durationCache[vid];
      }
    }

    const totalProgress =
      ((currentIndex + videoProgress / 100) / playlist.length) * 100;

    await setDoc(
      doc(db, "rooms", roomId, "users", user.uid),
      {
        name: user.displayName,
        videoIndex: currentIndex + 1,
        totalVideos: playlist.length,
        totalProgress,
        remainingSeconds,
        updatedAt: Date.now()
      },
      { merge: true } // 🔥 prevents flicker
    );
  }, 3000);
}

// ================= LEADERBOARD =================
function renderLeaderboard(users) {
  leaderboard.innerHTML = "";

  users = users.filter(u =>
    typeof u.totalProgress === "number" &&
    typeof u.remainingSeconds === "number"
  );

  users.sort((a, b) => b.totalProgress - a.totalProgress);

  users.forEach((u, index) => {
    const isLeader = index === 0;
    const timeLeft = formatTime(u.remainingSeconds);

    leaderboard.innerHTML += `
      <div style="margin-bottom:12px">
        <strong>
          ${isLeader ? "👑 " : ""}
          ${u.name} — Video ${u.videoIndex}/${u.totalVideos}
        </strong>
        <div style="font-size:13px">⏳ Time left: ${timeLeft}</div>

        <div class="progress">
          <div class="progress-bar" style="width:${u.totalProgress}%">
            ${u.totalProgress.toFixed(1)}%
          </div>
        </div>
      </div>
    `;
  });
}

// ================= HELPERS =================
function extractPlaylistId(url) {
  try {
    return new URL(url).searchParams.get("list");
  } catch {
    return null;
  }
}

function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ================= FETCH FULL PLAYLIST =================
async function fetchPlaylistVideos(playlistId) {
  const YT_API_KEY = "AIzaSyCQ141N-fQAcGXu4uxCoqFAEK7Hc9V4rkk";
  let videoIds = [];
  let nextPageToken = "";

  do {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=contentDetails&maxResults=50&playlistId=${playlistId}` +
      `&key=${YT_API_KEY}` +
      (nextPageToken ? `&pageToken=${nextPageToken}` : "")
    );

    const data = await res.json();
    if (!data.items) break;

    videoIds.push(...data.items.map(i => i.contentDetails.videoId));
    nextPageToken = data.nextPageToken || "";
  } while (nextPageToken);

  return videoIds;
}
