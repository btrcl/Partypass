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
const statusEl = document.getElementById('scanner-status');
const cameraOverlay = document.getElementById('camera-overlay');

let scanner = null;
let isProcessing = false; // Prevent multiple scans

// Main initialization
document.addEventListener('DOMContentLoaded', async () => {
  // First verify camera access
  if (!await verifyCameraAccess()) {
    showCameraError();
    return;
  }

  // Initialize scanner
  initializeScanner();
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
  // Prevent multiple scans
  if (isProcessing) return;
  
  isProcessing = true;
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
    console.log(`[${new Date().toLocaleTimeString()}] INFO: Scanned QR Code: ${uniqueId}`);
    
    // Stop scanner immediately to prevent multiple scans
    if (scanner) {
      await scanner.stop();
    }
    
    const guestRef = ref(db, 'guests/' + uniqueId);
    const snapshot = await get(guestRef);

    if (!snapshot.exists()) {
      console.log('Guest not found for ID:', uniqueId);
      const message = `Guest not found - ID: ${uniqueId}`;
      statusEl.innerHTML = `<div style="color: red; font-size: 16px; text-align: center; padding: 10px;">${message}</div>`;
      
      // Restart scanner after delay
      setTimeout(() => {
        isProcessing = false;
        initializeScanner();
      }, 3000);
      return;
    }

    const data = snapshot.val();
    console.log(`[${new Date().toLocaleTimeString()}] INFO: Guest Info - Name: ${data.name}, Firebase ID: ${uniqueId}`);
    
    let displayMessage = '';
    
    if (data.has_scanned) {
      displayMessage = `
        <div style="color: orange; font-size: 18px; text-align: center; padding: 10px;">
          <div>Already Scanned!</div>
          <div style="margin-top: 10px;">Guest: <strong>${data.name}</strong></div>
          <div style="margin-top: 5px; font-size: 14px;">ID: ${uniqueId}</div>
        </div>
      `;
    } else {
      await update(guestRef, { has_scanned: true });
      displayMessage = `
        <div style="color: green; font-size: 20px; text-align: center; padding: 10px;">
          <div>✅ ${data.name}</div>
          <div style="margin-top: 10px; font-size: 16px;">Guest ID: <strong>${uniqueId}</strong></div>
          <div style="margin-top: 5px; font-size: 12px; color: #666;">Scanned: ${new Date().toLocaleTimeString()}</div>
        </div>
      `;
      
      const logRef = ref(db, `scan_logs/${uniqueId}_${Date.now()}`);
      await set(logRef, {
        name: data.name,
        uniqueId: uniqueId,
        scannedAt: new Date().toISOString()
      });
    }
    
    statusEl.innerHTML = displayMessage;
    console.log('Guest info displayed:', displayMessage);
    
  } catch (err) {
    console.error("Database Error:", err);
    const errorMessage = `<div style="color: red; text-align: center; padding: 10px;">Error: ${err.message}<br>QR: ${decodedText}</div>`;
    statusEl.innerHTML = errorMessage;
  } finally {
    // Reset processing flag and restart scanner after delay
    setTimeout(() => {
      isProcessing = false;
      statusEl.textContent = 'Ready to scan';
      initializeScanner();
    }, 3000);
  }
}