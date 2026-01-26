// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 🔥 SUA CONFIG (a mesma que você mandou)
const firebaseConfig = {
  apiKey: "AIzaSyDAkapYFpjsugAn5lFq8e5pXHdecn75Ej8",
  authDomain: "teste-f579d.firebaseapp.com",
  databaseURL: "https://teste-f579d-default-rtdb.firebaseio.com",
  projectId: "teste-f579d",
  storageBucket: "teste-f579d.firebasestorage.app",
  messagingSenderId: "884652869722",
  appId: "1:884652869722:web:62519ca31c81099e457063"
};
""
// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Caminho no Realtime Database
const deviceRef = ref(database, "devices/teste1");

// Escuta em tempo real
onValue(deviceRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  document.getElementById("battery").innerText = data.battery + "%";
  document.getElementById("ip").innerText = data.ip;
  document.getElementById("lastUpdate").innerText =
    new Date(data.timestamp).toLocaleString();
});
