// Import the functions you need from the SDKs you need
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getDatabase, ref, push, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Initialize default app (form app)
let app;
if (!getApps().length) {
  app = initializeApp({
    apiKey: "AIzaSyCN0douQFost_MgeTuq0yTAXAL-P3ychwc",
    authDomain: "swm-form.firebaseapp.com",
    databaseURL: "https://swm-form-default-rtdb.firebaseio.com",
    projectId: "swm-form",
    storageBucket: "swm-form.appspot.com",
    messagingSenderId: "14785897186",
    appId: "1:14785897186:web:4e32256d8cf7ab0e2eb4bb",
    measurementId: "G-3R8K7HY0QT"
  });
} else {
  app = getApps()[0];
}
const db = getDatabase(app);

// Initialize dashboard app (bins data)
const dashboardApp = initializeApp({
  apiKey: "AIzaSyDuqybZA8XIIzw01xjBd9qqRlRIoONzFRw",
  authDomain: "capstone-bb22d.firebaseapp.com",
  projectId: "capstone-bb22d",
  storageBucket: "capstone-bb22d.firebasestorage.app",
  messagingSenderId: "685369102583",
  appId: "1:685369102583:web:e622f5d15890120ae1c3f2",
  measurementId: "G-C2646S3XJB",
}, "dashboardApp");
const dashboardDb = getFirestore(dashboardApp);

// Map setup
const map = L.map('map').setView([25.2048, 55.2708], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);
loadBins();

// Icons
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
const selectedIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});


// Marker storage
const markerMap = {};
let selectedMarker = null;

const reportRef = push(ref(db, "reports"));
await set(reportRef, {
  binId,
  issue,
  otherDetails: issue === "Other" ? otherIssue : "",
  severity,
  comments,
  imageBase64: base64Image,
  email,
  timestamp: new Date().toISOString()
});


// Load bins
async function loadBins() {
  const binsSnap = await getDocs(collection(dashboardDb, "waste_bins"));
  binsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.location && data.location.lat && data.location.lng) {
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

// Bin selection
window.selectBin = function (binId) {
  document.getElementById("binId").value = binId;
 const toast = document.getElementById("toast");
toast.innerText = `Selected bin: ${binId}`;
toast.style.display = "block";
setTimeout(() => {
  toast.style.display = "none";
}, 2500);


  if (selectedMarker) {
    selectedMarker.setIcon(defaultIcon);
    // Reset previous marker's popup to show Select button
    const prevBinId = Object.keys(markerMap).find(id => markerMap[id] === selectedMarker);
    if (prevBinId) {
      selectedMarker.bindPopup(`
        <strong>Bin ID: ${prevBinId}</strong><br/>
        <button type="button" onclick="selectBin('${prevBinId}')">Select</button>
      `);
    }
  }

  selectedMarker = markerMap[binId];
  if (selectedMarker) {
    selectedMarker.setIcon(selectedIcon);

    // Update popup to show "Selected"
    selectedMarker.bindPopup(`
      <strong>Bin ID: ${binId}</strong><br/>
      <span style="color: #2e7d32; font-weight: bold;">✓ Selected</span>
    `);

// Make marker bounce
if (selectedMarker.setBouncingOptions) {
  selectedMarker.setBouncingOptions({ bounceHeight: 20, bounceSpeed: 54 });
  selectedMarker.bounce(3); // bounce 3 times
}

  }

  const label = document.getElementById("selectedBinText");
  if (label) {
    label.innerText = `Selected Bin: ${binId}`;
  }
};

// Handle "Other" issue logic
const issueSelect = document.getElementById("issue");
const otherIssueContainer = document.getElementById("otherIssueContainer");
issueSelect.addEventListener("change", () => {
  if (issueSelect.value === "Other") {
    otherIssueContainer.style.display = "block";
    document.getElementById("otherIssue").setAttribute("required", "required");
  } else {
    otherIssueContainer.style.display = "none";
    document.getElementById("otherIssue").removeAttribute("required");
  }
});

// Submit form
document.getElementById("reportForm").addEventListener("submit", function (e) {
  e.preventDefault();
  
  const email = document.getElementById("email").value;
  const binId = document.getElementById("binId").value;
  const issue = document.getElementById("issue").value;
  const severity = document.getElementById("severity").value;
  const comments = document.getElementById("comments").value;
  const imageFile = document.getElementById("image").files[0];
  const otherIssue = document.getElementById("otherIssue")?.value || "";

  if (!imageFile) {
    alert("Please upload an image.");
    return;
  }

  const confirmSubmit = confirm("Are you sure you want to submit this report?");
  if (!confirmSubmit) return;

  const reader = new FileReader();
  reader.onloadend = async function () {
    const base64Image = reader.result;

    try {
      const reportRef = push(ref(db, "reports"));
      await set(reportRef, {
        binId,
        issue,
        otherDetails: issue === "Other" ? otherIssue : "",
        severity,
        comments,
        imageBase64: base64Image,
        timestamp: new Date().toISOString()
      });

      document.getElementById("reportForm").reset();
      document.getElementById("otherIssueContainer").style.display = "none";
      window.location.href = "confirmation.html";

    } catch (error) {
      console.error("Submission failed:", error);
      alert("There was an error submitting your report.");
    }
  };

  reader.readAsDataURL(imageFile);
});

