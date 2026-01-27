import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDAkapYFpjsugAn5lFq8e5pXHdecn75Ej8",
  authDomain: "teste-f579d.firebaseapp.com",
  databaseURL: "https://teste-f579d-default-rtdb.firebaseio.com",
  projectId: "teste-f579d",
  storageBucket: "teste-f579d.firebasestorage.app",
  messagingSenderId: "884652869722",
  appId: "1:884652869722:web:62519ca31c81099e457063"
};

// 🔹 Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 🔹 Função pública pra escutar dispositivos
export function listenDevices(callback) {
  const devicesRef = ref(db, "devices");

  onValue(devicesRef, (snapshot) => {
    callback(snapshot);
  });
}
