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

// ================= INIT FIREBASE =================
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

// ================= LOGIN =================
loginBtn.onclick = async () => {
  const result = await signInWithPopup(auth, provider);
  user = result.user;

  userInfo.innerText = `👤 ${user.displayName}`;
  loginBtn.style.display = "none";
  appDiv.classList.remove("hidden");

  console.log("Login successful");
};

// ================= JOIN ROOM =================
joinRoomBtn.onclick = async () => {
  console.log("Join Room clicked");

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
    console.log("Waiting for YouTube API...");
    return setTimeout(initPlayer, 400);
  }

  if (player) return;

  console.log("Creating YouTube Player");

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

// ================= TRACK PROGRESS =================
function startTracking() {
  setInterval(async () => {
    if (!player || !player.getDuration()) return;

    const progress =
      (player.getCurrentTime() / player.getDuration()) * 100;

    await setDoc(
      doc(db, "rooms", roomId, "users", user.uid),
      { name: user.displayName, progress }
    );
  }, 3000);
}

// ================= UI =================
function renderLeaderboard(users) {
  leaderboard.innerHTML = "";
  users.sort((a, b) => b.progress - a.progress);

  users.forEach(u => {
    leaderboard.innerHTML += `
      <div>
        <strong>${u.name}</strong>
        <div class="progress">
          <div class="progress-bar" style="width:${u.progress}%">
            ${u.progress.toFixed(0)}%
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

async function fetchPlaylistVideos(playlistId) {
  const YT_API_KEY = "AIzaSyCQ141N-fQAcGXu4uxCoqFAEK7Hc9V4rkk"; // YOUR KEY

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=25&playlistId=${playlistId}&key=${YT_API_KEY}`
  );

  const data = await res.json();
  if (!data.items) return [];

  return data.items.map(v => v.contentDetails.videoId);
}