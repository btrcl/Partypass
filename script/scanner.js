import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, update, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

// DOM Elements
const videoElement = document.getElementById('video');
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('scanner-status');
const focusBtn = document.getElementById('manual-focus');
const cameraOverlay = document.getElementById('camera-overlay');

let scanner = null;
let isFocusMode = false;

// Main initialization
document.addEventListener('DOMContentLoaded', async () => {
  // First verify camera access
  if (!await verifyCameraAccess()) {
    showCameraError();
    return;
  }

  // Initialize scanner
  initializeScanner();
  
  // Set up focus toggle
  focusBtn.addEventListener('click', toggleFocusMode);
});

async function verifyCameraAccess() {
  try {
    // Test with a temporary stream
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    // Verify we can actually see video
    videoElement.srcObject = stream;
    await new Promise(resolve => {
      videoElement.onloadedmetadata = resolve;
    });
    
    // Clean up
    stream.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
    
    return true;
  } catch (err) {
    console.error('Camera access verification failed:', err);
    return false;
  }
}

function showCameraError() {
  statusEl.innerHTML = `
    <p>Camera access denied or unavailable</p>
    <button id="retry-camera">Retry Camera</button>
    <p>Try these steps:</p>
    <ol>
      <li>Refresh the page</li>
      <li>Allow camera permissions</li>
      <li>Ensure no other app is using the camera</li>
    </ol>
  `;
  
  document.getElementById('retry-camera').addEventListener('click', () => {
    window.location.reload();
  });
}

async function initializeScanner() {
  try {
    scanner = new Html5Qrcode("video");
    
    // Get available cameras
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length === 0) {
      throw new Error('No cameras detected on this device');
    }
    
    // Mobile-specific configuration
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      disableFlip: false
    };
    
    // Camera selection logic
    let cameraId;
    if (isMobile()) {
      // Prefer rear camera on mobile
      const rearCamera = cameras.find(cam => 
        cam.label.toLowerCase().includes('back') ||
        cam.label.toLowerCase().includes('rear') ||
        cam.label.toLowerCase().includes('environment')
      );
      cameraId = rearCamera ? rearCamera.id : cameras[0].id;
    } else {
      // For desktop/laptop
      cameraId = cameras[0].id;
    }
    
    // Start scanner
    await scanner.start(
      cameraId,
      config,
      onScanSuccess,
      onScanError
    );
    
    // Verify video is actually playing
    await verifyVideoPlayback();
    
    statusEl.textContent = 'Scanner ready - Point at QR code';
    cameraOverlay.style.display = 'block';
    
  } catch (err) {
    console.error('Scanner initialization failed:', err);
    statusEl.textContent = `Error: ${err.message}`;
    
    // Fallback to environment facing mode
    if (err.message.includes('index') || err.message.includes('range')) {
      tryFallbackScanner();
    }
  }
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function verifyVideoPlayback() {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (videoElement.readyState > 0 && videoElement.videoWidth > 0) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
    
    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Video playback timeout'));
    }, 5000);
  });
}

function toggleFocusMode() {
  isFocusMode = !isFocusMode;
  focusBtn.textContent = isFocusMode ? 'Exit Focus Mode' : 'Toggle Focus Mode';
  cameraOverlay.style.backgroundColor = isFocusMode ? 'rgba(0,0,0,0.7)' : 'transparent';
}

async function tryFallbackScanner() {
  statusEl.textContent = 'Trying alternative camera...';
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      onScanSuccess,
      onScanError
    );
    statusEl.textContent = 'Scanner ready (fallback mode)';
  } catch (fallbackErr) {
    console.error('Fallback scanner failed:', fallbackErr);
    statusEl.textContent = 'Failed to start camera. Please try another device.';
  }
}

function onScanSuccess(decodedText) {
  statusEl.textContent = 'Processing QR code...';
  handleScan(decodedText);
}

function onScanError(error) {
  // Ignore common non-critical errors
  if (!error.message.includes('No QR code found') &&
      !error.message.includes('width is 0')) {
    console.log('Scan error:', error);
  }
}

async function handleScan(decodedText) {
  try {
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
    } else {
      await update(guestRef, { has_scanned: true });
      resultEl.textContent = `Welcome ${data.name}`;
      
      const logRef = ref(db, `scan_logs/${uniqueId}_${Date.now()}`);
      await set(logRef, {
        name: data.name,
        scannedAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error("Database Error:", err);
    resultEl.textContent = "Error processing scan";
  } finally {
    statusEl.textContent = 'Ready to scan';
    if (scanner) {
      scanner.stop().then(() => {
        setTimeout(initializeScanner, 1000);
      });
    }
  }
}