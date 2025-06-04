// Import the functions you need from the SDKs you need

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, push, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCN0douQFost_MgeTuq0yTAXAL-P3ychwc",
  authDomain: "swm-form.firebaseapp.com",
  databaseURL: "https://swm-form-default-rtdb.firebaseio.com",
  projectId: "swm-form",
  storageBucket: "swm-form.appspot.com",
  messagingSenderId: "14785897186",
  appId: "1:14785897186:web:4e32256d8cf7ab0e2eb4bb",
  measurementId: "G-3R8K7HY0QT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

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
      document.getElementById("confirmation").style.display = "block";

    } catch (error) {
      console.error("Submission failed:", error);
      alert("There was an error submitting your report.");
    }
  };

  reader.readAsDataURL(imageFile);
});
