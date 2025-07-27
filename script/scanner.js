import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  update 
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCefQpH77HPNPkO6buwL7rCI2oVBL77B8c",
  authDomain: "partypass-de9ff.firebaseapp.com",
  databaseURL: "https://partypass-de9ff-default-rtdb.firebaseio.com/",
  projectId: "partypass-de9ff",
  storageBucket: "partypass-de9ff.appspot.com",
  messagingSenderId: "149510056001",
  appId: "1:149510056001:web:f1a3e37982ab0fda56bec0"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const videoElement = document.getElementById('video');
const resultEl = document.getElementById('result');
const nameEl = document.getElementById('guest-name');

function onScanSuccess(decodedText) {
  const uniqueId = decodedText.trim();
  const guestRef = ref(db, 'guests/' + uniqueId);

  get(guestRef)
    .then((snapshot) => {
      if (!snapshot.exists()) {
        resultEl.textContent = "Guest not found in database";
        return;
      }

      const data = snapshot.val();
      
      if (data.has_scanned) {
        resultEl.textContent = `QR Code already used`;
        nameEl.textContent = "";
      } else {
        update(guestRef, { has_scanned: true })
          .then(() => {
            resultEl.textContent = `Welcome ${data.name}`;
            nameEl.textContent = data.name;
            
            // Log the scan
            const logRef = ref(db, `scan_logs/${uniqueId}_${Date.now()}`);
            set(logRef, {
              name: data.name,
              scannedAt: new Date().toISOString()
            });
          });
      }
    })
    .catch((error) => {
      console.error("Database error:", error);
      resultEl.textContent = "Error accessing database";
    })
    .finally(() => {
      html5QrCode.stop();
    });
}

function onScanFailure(error) {
  console.warn(`QR error = ${error}`);
}

const html5QrCode = new Html5Qrcode("video");
const config = { fps: 10, qrbox: { width: 250, height: 250 } };

html5QrCode.start(
  { facingMode: "environment" }, 
  config, 
  onScanSuccess, 
  onScanFailure
).catch((err) => {
  console.error("Camera start error:", err);
  resultEl.textContent = "Cannot start camera: " + err.message;
});