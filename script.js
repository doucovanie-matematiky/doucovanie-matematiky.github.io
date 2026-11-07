/* =========================================================
   πatika — informačný web
   ========================================================= */
(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Najbližší piatok ---------- */
  function nextFridayLabel() {
    const now = new Date();
    const diff = (5 - now.getDay() + 7) % 7;
    const fri = new Date(now);
    fri.setDate(now.getDate() + diff);
    const dm = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long" }).format(fri);
    if (diff === 0) return `dnes, ${dm}`;
    if (diff === 1) return `zajtra, ${dm}`;
    return `piatok ${dm}`;
  }
  const nextFridayEl = $("#nextFriday");
  if (nextFridayEl) nextFridayEl.textContent = nextFridayLabel();

  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Nav tieň pri scrollovaní ---------- */
  const nav = $("#nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Reveal animácie ---------- */
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }),
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  $$(".reveal").forEach((el) => io.observe(el));

  /* ---------- Discord mock — prepínanie balíkov ---------- */
  const mock = $("#dmock");
  const mockBtns = $$("[data-mock-plan]");
  function setMockPlan(plan) {
    if (!mock) return;
    mock.dataset.plan = plan;
    mockBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mockPlan === plan)));
  }
  let mockAuto = reducedMotion ? null : setInterval(() => {
    if (!mock) return;
    setMockPlan(mock.dataset.plan === "basic" ? "full" : "basic");
  }, 3200);
  mockBtns.forEach((b) =>
    b.addEventListener("click", () => {
      clearInterval(mockAuto);
      setMockPlan(b.dataset.mockPlan);
    })
  );

  /* ---------- Auto-copy správa pri kliknutí na DM kontakt ---------- */
  const toastEl = $("#toast");
  const toastBody = $("#toastBody");
  const toastHint = $("#toastHint");
  const toastFallback = $("#toastFallback");
  let toastTimer;

  function showToast(text, userId) {
    if (!toastEl) return;
    if (toastBody) toastBody.textContent = `„${text}“`;
    const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    if (toastHint) {
      toastHint.innerHTML = isTouch
        ? "V aplikácii Discord stačí podržať prst a zvoliť <b>Vložiť</b>."
        : "V aplikácii Discord stačí stlačiť <b>Ctrl + V</b> (Cmd + V) a odoslať.";
    }
    if (toastFallback) {
      toastFallback.href = userId ? `https://discord.com/users/${userId}` : "https://discord.com";
    }
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("is-show");
    }, 6000);
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.left = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  $$("[data-copy-msg]").forEach((el) => {
    el.addEventListener("click", () => {
      const msg = el.dataset.copyMsg;
      const userId = el.dataset.userId;
      if (msg) copyToClipboard(msg);
      if (msg) showToast(msg, userId);
    });
  });
})();
