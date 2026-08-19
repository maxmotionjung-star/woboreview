async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (res.status === 401 && !location.pathname.endsWith("login.html")) {
    location.href = "/login.html";
    throw new Error("인증 필요");
  }

  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    throw new Error(body?.error || `요청 실패 (${res.status})`);
  }
  return body;
}

async function requireAuthOrRedirect() {
  const { authenticated } = await api("/api/me");
  if (!authenticated) {
    location.href = "/login.html";
  }
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  location.href = "/login.html";
}

function gradeStars(grade) {
  const n = Number(grade) || 0;
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { hour12: false });
}

function formatDateOnly(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR");
}

function likeChangeText(change) {
  const at = change.like_count_at_event;
  const now = change.like_count_now;
  if (at == null) return "-";
  if (now == null || now === at) return `👍 ${at}`;
  const delta = now - at;
  const sign = delta > 0 ? "+" : "";
  return `👍 ${now} (${sign}${delta})`;
}

// ---- 이미지 라이트박스 (여러 장 넘겨보기) ----
let lightboxImages = [];
let lightboxIndex = 0;

function ensureLightbox() {
  let overlay = document.getElementById("lightboxOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "lightboxOverlay";
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="닫기">×</button>
    <button type="button" class="lightbox-prev" aria-label="이전">‹</button>
    <img class="lightbox-image" alt="리뷰 이미지 크게 보기" />
    <button type="button" class="lightbox-next" aria-label="다음">›</button>
    <div class="lightbox-counter"></div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLightbox();
  });
  overlay.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  overlay.querySelector(".lightbox-prev").addEventListener("click", () => stepLightbox(-1));
  overlay.querySelector(".lightbox-next").addEventListener("click", () => stepLightbox(1));
  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  return overlay;
}

function renderLightbox() {
  const overlay = document.getElementById("lightboxOverlay");
  overlay.querySelector(".lightbox-image").src = lightboxImages[lightboxIndex];
  const hasMultiple = lightboxImages.length > 1;
  overlay.querySelector(".lightbox-prev").style.display = hasMultiple ? "" : "none";
  overlay.querySelector(".lightbox-next").style.display = hasMultiple ? "" : "none";
  overlay.querySelector(".lightbox-counter").textContent = hasMultiple
    ? `${lightboxIndex + 1} / ${lightboxImages.length}`
    : "";
}

function stepLightbox(delta) {
  lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
}

function openLightbox(images, startIndex) {
  const imgs = (images || []).filter(Boolean);
  if (imgs.length === 0) return;
  lightboxImages = imgs;
  lightboxIndex = startIndex || 0;
  ensureLightbox();
  renderLightbox();
  document.getElementById("lightboxOverlay").classList.add("open");
}

function closeLightbox() {
  const overlay = document.getElementById("lightboxOverlay");
  if (overlay) overlay.classList.remove("open");
}
