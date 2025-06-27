
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getDatabase, ref, push, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Load EmailJS
import emailjs from "https://cdn.jsdelivr.net/npm/emailjs-com@3/dist/email.min.js";
emailjs.init("-Xr6dFMz3d3TSN32x"); // Your Public Key

// Initialize Firebase (form app)
let app;
if (!getApps().length) {
  app = initializeApp({
    apiKey: "AIzaSyCN0douQFost_MgeTuq0yTAXAL-P3ychwc",
    authDomain: "swm-form.firebaseapp.com",
    databaseURL: "https://swm-form-default-rtdb.firebaseio.com",
    projectId: "swm-form",
    storageBucket: "swm-form.appspot.com",
    messagingSenderId: "14785897186",
    appId: "1:14785897186:web:4e32256d8cf7ab0e2eb4bb"
  });
} else {
  app = getApps()[0];
}
const db = getDatabase(app);

// Initialize dashboard app
const dashboardApp = initializeApp({
  apiKey: "AIzaSyDuqybZA8XIIzw01xjBd9qqRlRIoONzFRw",
  authDomain: "capstone-bb22d.firebaseapp.com",
  projectId: "capstone-bb22d",
  storageBucket: "capstone-bb22d.firebasestorage.app",
  messagingSenderId: "685369102583",
  appId: "1:685369102583:web:e622f5d15890120ae1c3f2"
}, "dashboardApp");
const dashboardDb = getFirestore(dashboardApp);

// Map setup
const map = L.map('map').setView([25.2048, 55.2708], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// Icons
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
const selectedIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const markerMap = {};
let selectedMarker = null;

// Load bins
async function loadBins() {
  const binsSnap = await getDocs(collection(dashboardDb, "waste_bins"));
  binsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.location?.lat && data.location?.lng) {
      const marker = L.marker([data.location.lat, data.location.lng], { icon: defaultIcon }).addTo(map);
      marker.bindPopup(`
        <strong>Bin ID: ${data.bin_id || doc.id}</strong><br/>
        <button type="button" onclick="selectBin('${data.bin_id || doc.id}')">Select</button>
      `);
      markerMap[data.bin_id || doc.id] = marker;
    }
  });
}
loadBins();

// Select bin
window.selectBin = function (binId) {
  document.getElementById("binId").value = binId;
  if (selectedMarker) selectedMarker.setIcon(defaultIcon);
  selectedMarker = markerMap[binId];
  if (selectedMarker) selectedMarker.setIcon(selectedIcon);
};

// Show/hide "Other" issue field
document.getElementById("issue").addEventListener("change", () => {
  const container = document.getElementById("otherIssueContainer");
  if (issue.value === "Other") {
    container.style.display = "block";
    document.getElementById("otherIssue").required = true;
  } else {
    container.style.display = "none";
    document.getElementById("otherIssue").required = false;
  }
});

// Submit form
document.getElementById("reportForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const binId = document.getElementById("binId").value;
  const issue = document.getElementById("issue").value;
  const severity = document.getElementById("severity").value;
  const comments = document.getElementById("comments").value;
  const imageFile = document.getElementById("image").files[0];
  const email = document.getElementById("email").value;
  const otherIssue = document.getElementById("otherIssue")?.value || "";

  if (!imageFile) return alert("Please upload an image.");

  const reader = new FileReader();
  reader.onloadend = async function () {
    const base64Image = reader.result;
    try {
      const reportRef = push(ref(db, "reports"));
      await set(reportRef, {
        binId, issue, otherDetails: issue === "Other" ? otherIssue : "",
        severity, comments, imageBase64: base64Image, email,
        timestamp: new Date().toISOString()
      });

      // Send email
      await emailjs.send("service_b2f3xjh", "template_mbb8nnb", {
        to_email: email,
        bin_id: binId,
        issue_type: issue,
        severity_level: severity,
        comments: comments || "No additional comments"
      });

      window.location.assign("confirmation.html");
    } catch (err) {
      console.error("Error:", err);
      alert("Submission failed.");
    }
  };
  reader.readAsDataURL(imageFile);
});
