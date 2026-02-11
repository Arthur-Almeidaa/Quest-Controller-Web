import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* =========================
   FIREBASE CONFIG
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDAkapYFpjsugAn5lFq8e5pXHdecn75Ej8",
  databaseURL: "https://teste-f579d-default-rtdb.firebaseio.com",
  projectId: "teste-f579d"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* =========================
   VERIFICAR SE JÁ ESTÁ LOGADO
========================= */
onAuthStateChanged(auth, user => {
  if (user) {
    // Já autenticado – vai direto ao painel
    window.location.href = "painel.html";
  }
});

/* =========================
   STATS AO VIVO (lado esquerdo)
========================= */
onValue(ref(db, "devices"), snap => {
  const data = snap.val() || {};
  const total  = Object.keys(data).length;
  const online = Object.values(data).filter(d => d.status === "online").length;

  animateNumber("liveDevices", total);
  animateNumber("liveOnline",  online);
});

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;

  const step = target > current ? 1 : -1;
  let val = current;
  const interval = setInterval(() => {
    val += step;
    el.textContent = val;
    if (val === target) clearInterval(interval);
  }, 40);
}

/* =========================
   PARTÍCULAS DE FUNDO
========================= */
(function initParticles() {
  const canvas = document.getElementById("particles");
  const ctx    = canvas.getContext("2d");
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = Array.from({ length: 60 }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      a:  Math.random() * 0.4 + 0.15
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Linhas de conexão
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(59,130,246,${0.1 * (1 - dist / 130)})`;
          ctx.lineWidth   = 0.7;
          ctx.stroke();
        }
      }
    }

    // Pontos
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(59,130,246,${p.a})`;
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });

    requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();
  window.addEventListener("resize", () => { resize(); createParticles(); });
})();

/* =========================
   FORMULÁRIO DE LOGIN
========================= */
const loginForm    = document.getElementById("loginForm");
const emailInput   = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberMe   = document.getElementById("rememberMe");
const btnLogin     = document.getElementById("btnLogin");
const btnLoginText = document.getElementById("btnLoginText");
const btnLoginSpinner = document.getElementById("btnLoginSpinner");

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  clearErrors();

  const email    = emailInput.value.trim();
  const password = passwordInput.value;
  let valid = true;

  if (!email) {
    showFieldError("emailError", "Digite seu e-mail");
    emailInput.classList.add("input-error");
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError("emailError", "E-mail inválido");
    emailInput.classList.add("input-error");
    valid = false;
  }

  if (!password) {
    showFieldError("passwordError", "Digite sua senha");
    passwordInput.classList.add("input-error");
    valid = false;
  }

  if (!valid) return;

  setLoading(true);

  try {
    const persistence = rememberMe.checked
      ? browserLocalPersistence
      : browserSessionPersistence;

    await setPersistence(auth, persistence);
    await signInWithEmailAndPassword(auth, email, password);

    showAlert("alertSuccess", null, true);
    // onAuthStateChanged vai redirecionar automaticamente

  } catch (err) {
    setLoading(false);
    showAlert("alertError", friendlyError(err.code));
  }
});

/* =========================
   MOSTRAR / OCULTAR SENHA
========================= */
const btnTogglePassword = document.getElementById("btnTogglePassword");
const eyeIconSpan = document.getElementById("eyeIcon");

const eyeOpenSVG = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
  </svg>
`;

const eyeClosedSVG = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
`;

btnTogglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  eyeIconSpan.innerHTML = isPassword ? eyeClosedSVG : eyeOpenSVG;
});

/* =========================
   MODAL: ESQUECI A SENHA
========================= */
document.getElementById("btnForgot").addEventListener("click", () => {
  document.getElementById("forgotEmail").value = emailInput.value;
  document.getElementById("forgotAlert").style.display = "none";
  document.getElementById("forgotModal").classList.add("active");
});

document.getElementById("btnCloseForgot").addEventListener("click",  closeForgotModal);
document.getElementById("btnCancelForgot").addEventListener("click", closeForgotModal);
document.getElementById("forgotModal").addEventListener("click", e => {
  if (e.target.id === "forgotModal") closeForgotModal();
});

function closeForgotModal() {
  document.getElementById("forgotModal").classList.remove("active");
}

document.getElementById("btnSendReset").addEventListener("click", async () => {
  const email = document.getElementById("forgotEmail").value.trim();
  const alertEl = document.getElementById("forgotAlert");

  if (!email) {
    showInlineAlert(alertEl, "error", "Digite seu e-mail.");
    return;
  }

  const btn = document.getElementById("btnSendReset");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    await sendPasswordResetEmail(auth, email);
    showInlineAlert(alertEl, "success", "✓ E-mail enviado! Verifique sua caixa de entrada.");
    btn.textContent = "Enviado!";
  } catch (err) {
    showInlineAlert(alertEl, "error", friendlyError(err.code));
    btn.disabled = false;
    btn.textContent = "Enviar e-mail";
  }
});

/* =========================
   UTILITÁRIOS
========================= */
function setLoading(loading) {
  btnLogin.disabled         = loading;
  btnLoginText.style.display  = loading ? "none" : "block";
  btnLoginSpinner.style.display = loading ? "block" : "none";
}

function showFieldError(id, message) {
  document.getElementById(id).textContent = message;
}

function clearErrors() {
  document.getElementById("emailError").textContent    = "";
  document.getElementById("passwordError").textContent = "";
  emailInput.classList.remove("input-error");
  passwordInput.classList.remove("input-error");
  document.getElementById("alertError").style.display   = "none";
  document.getElementById("alertSuccess").style.display = "none";
}

function showAlert(id, message, show = true) {
  const el = document.getElementById(id);
  if (message) {
    const msgEl = el.querySelector("span:last-child");
    if (msgEl) msgEl.textContent = message;
  }
  el.style.display = show ? "flex" : "none";
}

function showInlineAlert(el, type, message) {
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span class="alert-icon">${type === "error" ? "⚠️" : "✓"}</span><span>${message}</span>`;
  el.style.display = "flex";
}

function friendlyError(code) {
  const messages = {
    "auth/user-not-found":     "Nenhuma conta encontrada com este e-mail.",
    "auth/wrong-password":     "Senha incorreta. Tente novamente.",
    "auth/invalid-email":      "O e-mail informado é inválido.",
    "auth/user-disabled":      "Esta conta foi desativada.",
    "auth/too-many-requests":  "Muitas tentativas. Aguarde alguns minutos.",
    "auth/network-request-failed": "Erro de conexão. Verifique sua internet.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
  };
  return messages[code] || "Erro inesperado. Tente novamente.";
}

/* Limpa erro ao digitar */
emailInput.addEventListener("input",    () => {
  emailInput.classList.remove("input-error");
  document.getElementById("emailError").textContent = "";
});
passwordInput.addEventListener("input", () => {
  passwordInput.classList.remove("input-error");
  document.getElementById("passwordError").textContent = "";
});