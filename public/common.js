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
