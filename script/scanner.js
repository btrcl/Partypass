import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, update, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Firebase config (same as before)
const firebaseConfig = { apiKey: "AIzaSyCefQpH77HPNPkO6buwL7rCI2oVBL77B8c",
    authDomain: "partypass-de9ff.firebaseapp.com",
    projectId: "partypass-de9ff",
    storageBucket: "partypass-de9ff.firebasestorage.app",
    messagingSenderId: "149510056001",
    appId: "1:149510056001:web:f1a3e37982ab0fda56bec0",
    measurementId: "G-G22BV2YH21"
 };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const videoElement = document.getElementById('video');
const resultEl = document.getElementById('result');
const nameEl = document.getElementById('guest-name');
const statusEl = document.createElement('div');
statusEl.id = 'scanner-status';
document.body.prepend(statusEl);

// Scanner State
let activeScanner = null;
let scanRestartTimeout = null;

async function initScanner() {
  try {
    statusEl.textContent = 'Initializing scanner...';
    
    // Clear previous scanner if exists
    if (activeScanner) {
      await activeScanner.stop();
    }

    // Create new scanner instance
    activeScanner = new Html5Qrcode("video");
    
    // Get camera list
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length === 0) {
      throw new Error('No cameras available');
    }

    // Try rear camera first
    const cameraConfig = cameras.find(c => c.label.includes('back')) || cameras[0];
    statusEl.textContent = `Using camera: ${cameraConfig.label}`;

    // Start scanner with proper configuration
    await activeScanner.start(
      cameraConfig.id,
      {
        fps: 10,
        qrbox: { 
          width: 250,
          height: 250
        },
        aspectRatio: 1.0  // Ensures square video feed
      },
      onScanSuccess,
      onScanError
    );

    // Verify video element has content
    await verifyVideoFeed();
    
  } catch (err) {
    statusEl.textContent = `Scanner error: ${err.message}`;
    console.error('Scanner initialization failed:', err);
    retryScanner();
  }
}

async function verifyVideoFeed() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        clearInterval(checkInterval);
        statusEl.textContent = 'Scanner ready';
        resolve();
      }
    }, 100);
  });
}

function onScanSuccess(decodedText) {
  statusEl.textContent = 'Scan detected, processing...';
  handleScan(decodedText);
}

function onScanError(errorMessage) {
  // Ignore empty frame errors during normal operation
  if (!errorMessage.includes('source width is 0')) {
    console.warn('Scan error:', errorMessage);
    statusEl.textContent = `Scan error: ${errorMessage}`;
  }
}

async function handleScan(decodedText) {
  try {
    clearTimeout(scanRestartTimeout);
    await activeScanner.stop();
    
    const uniqueId = decodedText.trim();
    resultEl.textContent = "Processing...";

    // Database operations (same as before)
    const guestRef = ref(db, 'guests/' + uniqueId);
    const snapshot = await get(guestRef);

    if (!snapshot.exists()) {
      resultEl.textContent = "Guest not found";
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
  } catch (err) {
    console.error("Scan processing error:", err);
    resultEl.textContent = "Error processing scan";
  } finally {
    retryScanner();
  }
}

function retryScanner(delay = 2000) {
  clearTimeout(scanRestartTimeout);
  scanRestartTimeout = setTimeout(() => {
    statusEl.textContent = 'Restarting scanner...';
    initScanner().catch(console.error);
  }, delay);
}

// Initialize when ready
document.addEventListener('DOMContentLoaded', () => {
  // Add temporary test button
  const testBtn = document.createElement('button');
  testBtn.textContent = 'Test Video Feed';
  testBtn.onclick = () => {
    console.log('Video dimensions:', {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight
    });
    console.log('Video readyState:', videoElement.readyState);
  };
  document.body.appendChild(testBtn);

  initScanner();
});