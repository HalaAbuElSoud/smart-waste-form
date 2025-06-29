// Import dependencies
import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.js';
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getDatabase, ref, push, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

emailjs.init("-Xr6dFMz3d3TSN32x");

// Firebase App (form)
let app;
if (!getApps().length) {
  app = initializeApp({
    apiKey: "AIzaSyCtLvC8ubJgurJhvs3BLaIBXwkYj5Z6Zao",
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

// Firebase App (dashboard)
const dashboardApp = initializeApp({
  apiKey: "AIzaSyDuqybZA8XIIzw01xjBd9qqRlRIoONzFRw",
  authDomain: "capstone-bb22d.firebaseapp.com",
  projectId: "capstone-bb22d",
  storageBucket: "capstone-bb22d.firebasestorage.app",
  messagingSenderId: "685369102583",
  appId: "1:685369102583:web:e622f5d15890120ae1c3f2"
}, "dashboardApp");
const dashboardDb = getFirestore(dashboardApp);

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

// Load bins and map only after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const map = L.map('map').setView([25.2048, 55.2708], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  loadBins(map);

  // Select bin handler
  window.selectBin = function (binId) {
    document.getElementById("binId").value = binId;
    if (selectedMarker) selectedMarker.setIcon(defaultIcon);
    selectedMarker = markerMap[binId];
    if (selectedMarker) selectedMarker.setIcon(selectedIcon);

    const toast = document.getElementById("toast");
    toast.innerText = `Selected bin: ${binId}`;
    toast.style.display = "block";
    setTimeout(() => toast.style.display = "none", 2500);
  };

  // Show "Other" field dynamically
  const issueSelect = document.getElementById("issue");
  const otherContainer = document.getElementById("otherIssueContainer");
  issueSelect.addEventListener("change", () => {
    if (issueSelect.value === "Other") {
      otherContainer.style.display = "block";
      document.getElementById("otherIssue").required = true;
    } else {
      otherContainer.style.display = "none";
      document.getElementById("otherIssue").required = false;
    }
  });

  // Submit form
 document.getElementById("reportForm").addEventListener("submit", async function (e) {
  e.preventDefault();


  const form = document.getElementById("reportForm");
  const submitBtn = document.querySelector("#reportForm button[type='submit']");
  // Disable the button and show submitting immediately
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  const binId = document.getElementById("binId").value;
  const toast = document.getElementById("toast");

  if (!binId) {
    toast.textContent = "Please select a bin on the map before submitting.";
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 3000);
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
    return;
  }

  const issue = document.getElementById("issue").value;
  const severity = document.getElementById("severity").value;
  const comments = document.getElementById("comments").value;
  const email = document.querySelector("input[name='to_email']").value;
  const name = document.querySelector("input[name='to_name']").value;
  const otherIssue = document.getElementById("otherIssue")?.value || "";
  const imageFile = document.getElementById("image").files[0];

  if (!imageFile) {
    alert("Please upload an image.");
    submitting = false;
    return;
  }

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
        email,
        name,
        timestamp: new Date().toISOString()
      });

      console.log("Sending EmailJS payload:", {
        to_email: email,
        bin_id: binId,
        issue_type: issue,
        severity_level: severity,
        comments: comments || "No comments"
      });

      await emailjs.send("service_b2f3xjh", "template_t8abxca", {
        to_email: email,
        to_name: name,
        bin_id: binId,
        issue_type: issue,
        severity_level: severity,
        comments: comments || "No additional comments"
      });

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";

      window.location.assign("confirmation.html");
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Something went wrong. Please try again.");
      submitting = false;
    }
  };

  reader.readAsDataURL(imageFile);
});
 
// Load bins from Firestore
async function loadBins(map) {
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
});
