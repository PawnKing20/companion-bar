const MODULE_ID = "companion-bar";
const { ApplicationV2, DialogV2 } = foundry.applications.api;

const BASE_ACTIVITIES = [
  { id: "resting",       label: "Resting",       icon: "fa-campground",         color: "#7d6a4f" },
  { id: "sleeping",      label: "Sleeping",      icon: "fa-moon",               color: "#5d5470" },
  { id: "working",       label: "Working",       icon: "fa-hammer",             color: "#7a4a2b" },
  { id: "cooking",       label: "Cooking",       icon: "fa-utensils",           color: "#a0582f" },
  { id: "reading",       label: "Reading",       icon: "fa-book-open",          color: "#6e4a3a" },
  { id: "brooding",      label: "Brooding",      icon: "fa-cloud-rain",         color: "#55505e" },
  { id: "keeping-watch", label: "Keeping Watch", icon: "fa-eye",                color: "#5e5a3e" },
  { id: "training",      label: "Training",      icon: "fa-shield-halved",      color: "#8a3a32" },
  { id: "tinkering",     label: "Tinkering",     icon: "fa-screwdriver-wrench", color: "#6b5a3b" },
  { id: "painting",      label: "Painting",      icon: "fa-palette",            color: "#a35f6a" },
  { id: "gardening",     label: "Gardening",     icon: "fa-seedling",           color: "#5f6b3a" },
  { id: "praying",       label: "Praying",       icon: "fa-hands-praying",      color: "#86704a" },
  { id: "drinking",      label: "Drinking",      icon: "fa-beer-mug-empty",     color: "#9a6a2a" },
  { id: "chatting",      label: "Chatting",      icon: "fa-comments",           color: "#a8636b" },
  { id: "exploring",     label: "Exploring",     icon: "fa-compass",            color: "#4f5e5a" },
  { id: "away",          label: "Away",          icon: "fa-person-walking",     color: "#6a5a4a" }
];
const FALLBACK_COLOR = "#8a5a4a";

const THEMES = [
  { id: "rustic",   label: "Rustic",   bg: "#f1e5c9", frame: "#3a2518", trim: "#b38b52", accent: "#b0636a" },
  { id: "sunset",   label: "Sunset",   bg: "#f6e6e4", frame: "#4a1f3a", trim: "#d98f8f", accent: "#c2456b" },
  { id: "grove",    label: "Grove",    bg: "#eceedb", frame: "#2b3a22", trim: "#a8945a", accent: "#6f8f45" },
  { id: "midnight", label: "Midnight", bg: "#232838", frame: "#0f121b", trim: "#8f9bb8", accent: "#b48ad8" },
  { id: "ember",    label: "Ember",    bg: "#2c211b", frame: "#120c09", trim: "#c0763a", accent: "#e0703c" }
];
const APPEARANCE_DEFAULTS = { theme: "rustic", opacity: 1, solidOnHover: true };

let board = null;
let knownAlerts = new Set();

const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
));

const slug = s => String(s ?? "").toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

function getCompanions() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "companions")?.list ?? []);
}

function saveCompanions(list) {
  return game.settings.set(MODULE_ID, "companions", { list });
}

function updateCompanion(id, changes) {
  const list = getCompanions().map(c => (c.id === id ? { ...c, ...changes } : c));
  return saveCompanions(list);
}

function iconHTML(icon) {
  return /^fa-/.test(icon) ? `<i class="fa-solid ${esc(icon)}"></i>` : esc(icon);
}

function parseCustomActivities(text) {
  return String(text ?? "")
    .split(/[,;\n]/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      let icon, label, color;
      if (line.includes("|")) {
        [icon, label, color] = line.split("|").map(s => s.trim());
      } else {
        const [first, ...rest] = line.split(/\s+/);
        if (rest.length && (/^fa-/.test(first) || /\p{Extended_Pictographic}/u.test(first))) {
          icon = first;
          label = rest.join(" ");
        } else {
          label = line;
        }
      }
      label ||= icon;
      return {
        id: slug(label),
        label,
        icon: icon || "fa-feather",
        color: /^#[0-9a-f]{3,8}$/i.test(color ?? "") ? color : FALLBACK_COLOR
      };
    })
    .filter(a => a.id);
}

function getActivities() {
  const custom = parseCustomActivities(game.settings.get(MODULE_ID, "customActivities"));
  if (game.settings.get(MODULE_ID, "onlyCustom") && custom.length) return custom;
  const overridden = new Set(custom.map(a => a.id));
  return [...BASE_ACTIVITIES.filter(a => !overridden.has(a.id)), ...custom];
}

function getActivity(id, activities = getActivities()) {
  return activities.find(a => a.id === id) ?? { id, label: id || "Idle", icon: "fa-feather", color: FALLBACK_COLOR };
}

function readAppearance() {
  return {
    theme: game.settings.get(MODULE_ID, "theme"),
    opacity: game.settings.get(MODULE_ID, "opacity"),
    solidOnHover: game.settings.get(MODULE_ID, "solidOnHover")
  };
}

function applyAppearance(values = readAppearance()) {
  const el = board?.element;
  if (!el) return;
  const theme = THEMES.some(t => t.id === values.theme) ? values.theme : APPEARANCE_DEFAULTS.theme;
  for (const t of THEMES) el.classList.toggle(`cb-theme-${t.id}`, t.id === theme);
  el.style.setProperty("--cb-opacity", Math.min(Math.max(Number(values.opacity) || 1, 0.2), 1));
  el.classList.toggle("cb-solid-hover", !!values.solidOnHover);
}

function playChime() {
  const AH = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
  AH?.play({ src: "sounds/notify.wav", volume: 0.6, autoplay: true, loop: false }, false);
}

function toggleBoard() {
  if (board.rendered) board.close();
  else board.render(true);
}

function onCompanionsChanged() {
  if (!board) return;
  const list = getCompanions();
  const fresh = list.filter(c => c.alert && !knownAlerts.has(c.id));
  knownAlerts = new Set(list.filter(c => c.alert).map(c => c.id));

  if (fresh.length) {
    if (game.settings.get(MODULE_ID, "alertSound")) playChime();
    if (!game.user.isGM) {
      if (game.settings.get(MODULE_ID, "popForPlayers") && !board.rendered) board.render(true);
      for (const c of fresh) ui.notifications.info(`${c.name} wishes to speak with you.`);
    }
  }
  if (board.rendered) board.render();
}

class CompanionBoard extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "companion-bar",
    classes: ["companion-bar"],
    window: { title: "Companions", icon: "fa-solid fa-campground", resizable: true },
    position: { width: 360, height: "auto" },
    actions: {
      cycleNext: CompanionBoard.#onCycleNext,
      cyclePrev: CompanionBoard.#onCyclePrev,
      togglePicker: CompanionBoard.#onTogglePicker,
      setActivity: CompanionBoard.#onSetActivity,
      toggleAlert: CompanionBoard.#onToggleAlert,
      clearAlerts: CompanionBoard.#onClearAlerts,
      addCompanion: CompanionBoard.#onAddCompanion,
      removeCompanion: CompanionBoard.#onRemoveCompanion,
      changeImage: CompanionBoard.#onChangeImage,
      openActor: CompanionBoard.#onOpenActor,
      toggleCompact: CompanionBoard.#onToggleCompact,
      openAppearance: CompanionBoard.#onOpenAppearance
    }
  };

  picker = null;

  #focusId = null;

  async _renderHTML(_context, _options) {
    const gm = game.user.isGM;
    const list = getCompanions();
    const activities = getActivities();
    const compact = game.settings.get(MODULE_ID, "compact");
    const alerts = list.filter(c => c.alert).length;

    if (this.picker && !list.some(c => c.id === this.picker)) this.picker = null;
    const pickerFor = list.find(c => c.id === this.picker);

    const summary = list.length
      ? `${list.length} ${list.length === 1 ? "companion" : "companions"}${alerts
        ? ` <span class="cb-sep">·</span> <span class="cb-news">${alerts} ${alerts === 1 ? "wishes" : "wish"} to speak</span>`
        : ""}`
      : "";

    const empty = gm
      ? `<div class="cb-empty">The roster is empty.<br><span>Drag an Actor here, or add a companion.</span></div>`
      : `<div class="cb-empty">No companions travel with the party yet.</div>`;

    return `
      <div class="cb-root ${compact ? "cb-compact" : ""} ${gm ? "cb-gm" : ""}">
        <nav class="cb-toolbar">
          <span class="cb-summary">${summary}</span>
          ${gm ? `
            <button type="button" class="cb-btn cb-icon-btn" data-action="addCompanion" data-tooltip="Add a companion (or drag an Actor in)">
              <i class="fa-solid fa-user-plus"></i></button>
            <button type="button" class="cb-btn cb-icon-btn" data-action="clearAlerts" data-tooltip="Clear every !" ${alerts ? "" : "disabled"}>
              <i class="fa-solid fa-bell-slash"></i></button>` : ""}
          <button type="button" class="cb-btn cb-icon-btn" data-action="toggleCompact" data-tooltip="${compact ? "Full roster" : "Compact roster"}">
            <i class="fa-solid ${compact ? "fa-list" : "fa-grip"}"></i></button>
          <button type="button" class="cb-btn cb-icon-btn" data-action="openAppearance" data-tooltip="Theme &amp; opacity">
            <i class="fa-solid fa-palette"></i></button>
        </nav>
        <div class="cb-list">${list.map(c => this.#cardHTML(c, activities, gm)).join("") || empty}</div>
        ${gm && pickerFor ? this.#pickerHTML(pickerFor, activities) : ""}
      </div>`;
  }

  #cardHTML(c, activities, gm) {
    const act = getActivity(c.activity, activities);
    const initial = esc((c.name || "?").trim().charAt(0).toUpperCase());
    const portrait = c.img
      ? `<img src="${esc(c.img)}" alt="" draggable="false">`
      : `<span class="cb-initial">${initial}</span>`;
    const statusInner = `<span class="cb-status-icon">${iconHTML(act.icon)}</span><span class="cb-status-label">${esc(act.label)}</span>`;

    return `
      <article class="cb-card ${c.alert ? "is-alert" : ""} ${this.picker === c.id ? "is-picking" : ""}"
               data-id="${esc(c.id)}" data-activity="${esc(act.id)}" style="--act: ${esc(act.color)}">
        <div class="cb-portrait ${c.actorUuid ? "is-linked" : ""}" data-action="openActor"
             ${c.actorUuid ? `data-tooltip="Open sheet"` : ""}>
          ${portrait}
          <span class="cb-medallion" ${gm ? `data-action="togglePicker" ` : ""}data-tooltip="${esc(act.label)}">${iconHTML(act.icon)}</span>
          ${c.alert ? `<span class="cb-alert" ${gm ? `data-action="toggleAlert" data-tooltip="Clear !"` : `data-tooltip="Wishes to speak"`}>!</span>` : ""}
        </div>
        <div class="cb-body">
          ${gm
            ? `<input class="cb-name" type="text" value="${esc(c.name)}" spellcheck="false" aria-label="Companion name">`
            : `<span class="cb-name">${esc(c.name)}</span>`}
          <div class="cb-status">
            ${gm
              ? `<button type="button" class="cb-status-btn" data-action="togglePicker" data-tooltip="Click to choose · right-click to go back">${statusInner}</button>`
              : `<span class="cb-status-btn">${statusInner}</span>`}
            ${gm ? `
              <span class="cb-arrows">
                <button type="button" class="cb-arrow" data-action="cyclePrev" aria-label="Previous activity"><i class="fa-solid fa-angle-left"></i></button>
                <button type="button" class="cb-arrow" data-action="cycleNext" aria-label="Next activity"><i class="fa-solid fa-angle-right"></i></button>
              </span>` : ""}
          </div>
        </div>
        ${gm ? `
          <div class="cb-tools">
            <button type="button" class="cb-tool cb-tool-alert ${c.alert ? "on" : ""}" data-action="toggleAlert"
                    data-tooltip="${c.alert ? "Clear !" : "Wishes to speak"}">!</button>
            <button type="button" class="cb-tool" data-action="changeImage" data-tooltip="Change portrait">
              <i class="fa-solid fa-image"></i></button>
            <button type="button" class="cb-tool" data-action="removeCompanion" data-tooltip="Remove">
              <i class="fa-solid fa-xmark"></i></button>
          </div>` : ""}
      </article>`;
  }

  #pickerHTML(c, activities) {
    const choices = activities.map(a => `
      <button type="button" class="cb-choice ${a.id === c.activity ? "is-current" : ""}"
              data-action="setActivity" data-activity="${esc(a.id)}" style="--act: ${esc(a.color)}">
        <span class="cb-choice-icon">${iconHTML(a.icon)}</span><span>${esc(a.label)}</span>
      </button>`).join("");
    return `
      <section class="cb-picker" data-id="${esc(c.id)}">
        <header>
          <span>What is <b>${esc(c.name)}</b> doing?</span>
          <button type="button" class="cb-x" data-action="togglePicker" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="cb-picker-grid">${choices}</div>
      </section>`;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    applyAppearance();
    if (!game.user.isGM) return;
    const root = this.element.querySelector(".cb-root");

    for (const input of root.querySelectorAll("input.cb-name")) {
      const id = input.closest(".cb-card").dataset.id;
      input.addEventListener("change", () => updateCompanion(id, { name: input.value.trim() || "Companion" }));
      input.addEventListener("keydown", ev => { if (ev.key === "Enter") input.blur(); });
    }

    for (const status of root.querySelectorAll("button.cb-status-btn, .cb-medallion")) {
      status.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this.#cycle(status, -1);
      });
    }

    for (const portrait of root.querySelectorAll(".cb-portrait")) {
      portrait.draggable = true;
      portrait.addEventListener("dragstart", ev => {
        const id = portrait.closest(".cb-card").dataset.id;
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "CompanionBarEntry", id }));
      });
    }
    root.addEventListener("dragover", ev => ev.preventDefault());
    root.addEventListener("drop", ev => this.#onDrop(ev));

    if (this.#focusId) {
      const input = root.querySelector(`.cb-card[data-id="${this.#focusId}"] input.cb-name`);
      input?.focus();
      input?.select();
      this.#focusId = null;
    }
  }

  static #idFor(target) {
    return target.closest("[data-id]")?.dataset.id;
  }

  #cycle(target, step) {
    if (!game.user.isGM) return;
    const id = CompanionBoard.#idFor(target);
    const companion = getCompanions().find(c => c.id === id);
    if (!companion) return;
    const activities = getActivities();
    let i = activities.findIndex(a => a.id === companion.activity);
    i = i < 0 ? (step > 0 ? 0 : activities.length - 1) : (i + step + activities.length) % activities.length;
    return updateCompanion(id, { activity: activities[i].id });
  }

  static #onCycleNext(_event, target) { return this.#cycle(target, 1); }
  static #onCyclePrev(_event, target) { return this.#cycle(target, -1); }

  static async #onTogglePicker(_event, target) {
    const id = CompanionBoard.#idFor(target);
    this.picker = this.picker === id ? null : id;
    await this.render();
    this.element.querySelector(".cb-picker")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  static #onSetActivity(_event, target) {
    const id = CompanionBoard.#idFor(target);
    this.picker = null;
    return updateCompanion(id, { activity: target.dataset.activity });
  }

  static #onToggleAlert(event, target) {
    if (!game.user.isGM) return;
    event.stopPropagation();
    const id = CompanionBoard.#idFor(target);
    const companion = getCompanions().find(c => c.id === id);
    if (companion) return updateCompanion(id, { alert: !companion.alert });
  }

  static #onClearAlerts() {
    return saveCompanions(getCompanions().map(c => ({ ...c, alert: false })));
  }

  static #onAddCompanion() {
    const id = foundry.utils.randomID();
    this.#focusId = id;
    const list = getCompanions();
    list.push({ id, name: "New Companion", img: "", activity: getActivities()[0]?.id ?? "resting", alert: false });
    return saveCompanions(list);
  }

  static async #onRemoveCompanion(_event, target) {
    const id = CompanionBoard.#idFor(target);
    const companion = getCompanions().find(c => c.id === id);
    if (!companion) return;
    const ok = await DialogV2.confirm({
      window: { title: "Part Ways?" },
      content: `<p>Remove <b>${esc(companion.name)}</b> from the roster?</p>`
    });
    if (ok) return saveCompanions(getCompanions().filter(c => c.id !== id));
  }

  static #onChangeImage(_event, target) {
    const id = CompanionBoard.#idFor(target);
    const companion = getCompanions().find(c => c.id === id);
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    new FP({
      type: "image",
      current: companion?.img || "",
      callback: path => updateCompanion(id, { img: path })
    }).render(true);
  }

  static async #onOpenActor(_event, target) {
    const companion = getCompanions().find(c => c.id === CompanionBoard.#idFor(target));
    if (!companion?.actorUuid) return;
    const actor = await fromUuid(companion.actorUuid);
    if (actor?.testUserPermission(game.user, "LIMITED")) actor.sheet.render(true);
  }

  static async #onToggleCompact() {
    const compact = !game.settings.get(MODULE_ID, "compact");
    await game.settings.set(MODULE_ID, "compact", compact);
    this.setPosition({ width: compact ? 400 : 360, height: "auto" });
    this.render();
  }

  static #onOpenAppearance() {
    new AppearanceConfig().render(true);
  }

  async #onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
    const list = getCompanions();

    if (data?.type === "CompanionBarEntry") {
      const targetId = event.target.closest?.(".cb-card")?.dataset.id;
      const from = list.findIndex(c => c.id === data.id);
      const to = list.findIndex(c => c.id === targetId);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return saveCompanions(list);
    }

    if (data?.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor) return;
      if (list.some(c => c.actorUuid === actor.uuid)) {
        return ui.notifications.info(`${actor.name} is already on the roster.`);
      }
      list.push({
        id: foundry.utils.randomID(),
        name: actor.name,
        img: actor.img,
        actorUuid: actor.uuid,
        activity: getActivities()[0]?.id ?? "resting",
        alert: false
      });
      return saveCompanions(list);
    }
  }
}

class AppearanceConfig extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "companion-bar-appearance",
    tag: "form",
    classes: ["companion-bar-config"],
    window: { title: "Companion Bar Appearance", icon: "fa-solid fa-palette" },
    position: { width: 440, height: "auto" },
    form: { handler: AppearanceConfig.#onSubmit, closeOnSubmit: true },
    actions: { reset: AppearanceConfig.#onReset }
  };

  async _renderHTML(_context, _options) {
    const current = readAppearance();
    const pct = Math.round(current.opacity * 100);
    const cards = THEMES.map(t => `
      <label class="cb-theme-card">
        <input type="radio" name="theme" value="${t.id}" ${t.id === current.theme ? "checked" : ""}>
        <span class="cb-swatch" style="background: ${t.bg}; border-color: ${t.frame}">
          <i style="background: ${t.frame}"></i><i style="background: ${t.trim}"></i><i style="background: ${t.accent}"></i>
        </span>
        <span class="cb-theme-name">${t.label}</span>
      </label>`).join("");

    return `
      <fieldset>
        <legend>Theme</legend>
        <div class="cb-theme-grid">${cards}</div>
      </fieldset>
      <fieldset>
        <legend>Window</legend>
        <div class="form-group">
          <label for="cb-opacity">Opacity</label>
          <div class="form-fields">
            <input id="cb-opacity" type="range" name="opacity" min="20" max="100" step="5" value="${pct}">
            <output class="cb-opacity-value">${pct}%</output>
          </div>
        </div>
        <div class="form-group">
          <label for="cb-solid">Solid on hover</label>
          <div class="form-fields">
            <input id="cb-solid" type="checkbox" name="solidOnHover" ${current.solidOnHover ? "checked" : ""}>
          </div>
          <p class="hint">Show the roster at full opacity while the mouse is over it.</p>
        </div>
        <p class="hint">These settings are yours alone; each player can choose their own.</p>
      </fieldset>
      <footer class="form-footer">
        <button type="button" data-action="reset"><i class="fa-solid fa-rotate-left"></i> Defaults</button>
        <button type="submit"><i class="fa-solid fa-floppy-disk"></i> Save</button>
      </footer>`;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (board && !board.rendered) board.render(true);
    this.element.addEventListener("input", () => this.#preview());
    this.element.addEventListener("change", () => this.#preview());
  }

  #values() {
    const form = this.element;
    return {
      theme: form.querySelector("input[name=theme]:checked")?.value ?? APPEARANCE_DEFAULTS.theme,
      opacity: Number(form.querySelector("input[name=opacity]").value) / 100,
      solidOnHover: form.querySelector("input[name=solidOnHover]").checked
    };
  }

  #preview() {
    const values = this.#values();
    this.element.querySelector(".cb-opacity-value").textContent = `${Math.round(values.opacity * 100)}%`;
    applyAppearance({ ...values, solidOnHover: false });
  }

  async close(options) {
    const result = await super.close(options);
    applyAppearance();
    return result;
  }

  static #onReset() {
    const form = this.element;
    form.querySelector(`input[name=theme][value=${APPEARANCE_DEFAULTS.theme}]`).checked = true;
    form.querySelector("input[name=opacity]").value = APPEARANCE_DEFAULTS.opacity * 100;
    form.querySelector("input[name=solidOnHover]").checked = APPEARANCE_DEFAULTS.solidOnHover;
    this.#preview();
  }

  static async #onSubmit(_event, _form, _formData) {
    const values = this.#values();
    await game.settings.set(MODULE_ID, "theme", values.theme);
    await game.settings.set(MODULE_ID, "opacity", values.opacity);
    await game.settings.set(MODULE_ID, "solidOnHover", values.solidOnHover);
    applyAppearance();
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "companions", {
    scope: "world",
    config: false,
    type: Object,
    default: { list: [] },
    onChange: onCompanionsChanged
  });

  game.settings.registerMenu(MODULE_ID, "appearance", {
    name: "Appearance",
    label: "Theme & Opacity",
    hint: "Choose a theme for the roster window and how transparent it is.",
    icon: "fa-solid fa-palette",
    type: AppearanceConfig,
    restricted: false
  });

  game.settings.register(MODULE_ID, "customActivities", {
    name: "Custom activities",
    hint: "Comma-separated, icon first. Use a Font Awesome icon name or an emoji: \"fa-fish Fishing, fa-music Playing Music\". Set an icon color with pipes: \"fa-fish | Fishing | #5f6b3a\". Reusing a built-in name (like Cooking) replaces it.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => board?.rendered && board.render()
  });

  game.settings.register(MODULE_ID, "onlyCustom", {
    name: "Use only my custom activities",
    hint: "Hide the built-in list (resting, sleeping, cooking…) and show only yours.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => board?.rendered && board.render()
  });

  game.settings.register(MODULE_ID, "popForPlayers", {
    name: "Open the roster for players on \"!\"",
    hint: "When the GM raises a companion's \"!\", the roster opens on players' screens if it's closed.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "alertSound", {
    name: "Chime on \"!\"",
    hint: "Play a soft notification sound when a companion wishes to speak.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "openOnLoad", {
    name: "Open roster on load",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "compact", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "theme", {
    scope: "client",
    config: false,
    type: String,
    default: APPEARANCE_DEFAULTS.theme,
    onChange: () => applyAppearance()
  });

  game.settings.register(MODULE_ID, "opacity", {
    scope: "client",
    config: false,
    type: Number,
    default: APPEARANCE_DEFAULTS.opacity,
    onChange: () => applyAppearance()
  });

  game.settings.register(MODULE_ID, "solidOnHover", {
    scope: "client",
    config: false,
    type: Boolean,
    default: APPEARANCE_DEFAULTS.solidOnHover,
    onChange: () => applyAppearance()
  });

  game.keybindings.register(MODULE_ID, "toggleBoard", {
    name: "Toggle Companion Bar",
    editable: [],
    onDown: () => { toggleBoard(); return true; }
  });
});

Hooks.once("ready", () => {
  board = new CompanionBoard();
  knownAlerts = new Set(getCompanions().filter(c => c.alert).map(c => c.id));

  game.modules.get(MODULE_ID).api = {
    open: () => board.render(true),
    toggle: toggleBoard,
    activities: getActivities,
    themes: () => THEMES.map(t => t.id),
    setActivity: (name, activity) => {
      const c = getCompanions().find(x => x.name === name);
      return c && updateCompanion(c.id, { activity: slug(activity) });
    },
    setAlert: (name, on = true) => {
      const c = getCompanions().find(x => x.name === name);
      return c && updateCompanion(c.id, { alert: on });
    }
  };

  if (game.settings.get(MODULE_ID, "openOnLoad")) board.render(true);
});

Hooks.on("getSceneControlButtons", controls => {
  const tool = {
    name: MODULE_ID,
    title: "Companion Bar",
    icon: "fa-solid fa-campground",
    button: true,
    visible: true
  };
  if (Array.isArray(controls)) {
    controls.find(c => c.name === "token")?.tools.push({ ...tool, onClick: () => toggleBoard() });
  } else if (controls.tokens) {
    controls.tokens.tools[MODULE_ID] = {
      ...tool,
      order: Object.keys(controls.tokens.tools).length,
      onChange: () => toggleBoard()
    };
  }
});
