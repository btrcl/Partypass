import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
const auth = getAuth(app);

window.login = function() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      window.location.href = "qr-scanner-fixed.html";
    })
    .catch((error) => {
      errorEl.textContent = "Login failed: " + error.message;
    });
};