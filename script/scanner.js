import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  get, 
  update, 
  set 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCefQpH77HPNPkO6buwL7rCI2oVBL77B8c",
  authDomain: "partypass-de9ff.firebaseapp.com",
  databaseURL: "https://partypass-de9ff-default-rtdb.firebaseio.com",
  projectId: "partypass-de9ff",
  storageBucket: "partypass-de9ff.appspot.com",
  messagingSenderId: "149510056001",
  appId: "1:149510056001:web:f1a3e37982ab0fda56bec0",
  measurementId: "G-G22BV2YH21"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const videoElement = document.getElementById('video');
const resultEl = document.getElementById('result');
const nameEl = document.getElementById('guest-name');
const statusEl = document.getElementById('scanner-status');
const debugBtn = document.getElementById('debug-btn');

let activeScanner = null;

// Enable debug button
debugBtn.style.display = 'block';
debugBtn.addEventListener('click', debugCameras);

// iOS specific fixes
if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  enableInlineVideo(videoElement);
}

async function initScanner() {
  try {
    statusEl.textContent = 'Initializing scanner...';
    
    // Check mobile permissions
    if (!await checkMobilePermissions()) return;

    activeScanner = new Html5Qrcode("video", true);
    const cameras = await Html5Qrcode.getCameras();
    
    if (cameras.length === 0) {
      throw new Error('No cameras detected');
    }

    const cameraId = selectBestCamera(cameras);
    console.log('Using camera:', cameras.find(c => c.id === cameraId)?.label);

    await activeScanner.start(
      cameraId,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: true
      },
      onScanSuccess,
      onScanError
    );

    statusEl.textContent = 'Scanner ready';
    
  } catch (err) {
    console.error('Scanner init failed:', err);
    statusEl.textContent = `Error: ${err.message}`;
    
    if (err.message.includes('index is not in the allowed range')) {
      tryFallbackScanner();
    }
  }
}

function selectBestCamera(cameras) {
  // Mobile preference
  if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
    const rearCamera = cameras.find(cam => 
      cam.label.includes('back') || 
      cam.label.includes('rear') ||
      cam.label.includes('environment')
    );
    return rearCamera?.id || cameras[0].id;
  }
  // Desktop preference
  return cameras[0].id;
}

async function checkMobilePermissions() {
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') {
        statusEl.textContent = 'Camera permission denied';
        return false;
      }
    } catch (err) {
      console.error('Permission error:', err);
      statusEl.textContent = 'Please enable camera access';
      return false;
    }
  }
  return true;
}

async function tryFallbackScanner() {
  statusEl.textContent = 'Trying fallback method...';
  try {
    activeScanner = new Html5Qrcode("video");
    await activeScanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: 250,
        supportedScanTypes: [Html5Qrcode.ScanType.SCAN_TYPE_CAMERA]
      },
      onScanSuccess,
      onScanError
    );
    statusEl.textContent = 'Scanner ready (fallback mode)';
  } catch (fallbackErr) {
    console.error('Fallback failed:', fallbackErr);
    statusEl.textContent = 'Failed to start camera. Please try another device.';
  }
}

function onScanSuccess(decodedText) {
  handleScan(decodedText);
}

function onScanError(error) {
  if (!error.message.includes('NotAllowedError')) {
    console.log('Scan error:', error);
  }
}

async function handleScan(decodedText) {
  try {
    statusEl.textContent = 'Processing QR code...';
    const uniqueId = decodedText.trim();
    const guestRef = ref(db, 'guests/' + uniqueId);
    const snapshot = await get(guestRef);

    if (!snapshot.exists()) {
      resultEl.textContent = "Guest not found";
      statusEl.textContent = 'Ready to scan';
      return;
    }

    const data = snapshot.val();
    
    if (data.has_scanned) {
      resultEl.textContent = `Already scanned`;
      nameEl.textContent = "";
    } else {
      await update(guestRef, { has_scanned: true });
      resultEl.textContent = `Welcome ${data.name}`;
      nameEl.textContent = data.name;
      
      const logRef = ref(db, `scan_logs/${uniqueId}_${Date.now()}`);
      await set(logRef, {
        name: data.name,
        scannedAt: new Date().toISOString()
      });
    }
    statusEl.textContent = 'Scan complete. Ready for next scan.';
    
  } catch (err) {
    console.error("Database Error:", err);
    resultEl.textContent = "Error processing scan";
    statusEl.textContent = 'Ready to scan';
  } finally {
    if (activeScanner) {
      activeScanner.stop().then(() => {
        setTimeout(initScanner, 1000);
      });
    }
  }
}

async function debugCameras() {
  try {
    const cameras = await Html5Qrcode.getCameras();
    alert(`Available cameras:\n${
      cameras.map((cam, i) => `${i}: ${cam.label}`).join('\n')
    }`);
    
    console.log('Video element state:', {
      readyState: videoElement.readyState,
      width: videoElement.videoWidth,
      height: videoElement.videoHeight,
      playing: !videoElement.paused
    });
  } catch (err) {
    alert('Camera debug failed: ' + err.message);
  }
}

// Start scanner when page loads
document.addEventListener('DOMContentLoaded', initScanner);