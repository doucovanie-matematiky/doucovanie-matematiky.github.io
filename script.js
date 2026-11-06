/* =========================================================
   Piatková matika — demo paywall
   ---------------------------------------------------------
   POZOR: Toto je DEMO. Platba je simulovaná a linky sú priamo
   v kóde. V ostrej verzii musí link vydávať server až po
   potvrdení platby (napr. Stripe webhook).
   ========================================================= */
(() => {
  "use strict";

  const CONFIG = {
    storageKey: "piatkova-matika-access",
    upgradePrice: 3,
    plans: {
      basic: {
        id: "basic",
        name: "Doučovanie",
        price: 7,
        invite: "https://discord.gg/YpF3u7Y2eU",
        access: { tutoring: true, notes: false, recordings: false },
      },
      full: {
        id: "full",
        name: "Komplet",
        price: 10,
        invite: "https://discord.gg/3nusJQKcmD",
        access: { tutoring: true, notes: true, recordings: true },
      },
    },
    demoCard: {
      email: "student@example.sk",
      number: "4242 4242 4242 4242",
      exp: "12/29",
      cvc: "123",
      name: "Ján Novák",
    },
  };

  /* ---------- helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmtPrice = (n) =>
    n.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u00a0€";
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const storage = {
    get() {
      try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)); } catch { return null; }
    },
    set(v) {
      try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(v)); } catch { /* ignore */ }
    },
    clear() {
      try { localStorage.removeItem(CONFIG.storageKey); } catch { /* ignore */ }
    },
  };

  /* ---------- Toast ---------- */
  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 2800);
  }

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
  $("#nextFriday").textContent = nextFridayLabel();
  $("#year").textContent = new Date().getFullYear();

  /* ---------- Nav tieň pri scrollovaní ---------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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
    mock.dataset.plan = plan;
    mockBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mockPlan === plan)));
  }
  let mockAuto = reducedMotion ? null : setInterval(() => {
    setMockPlan(mock.dataset.plan === "basic" ? "full" : "basic");
  }, 3200);
  mockBtns.forEach((b) =>
    b.addEventListener("click", () => {
      clearInterval(mockAuto);
      setMockPlan(b.dataset.mockPlan);
    })
  );

  /* =========================================================
     POKLADŇA & UPGRADE FLOW
     ========================================================= */
  const modal = $("#checkout");
  const dialog = $(".modal__dialog", modal);
  const form = $("#payForm");
  const fields = {
    email: $("#email"),
    number: $("#cardNumber"),
    exp: $("#cardExp"),
    cvc: $("#cardCvc"),
    name: $("#cardName"),
  };

  let currentPlan = "full";
  let isUpgradeMode = false;
  let currentInvite = CONFIG.plans.full.invite;
  let busy = false;
  let lastFocus = null;

  function showStep(step) {
    $$("[data-step]", modal).forEach((el) => (el.hidden = el.dataset.step !== step));
    modal.dataset.current = step;
    dialog.scrollTop = 0;
  }

  function openModal(step = "pay") {
    lastFocus = document.activeElement;
    showStep(step);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => {
      const target = step === "pay" ? fields.email : $(`[data-step="${step}"] .invite__join`, modal);
      target && target.focus({ preventScroll: true });
    }, 60);
  }

  function closeModal() {
    if (busy) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  }

  function setPlan(planId, isUpgrade = false) {
    isUpgradeMode = isUpgrade;
    currentPlan = isUpgrade ? "full" : planId;

    const upgradeBanner = $("#upgradeBanner");
    const planSwitch = $("#planSwitch");
    const sumPrevRow = $("#sumPrevRow");

    if (isUpgradeMode) {
      // Režim doplatku: balík je fixne Komplet a voľba sa nedá zmeniť
      $("#checkoutTitle").textContent = "Doplatok na Komplet";
      upgradeBanner.hidden = false;
      planSwitch.hidden = true;
      sumPrevRow.hidden = false;

      $("#sumPlan").textContent = "Balík Komplet";
      $("#sumPrice").textContent = fmtPrice(CONFIG.plans.full.price);
      $("#sumPrevPrice").textContent = `\u2212${fmtPrice(CONFIG.plans.basic.price)}`;
      $("#sumTotalLabel").textContent = "Doplatok";
      $("#sumTotal").textContent = fmtPrice(CONFIG.upgradePrice);
      $("#payLabel").textContent = `Doplatiť ${fmtPrice(CONFIG.upgradePrice)}`;
    } else {
      // Štandardná jednorazová platba za vybraný balík
      $("#checkoutTitle").textContent = "Pokladňa";
      upgradeBanner.hidden = true;
      planSwitch.hidden = false;
      sumPrevRow.hidden = true;

      const plan = CONFIG.plans[planId];
      $$('input[name="plan"]', modal).forEach((r) => (r.checked = r.value === planId));
      $("#sumPlan").textContent = `Balík ${plan.name}`;
      $("#sumPrice").textContent = fmtPrice(plan.price);
      $("#sumTotalLabel").textContent = "Spolu";
      $("#sumTotal").textContent = fmtPrice(plan.price);
      $("#payLabel").textContent = `Zaplatiť ${fmtPrice(plan.price)}`;
    }
  }

  function startUpgradeFlow() {
    const existing = storage.get();
    if (existing?.plan === "full") {
      renderSuccess(existing, false);
      openModal("success");
      return;
    }

    setPlan("full", true);
    clearErrors();
    if (existing?.email) {
      fields.email.value = existing.email;
    }
    openModal("pay");
  }

  // Kliknutia na cenník
  $$("[data-buy]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const existing = storage.get();
      const planToBuy = btn.dataset.buy;

      if (existing?.plan === "full") {
        renderSuccess(existing, false);
        openModal("success");
        return;
      }

      if (existing?.plan === "basic") {
        if (planToBuy === "basic") {
          renderSuccess(existing, false);
          openModal("success");
          return;
        }
        if (planToBuy === "full") {
          startUpgradeFlow();
          return;
        }
      }

      setPlan(planToBuy, false);
      clearErrors();
      openModal("pay");
    })
  );

  $("#navCta").addEventListener("click", (e) => {
    const existing = storage.get();
    if (existing) {
      e.preventDefault();
      renderSuccess(existing, false);
      openModal("success");
      return;
    }
    if (window.innerWidth <= 520) {
      e.preventDefault();
      setPlan("full", false);
      openModal("pay");
    }
  });

  $$('input[name="plan"]', modal).forEach((r) =>
    r.addEventListener("change", () => {
      if (!isUpgradeMode) setPlan(r.value, false);
    })
  );

  // Upgrade tlačidlá (z lístka, zoznamu prístupov alebo kdekoľvek s [data-upgrade])
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-upgrade]")) {
      e.preventDefault();
      startUpgradeFlow();
    }
  });

  // Zatváranie
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("is-open")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") trapFocus(e);
  });

  function trapFocus(e) {
    const focusables = $$(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      dialog
    ).filter((el) => el.offsetParent !== null && !el.closest("[hidden]"));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- Formátovanie vstupov ---------- */
  const brandEl = $("#cardBrand");
  fields.number.addEventListener("input", () => {
    const digits = fields.number.value.replace(/\D/g, "").slice(0, 16);
    fields.number.value = digits.replace(/(.{4})(?=.)/g, "$1 ");
    brandEl.className = "card-brand";
    if (/^4/.test(digits)) { brandEl.textContent = "VISA"; brandEl.classList.add("is-visa"); }
    else if (/^(5[1-5]|2[2-7])/.test(digits)) { brandEl.textContent = "MC"; brandEl.classList.add("is-mc"); }
    else if (digits.length >= 2) { brandEl.textContent = "KARTA"; brandEl.classList.add("is-other"); }
    else brandEl.textContent = "";
    if (digits.length === 16) fields.exp.focus();
  });

  fields.exp.addEventListener("input", (e) => {
    let d = fields.exp.value.replace(/\D/g, "").slice(0, 4);
    if (d.length === 1 && +d > 1) d = "0" + d;
    fields.exp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    if (e.inputType !== "deleteContentBackward" && d.length === 4) fields.cvc.focus();
  });

  fields.cvc.addEventListener("input", () => {
    fields.cvc.value = fields.cvc.value.replace(/\D/g, "").slice(0, 3);
    if (fields.cvc.value.length === 3) fields.name.focus();
  });

  Object.values(fields).forEach((input) =>
    input.addEventListener("input", () => input.closest(".field").classList.remove("has-error"))
  );

  $("#fillDemo").addEventListener("click", () => {
    const d = CONFIG.demoCard;
    if (!fields.email.value) fields.email.value = d.email;
    fields.number.value = d.number;
    fields.number.dispatchEvent(new Event("input"));
    fields.exp.value = d.exp;
    fields.cvc.value = d.cvc;
    fields.name.value = d.name;
    clearErrors();
    $("#payBtn").focus();
  });

  /* ---------- Validácia ---------- */
  function luhn(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = +num[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  function setError(input, msg) {
    const f = input.closest(".field");
    f.classList.remove("has-error");
    void f.offsetWidth;
    f.classList.add("has-error");
    $(".field__err", f).textContent = msg;
  }
  function clearErrors() {
    $$(".field", form).forEach((f) => f.classList.remove("has-error"));
  }

  function validate() {
    clearErrors();
    const errors = [];
    const email = fields.email.value.trim();
    const num = fields.number.value.replace(/\D/g, "");
    const exp = fields.exp.value;
    const cvc = fields.cvc.value;
    const name = fields.name.value.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push([fields.email, "Zadaj platný e-mail."]);
    if (num.length !== 16 || !luhn(num)) errors.push([fields.number, "Číslo karty nie je platné."]);

    const m = exp.match(/^(\d{2})\/(\d{2})$/);
    if (!m || +m[1] < 1 || +m[1] > 12) {
      errors.push([fields.exp, "Formát MM/RR."]);
    } else {
      const end = new Date(2000 + +m[2], +m[1], 0, 23, 59, 59);
      if (end < new Date()) errors.push([fields.exp, "Karta je expirovaná."]);
    }
    if (!/^\d{3}$/.test(cvc)) errors.push([fields.cvc, "3 číslice."]);
    if (name.length < 3) errors.push([fields.name, "Zadaj meno na karte."]);

    errors.forEach(([el, msg]) => setError(el, msg));
    if (errors.length) errors[0][0].focus();
    return errors.length === 0;
  }

  /* ---------- Simulovaná platba ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || !validate()) return;

    busy = true;
    showStep("processing");
    const txt = $("#processingText");

    const messages = isUpgradeMode
      ? ["Spájame sa s bankou…", "Overujeme jednorazový doplatok 3 €…", "Odomykáme materiály na Discorde…"]
      : ["Spájame sa s bankou…", "Overujeme jednorazovú platbu…", "Generujeme tvoju pozvánku…"];

    for (const msg of messages) {
      txt.classList.remove("is-swap");
      void txt.offsetWidth;
      txt.textContent = msg;
      txt.classList.add("is-swap");
      await wait(850);
    }

    const existing = storage.get();
    let purchase;

    if (isUpgradeMode) {
      purchase = {
        plan: "full",
        order: existing?.order ? existing.order + "-UP" : ("PM-" + Math.floor(100000 + Math.random() * 900000)),
        email: fields.email.value.trim() || existing?.email || "student@example.sk",
        paidAt: new Date().toISOString(),
        upgraded: true,
        pricePaid: CONFIG.upgradePrice,
        totalPaid: CONFIG.plans.full.price,
      };
      toast("Úspešne si doplatil 3 € a odomkol Komplet! 🎉");
    } else {
      const plan = CONFIG.plans[currentPlan];
      purchase = {
        plan: currentPlan,
        order: "PM-" + Math.floor(100000 + Math.random() * 900000),
        email: fields.email.value.trim(),
        paidAt: new Date().toISOString(),
        upgraded: false,
        pricePaid: plan.price,
        totalPaid: plan.price,
      };
      toast("Platba prebehla úspešne — vitaj na doučovaní! 🎉");
    }

    storage.set(purchase);
    isUpgradeMode = false;
    busy = false;

    renderSuccess(purchase, true);
    showStep("success");
    $(".invite__join", modal).focus({ preventScroll: true });

    updateNav();
    updatePageForUser();

    if (!reducedMotion) confetti();
    form.reset();
    brandEl.className = "card-brand";
  });

  /* ---------- Úspešná obrazovka ---------- */
  function renderSuccess(purchase, fresh) {
    const plan = CONFIG.plans[purchase.plan] || CONFIG.plans.full;

    if (purchase.upgraded) {
      $("#successTitle").textContent = fresh ? "Doplatok prebehol úspešne!" : "Tvoj prístup na doučovanie";
      $("#tPlan").textContent = "Komplet (Upgrade)";
      $("#tAmount").textContent = "10,00 € (7 € + 3 € doplatok)";
      $(".mstep__sub", modal).textContent = "Tvoj prístup bol natrvalo rozšírený. Tu je tvoja pozvánka na Discord pre Komplet:";
    } else {
      $("#successTitle").textContent = fresh ? "Platba prebehla úspešne!" : "Tvoj prístup na doučovanie";
      $("#tPlan").textContent = plan.name;
      $("#tAmount").textContent = `${fmtPrice(plan.price)} (jednorazovo)`;
      $(".mstep__sub", modal).textContent = "Vitaj na piatkovom doučovaní. Tu je tvoja pozvánka na Discord:";
    }

    $("#tOrder").textContent = "#" + purchase.order;
    $("#tAccessLabel").textContent = plan.name;
    $("#inviteLink").textContent = plan.invite.replace(/^https?:\/\//, "");
    $("#joinBtn").href = plan.invite;
    currentInvite = plan.invite;

    const items = [
      ["tutoring", "Piatkové doučovanie"],
      ["notes", "Poznámky z doučovaní"],
      ["recordings", "Záznamy z predošlých doučovaní"],
    ];

    const isBasic = purchase.plan === "basic";
    const list = $("#tAccess");
    list.innerHTML = items
      .map(([key, label]) => {
        const ok = plan.access[key];
        return `<li class="${ok ? "yes" : "no"}">
          <svg class="ico"><use href="#${ok ? "i-check" : "i-lock"}"/></svg>
          <span>${label}</span>
          ${!ok && key === "notes" ? '<button type="button" class="upsell" data-upgrade>Doplatiť 3 € na Komplet →</button>' : ""}
        </li>`;
      })
      .join("");

    // Zobrazenie / skrytie upgrade banneru v lístku
    const tUpgradeBox = $("#tUpgradeBox");
    if (tUpgradeBox) {
      tUpgradeBox.hidden = !isBasic;
    }
  }

  /* ---------- Prispôsobenie landing page podľa stavu používateľa ---------- */
  function updatePageForUser() {
    const purchase = storage.get();
    const btnBasic = $("#btnPlanBasic");
    const btnFull = $("#btnPlanFull");
    const handPlan = $("#handPlanText");

    if (!btnBasic || !btnFull) return;

    if (purchase?.plan === "full") {
      btnBasic.innerHTML = `✓ Zahrnuté v Komplete`;
      btnBasic.className = "btn btn--lg btn--block btn-plan-owned";
      btnFull.innerHTML = `✓ Tvoj balík: Komplet (otvoriť prístup)`;
      btnFull.className = "btn btn--lg btn--block btn--yellow";
      if (handPlan) handPlan.textContent = "Máš odomknuté všetky materiály! 🎉";
    } else if (purchase?.plan === "basic") {
      btnBasic.innerHTML = `✓ Tvoj balík: Doučovanie (7 €)`;
      btnBasic.className = "btn btn--lg btn--block btn-plan-owned";
      btnFull.innerHTML = `Doplatiť 3&nbsp;€ na Komplet <svg class="ico"><use href="#i-arrow"/></svg>`;
      btnFull.className = "btn btn--lg btn--block btn--yellow";
      if (handPlan) handPlan.textContent = "Doplať už len 3 € a máš aj materiály!";
    } else {
      btnBasic.innerHTML = `Vybrať za 7&nbsp;€ <svg class="ico"><use href="#i-arrow"/></svg>`;
      btnBasic.className = "btn btn--ghost btn--lg btn--block";
      btnFull.innerHTML = `Vybrať za 10&nbsp;€ <svg class="ico"><use href="#i-arrow"/></svg>`;
      btnFull.className = "btn btn--yellow btn--lg btn--block";
      if (handPlan) handPlan.textContent = "len o 3 € viac a máš aj všetky materiály!";
    }
  }

  /* ---------- Kopírovanie linku ---------- */
  $("#copyLink").addEventListener("click", async () => {
    const btn = $("#copyLink");
    const link = currentInvite;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    btn.classList.add("is-copied");
    $("span", btn).textContent = "Skopírované!";
    toast("Link na Discord je skopírovaný ✓");
    setTimeout(() => {
      btn.classList.remove("is-copied");
      $("span", btn).textContent = "Kopírovať";
    }, 2000);
  });

  /* ---------- Môj prístup (nav) ---------- */
  const navAccess = $("#navAccess");
  function updateNav() {
    navAccess.hidden = !storage.get();
  }
  navAccess.addEventListener("click", () => {
    const p = storage.get();
    if (!p) return;
    renderSuccess(p, false);
    openModal("success");
  });

  $("#resetDemo").addEventListener("click", () => {
    storage.clear();
    setPlan("full", false);
    updateNav();
    updatePageForUser();
    toast("Demo resetované — môžeš vyskúšať nákup od začiatku.");
  });

  /* ---------- Konfety ---------- */
  function confetti() {
    const box = $("#confetti");
    const colors = ["#4f46e5", "#ffd84d", "#ff6b4a", "#16a34a", "#5865f2", "#16142c"];
    const symbols = ["π", "√", "∑", "+", "=", "∞", "%"];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 110; i++) {
      const el = document.createElement("i");
      const isSym = i % 6 === 0;
      if (isSym) { el.className = "sym"; el.textContent = symbols[i % symbols.length]; }
      const s = el.style;
      s.setProperty("--l", Math.random() * 100 + "vw");
      s.setProperty("--c", colors[i % colors.length]);
      s.setProperty("--w", 6 + Math.random() * 8 + "px");
      s.setProperty("--h", 8 + Math.random() * 10 + "px");
      s.setProperty("--t", 2.2 + Math.random() * 1.8 + "s");
      s.setProperty("--dl", Math.random() * 0.5 + "s");
      s.setProperty("--dx", (Math.random() - 0.5) * 240 + "px");
      s.setProperty("--rot", (Math.random() - 0.5) * 1080 + "deg");
      frag.appendChild(el);
    }
    box.appendChild(frag);
    setTimeout(() => (box.innerHTML = ""), 4800);
  }

  // Inicializácia
  const saved = storage.get();
  setPlan(saved?.plan || "full", false);
  updateNav();
  updatePageForUser();
})();
