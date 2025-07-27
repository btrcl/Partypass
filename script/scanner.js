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
const nameEl = document.getElementById('guest-name');
const statusEl = document.getElementById('scanner-status');
const permissionRequest = document.getElementById('permission-request');
const requestAccessBtn = document.getElementById('request-access');

let scanner = null;

// Main initialization
document.addEventListener('DOMContentLoaded', async () => {
  // First verify we can access camera
  if (!await verifyCameraAccess()) {
    showPermissionRequest();
    return;
  }
  
  // Then initialize Firebase and scanner
  initializeScanner();
});

async function verifyCameraAccess() {
  try {
    // Test basic camera access
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API not supported');
    }
    
    // Special handling for iOS
    if (isIOS()) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    }
    
    // For other devices
    const permission = await navigator.permissions.query({ name: 'camera' });
    return permission.state === 'granted';
  } catch (err) {
    console.error('Camera access check failed:', err);
    return false;
  }
}

function showPermissionRequest() {
  permissionRequest.style.display = 'block';
  statusEl.style.display = 'none';
  
  requestAccessBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      permissionRequest.style.display = 'none';
      statusEl.style.display = 'block';
      initializeScanner();
    } catch (err) {
      statusEl.textContent = 'Please enable camera in browser settings';
    }
  });
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

async function initializeScanner() {
  statusEl.textContent = 'Starting camera...';
  
  try {
    scanner = new Html5Qrcode("video");
    
    // Mobile-specific configuration
    const config = {
      fps: 10,
      qrbox: 250,
      aspectRatio: 1.0,
      disableFlip: false
    };
    
    // Camera selection logic
    const cameras = await Html5Qrcode.getCameras();
    if (cameras.length === 0) {
      throw new Error('No cameras found');
    }
    
    // Prefer rear camera on mobile
    let cameraId = cameras[0].id;
    if (isMobile()) {
      const rearCamera = cameras.find(c => 
        c.label.includes('back') || 
        c.label.includes('rear') ||
        c.label.includes('environment')
      );
      if (rearCamera) cameraId = rearCamera.id;
    }
    
    await scanner.start(
      cameraId,
      config,
      onScanSuccess,
      onScanError
    );
    
    statusEl.textContent = 'Scanner ready';
    
    // Verify video is actually playing
    await waitForVideoPlayback();
    
  } catch (err) {
    console.error('Scanner init error:', err);
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

async function waitForVideoPlayback() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (videoElement.readyState > 0 && videoElement.videoWidth > 0) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

async function tryFallbackScanner() {
  statusEl.textContent = 'Trying alternative method...';
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
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
  statusEl.textContent = 'Processing QR code...';
  handleScan(decodedText);
}

function onScanError(error) {
  // Ignore common errors during normal operation
  if (!error.message.includes('No multi format readers configured') &&
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