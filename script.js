
// Import the functions you need from the SDKs you need
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Initialize default app (form app) only if not already initialized
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

// Initialize dashboard app with a custom name
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

// Add map setup
const map = L.map('map').setView([24.7136, 46.6753], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

async function loadBins() {
  const binsSnap = await getDocs(collection(dashboardDb, "waste_bins"));
  binsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.location && data.location.lat && data.location.lng) {
      const marker = L.marker([data.location.lat, data.location.lng]).addTo(map);
      marker.bindPopup(`
        <strong>Bin ID: ${data.bin_id || doc.id}</strong><br/>
        <button onclick="selectBin('${data.bin_id || doc.id}')">Select</button>
      `);
    }
  });
}
loadBins();

// Fetch bins from Firebase and add markers
const binsRef = ref(dashboardDb, 'bins');
onValue(binsRef, (snapshot) => {
  const bins = snapshot.val();
  if (bins) {
    for (const key in bins) {
      const bin = bins[key];
      const marker = L.marker([bin.lat, bin.lng]).addTo(map);
      marker.bindPopup(`
        <strong>${bin.name || 'Bin'}</strong><br />
        <button onclick="selectBin('${key}')">Select</button>
      `);
    }
  } else {
    console.warn("No bins found in dashboard database.");
  }
});

window.selectBin = function(binId) {
  document.getElementById('binId').value = binId;
  alert("Selected bin: " + binId);
};

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

document.getElementById("reportForm").addEventListener("submit", function (e) {
  e.preventDefault();

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
  window.selectBin = function(binId) {
  document.getElementById("binId").value = binId;
  alert("Selected bin: " + binId);
};

  reader.readAsDataURL(imageFile);
});
