// ==UserScript==
// @name           Zen Dual Tab Views (Bottom Dock & Cursor Switcher)
// @description    Floating Bottom Tab Dock (auto-hide/shortcut) + Cursor Tab View (Popover List & Radial Ring) for Zen Browser
// @author         Jaheen
// @version        1.3.0
// @include        main
// @onlyonce
// ==/UserScript==

(function initZenDualTabViews() {
  if (window.__zenDualTabViewsInitialized) return;
  window.__zenDualTabViewsInitialized = true;

  const PREF_PREFIX = "mod.zendualtabs.";
  const DEFAULTS = {
    glass_blur: true, // true (Glass Blur On) | false (Glass Blur Off)
    density: "normal", // "normal" | "sleek" | "micro"
    color_theme: "zen", // "zen" (Follow Zen Theme) | "dark" | "light"
    cursor_layout: "popover", // "popover" | "radial"
    cursor_shortcut: "Alt+X",
    cursor_interaction: "toggle", // "toggle" | "hold"
    bottom_mode: "both", // "both" | "shortcut" | "hover" | "disabled"
    bottom_shortcut: "Alt+Z",
    bottom_hover_height: "6px",
    pinned_show_close: false,
    workspace_scope: "visible", // "visible" | "all"
    close_on_switch: false,
  };

  const DEFAULT_FAVICON = "chrome://global/skin/icons/defaultFavicon.svg";

  class ZenDualTabController {
    constructor() {
      this.mouseX = Math.round(window.innerWidth / 2);
      this.mouseY = Math.round(window.innerHeight / 2);

      // Bottom Dock state
      this.bottomPinned = false;
      this.bottomHovered = false;
      this.bottomHideTimer = null;
      this.dockSettingsOpen = false;

      // Cursor View state
      this.cursorOpen = false;
      this.cursorAnchorX = 0;
      this.cursorAnchorY = 0;
      this.selectedIndex = 0;
      this.searchQuery = "";
      this.radialPage = 0;
      this.holdActiveKey = null;
      this.hoveredTabInHold = null;
      this.cursorSettingsOpen = false;

      // Sidebar flash suppression state
      this.suppressSidebarTimer = null;

      // Drag-and-drop state
      this.draggedTab = null;

      this.initWhenReady();
    }

    initWhenReady() {
      if (window.gBrowser && document.getElementById("mainPopupSet")) {
        this.setup();
      } else {
        window.addEventListener(
          "delayed-startup-finished",
          () => this.setup(),
          { once: true }
        );
      }
    }

    getPref(key) {
      const fullKey = PREF_PREFIX + key;
      const def = DEFAULTS[key];
      try {
        if (typeof Services !== "undefined" && Services.prefs) {
          const type = Services.prefs.getPrefType(fullKey);
          if (type === Services.prefs.PREF_BOOL) {
            return Services.prefs.getBoolPref(fullKey);
          }
          if (type === Services.prefs.PREF_STRING) {
            return Services.prefs.getStringPref(fullKey);
          }
          if (type === Services.prefs.PREF_INT) {
            return String(Services.prefs.getIntPref(fullKey));
          }
        }
      } catch (_) {}
      return def;
    }

    setStringPref(key, value) {
      try {
        if (typeof Services !== "undefined" && Services.prefs) {
          Services.prefs.setStringPref(PREF_PREFIX + key, String(value));
        }
      } catch (_) {}
    }

    setBoolPref(key, value) {
      try {
        if (typeof Services !== "undefined" && Services.prefs) {
          Services.prefs.setBoolPref(PREF_PREFIX + key, Boolean(value));
        }
      } catch (_) {}
    }

    /**
     * Ensures Firefox/Zen compositor flags for `backdrop-filter: blur(...)` are enabled
     */
    ensureBackdropFilterPrefs() {
      try {
        if (typeof Services !== "undefined" && Services.prefs) {
          Services.prefs.setBoolPref(
            "layout.css.backdrop-filter.enabled",
            true
          );
          Services.prefs.setBoolPref(
            "gfx.webrender.all",
            true
          );
        }
      } catch (_) {}
    }

    createHTML(tag, className = "", attrs = {}) {
      const el = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (className) el.className = className;
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
          el.setAttribute(k, String(v));
        }
      }
      return el;
    }

    setup() {
      this.ensureBackdropFilterPrefs();
      this.buildDOM();
      this.bindEvents();
      this.syncAppearanceAndTriggerState();
      this.renderBottomDock();
    }

    buildDOM() {
      const root =
        document.getElementById("browser") || document.documentElement;

      // 1. Bottom hover sensor strip
      this.bottomTrigger = this.createHTML("div", "", {
        id: "zdt-bottom-trigger",
      });

      // 2. Floating Bottom Tab Dock
      this.bottomDock = this.createHTML("div", "", {
        id: "zdt-bottom-dock",
      });

      // 3. Cursor Tab View Overlay
      this.cursorOverlay = this.createHTML("div", "", {
        id: "zdt-cursor-overlay",
      });

      root.appendChild(this.bottomTrigger);
      root.appendChild(this.bottomDock);
      root.appendChild(this.cursorOverlay);
    }

    bindEvents() {
      // Track live mouse coordinates across the chrome window
      window.addEventListener(
        "mousemove",
        (e) => {
          this.mouseX = e.clientX;
          this.mouseY = e.clientY;
        },
        { passive: true, capture: true }
      );

      // Bottom edge hover events
      this.bottomTrigger.addEventListener("mouseenter", () => {
        const mode = this.getPref("bottom_mode");
        if (mode === "both" || mode === "hover") {
          clearTimeout(this.bottomHideTimer);
          this.bottomHovered = true;
          this.updateBottomVisibility();
        }
      });

      this.bottomDock.addEventListener("mouseenter", () => {
        clearTimeout(this.bottomHideTimer);
        this.bottomHovered = true;
        this.updateBottomVisibility();
      });

      const scheduleBottomHide = () => {
        clearTimeout(this.bottomHideTimer);
        this.bottomHideTimer = setTimeout(() => {
          this.bottomHovered = false;
          this.dockSettingsOpen = false;
          this.updateBottomVisibility();
        }, 260);
      };

      this.bottomTrigger.addEventListener("mouseleave", scheduleBottomHide);
      this.bottomDock.addEventListener("mouseleave", scheduleBottomHide);

      // Horizontal mouse-wheel scrolling on the Bottom Dock
      this.bottomDock.addEventListener(
        "wheel",
        (e) => {
          const scroller = this.bottomDock.querySelector(".zdt-dock-scroll");
          if (scroller && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            scroller.scrollLeft += e.deltaY;
          }
        },
        { passive: false }
      );

      // Dismiss Cursor Overlay on outside click
      this.cursorOverlay.addEventListener("mousedown", (e) => {
        if (e.target === this.cursorOverlay) {
          this.closeCursorView();
        }
      });

      // Global Keyboard Shortcuts & Navigation
      window.addEventListener("keydown", (e) => this.handleKeyDown(e), true);
      window.addEventListener("keyup", (e) => this.handleKeyUp(e), true);

      // Live Tab & Workspace Event Listeners
      const tabContainer = gBrowser.tabContainer;
      const tabEvents = [
        "TabOpen",
        "TabClose",
        "TabSelect",
        "TabAttrModified",
        "TabMove",
        "TabPinned",
        "TabUnpinned",
        "ZenWorkspaceChanged",
      ];
      for (const evt of tabEvents) {
        tabContainer.addEventListener(evt, () => this.refreshViews());
      }
      window.addEventListener("ZenWorkspaceChanged", () => this.refreshViews());

      // Observe preference changes from Sine / about:config
      if (typeof Services !== "undefined" && Services.prefs) {
        Services.prefs.addObserver(PREF_PREFIX, () => {
          this.syncAppearanceAndTriggerState();
          this.refreshViews();
        });
      }
    }

    syncAppearanceAndTriggerState() {
      // 1. Glass Blur (On / Off)
      const glassOn = Boolean(this.getPref("glass_blur"));
      document.documentElement.setAttribute(
        "data-zdt-glass",
        glassOn ? "true" : "false"
      );

      // 2. Layout Density (Normal / Sleek / Micro)
      const rawDensity = this.getPref("density");
      const density = ["normal", "sleek", "micro"].includes(rawDensity)
        ? rawDensity
        : "normal";
      document.documentElement.setAttribute("data-zdt-density", density);

      // 3. Color Theme (Follow Zen Theme / Dark / Light)
      const rawTheme = this.getPref("color_theme");
      const colorTheme = ["zen", "dark", "light"].includes(rawTheme)
        ? rawTheme
        : "zen";
      document.documentElement.setAttribute("data-zdt-theme", colorTheme);

      // 4. Bottom Hover Trigger State
      const mode = this.getPref("bottom_mode");
      const hoverHeight = this.getPref("bottom_hover_height") || "6px";
      document.documentElement.style.setProperty(
        "--zdt-hover-height",
        hoverHeight
      );

      if (mode === "shortcut" || mode === "disabled") {
        this.bottomTrigger.classList.add("zdt-hidden");
        this.bottomHovered = false;
      } else {
        this.bottomTrigger.classList.remove("zdt-hidden");
      }

      if (mode === "disabled") {
        this.bottomPinned = false;
      }
      this.updateBottomVisibility();
    }

    /**
     * Builds the unified Settings Popover Menu (⚙) containing:
     * - Glass Blur: On / Off
     * - Layout Size: Normal / Sleek / Micro
     * - Color Theme: Follow Zen / Dark / Light
     * - Cursor Style: List / Ring
     * - Bottom Dock: Both / Key / Hover / Off
     */
    buildSettingsPanel(className = "zdt-settings-panel") {
      const panel = this.createHTML("div", className);
      panel.addEventListener("mousedown", (e) => e.stopPropagation());
      panel.addEventListener("click", (e) => e.stopPropagation());

      const makeSegmentedRow = (label, currentVal, options, onSelect) => {
        const row = this.createHTML("div", "zdt-setting-row");
        const lbl = this.createHTML("span", "zdt-setting-label");
        lbl.textContent = label;

        const group = this.createHTML("div", "zdt-segmented-group");
        options.forEach(({ label: optLabel, value: optVal }) => {
          const btn = this.createHTML(
            "button",
            `zdt-seg-btn ${currentVal === optVal ? "zdt-active" : ""}`
          );
          btn.textContent = optLabel;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelect(optVal);
          });
          group.appendChild(btn);
        });

        row.appendChild(lbl);
        row.appendChild(group);
        return row;
      };

      // 1. Glass Blur (On / Off)
      const glassOn = Boolean(this.getPref("glass_blur"));
      panel.appendChild(
        makeSegmentedRow(
          "Glass Blur",
          glassOn ? "on" : "off",
          [
            { label: "On", value: "on" },
            { label: "Off", value: "off" },
          ],
          (val) => {
            this.setBoolPref("glass_blur", val === "on");
            this.syncAppearanceAndTriggerState();
            this.refreshViews();
          }
        )
      );

      // 2. Layout Size (Normal / Sleek / Micro)
      const density = this.getPref("density") || "normal";
      panel.appendChild(
        makeSegmentedRow(
          "Layout Size",
          density,
          [
            { label: "Normal", value: "normal" },
            { label: "Sleek", value: "sleek" },
            { label: "Micro", value: "micro" },
          ],
          (val) => {
            this.setStringPref("density", val);
            this.syncAppearanceAndTriggerState();
            this.refreshViews();
          }
        )
      );

      // 3. Color Theme (Follow Zen / Dark / Light)
      const theme = this.getPref("color_theme") || "zen";
      panel.appendChild(
        makeSegmentedRow(
          "Color Theme",
          theme,
          [
            { label: "Zen", value: "zen" },
            { label: "Dark", value: "dark" },
            { label: "Light", value: "light" },
          ],
          (val) => {
            this.setStringPref("color_theme", val);
            this.syncAppearanceAndTriggerState();
            this.refreshViews();
          }
        )
      );

      // 4. Cursor View Style (Popover List / Radial Ring)
      const cursorLayout = this.getPref("cursor_layout") || "popover";
      panel.appendChild(
        makeSegmentedRow(
          "Cursor View",
          cursorLayout,
          [
            { label: "List", value: "popover" },
            { label: "Ring", value: "radial" },
          ],
          (val) => {
            this.setStringPref("cursor_layout", val);
            this.renderCursorView({ preserveFocus: false });
          }
        )
      );

      // 5. Bottom Dock Mode (Both / Key / Hover / Off)
      const bottomMode = this.getPref("bottom_mode") || "both";
      panel.appendChild(
        makeSegmentedRow(
          "Bottom Dock",
          bottomMode,
          [
            { label: "Both", value: "both" },
            { label: "Key", value: "shortcut" },
            { label: "Hover", value: "hover" },
            { label: "Off", value: "disabled" },
          ],
          (val) => {
            this.setStringPref("bottom_mode", val);
            this.syncAppearanceAndTriggerState();
            this.refreshViews();
          }
        )
      );

      return panel;
    }

    /**
     * Runs a tab action (switch or open) while suppressing Zen's Compact Mode
     * sidebar flash popup (`zen.view.compact.toolbar-flash-popup` / `gZenCompactModeManager`),
     * leaving native Ctrl+Tab sidebar behavior untouched.
     */
    withSidebarPopupSuppressed(actionFn) {
      const FLASH_PREF = "zen.view.compact.toolbar-flash-popup";
      let hadFlashPref = false;
      try {
        if (
          Services?.prefs?.getPrefType(FLASH_PREF) === Services.prefs.PREF_BOOL
        ) {
          hadFlashPref = Services.prefs.getBoolPref(FLASH_PREF);
          if (hadFlashPref) {
            Services.prefs.setBoolPref(FLASH_PREF, false);
          }
        }
      } catch (_) {}

      const mgr = window.gZenCompactModeManager;
      let origFlashSidebar = null;
      let origFlashToolbar = null;
      if (mgr) {
        if (typeof mgr.flashSidebarIfNecessary === "function") {
          origFlashSidebar = mgr.flashSidebarIfNecessary;
          mgr.flashSidebarIfNecessary = () => {};
        }
        if (typeof mgr._flashToolbar === "function") {
          origFlashToolbar = mgr._flashToolbar;
          mgr._flashToolbar = () => {};
        }
      }

      document.documentElement.setAttribute(
        "data-zdt-suppress-sidebar",
        "true"
      );

      try {
        actionFn();
      } finally {
        const clearSidebarFlashAttrs = () => {
          const toolbox = document.getElementById("navigator-toolbox");
          const sidebar =
            document.getElementById("zen-sidebar-box") ||
            window.gZenCompactModeManager?.sidebar;
          for (const el of [toolbox, sidebar]) {
            if (el) {
              el.removeAttribute("flash-popup");
              el.removeAttribute("zen-has-hover");
              el.removeAttribute("has-popup-menu");
            }
          }
        };

        clearSidebarFlashAttrs();
        requestAnimationFrame(clearSidebarFlashAttrs);

        clearTimeout(this.suppressSidebarTimer);
        this.suppressSidebarTimer = setTimeout(() => {
          clearSidebarFlashAttrs();
          document.documentElement.removeAttribute("data-zdt-suppress-sidebar");

          if (mgr) {
            if (origFlashSidebar)
              mgr.flashSidebarIfNecessary = origFlashSidebar;
            if (origFlashToolbar) mgr._flashToolbar = origFlashToolbar;
          }
          if (hadFlashPref) {
            try {
              Services.prefs.setBoolPref(FLASH_PREF, true);
            } catch (_) {}
          }
        }, 120);
      }
    }

    matchesShortcut(event, shortcutStr) {
      if (!shortcutStr) return false;
      const parts = shortcutStr
        .split("+")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!parts.length) return false;

      const needAlt = parts.includes("alt") || parts.includes("option");
      const needCtrl = parts.includes("ctrl") || parts.includes("control");
      const needShift = parts.includes("shift");
      const needMeta =
        parts.includes("meta") ||
        parts.includes("cmd") ||
        parts.includes("win");

      if (
        event.altKey !== needAlt ||
        event.ctrlKey !== needCtrl ||
        event.shiftKey !== needShift ||
        event.metaKey !== needMeta
      ) {
        return false;
      }

      const mainKey = parts.find(
        (p) =>
          ![
            "alt",
            "option",
            "ctrl",
            "control",
            "shift",
            "meta",
            "cmd",
            "win",
          ].includes(p)
      );
      if (!mainKey) return false;

      const pressedKey = (event.key || "").toLowerCase();
      const pressedCode = (event.code || "").toLowerCase();

      if (mainKey === "space") {
        return pressedKey === " " || pressedCode === "space";
      }
      return (
        pressedKey === mainKey ||
        pressedCode === `key${mainKey}` ||
        pressedCode === mainKey
      );
    }

    handleKeyDown(e) {
      const bottomShortcut = this.getPref("bottom_shortcut");
      const cursorShortcut = this.getPref("cursor_shortcut");

      // 1. Check Bottom Dock Shortcut
      if (this.matchesShortcut(e, bottomShortcut)) {
        const mode = this.getPref("bottom_mode");
        if (mode === "both" || mode === "shortcut") {
          e.preventDefault();
          e.stopPropagation();
          this.toggleBottomDockPin();
          return;
        }
      }

      // 2. Check Cursor Tab View Shortcut
      if (this.matchesShortcut(e, cursorShortcut)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;

        const interaction = this.getPref("cursor_interaction");
        if (interaction === "hold") {
          if (!this.cursorOpen) {
            this.holdActiveKey = e.code || e.key;
            this.openCursorView();
          }
        } else {
          this.toggleCursorView();
        }
        return;
      }

      // 3. Keyboard Navigation when Cursor Tab View is open
      if (this.cursorOpen) {
        const tabs = this.getFilteredTabs();

        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.closeCursorView();
          return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          if (tabs.length > 0) {
            const delta = e.shiftKey && e.key === "Tab" ? -1 : 1;
            this.selectedIndex =
              (this.selectedIndex + delta + tabs.length) % tabs.length;
            this.renderCursorView({ preserveFocus: true });
          }
          return;
        }

        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          if (tabs.length > 0) {
            this.selectedIndex =
              (this.selectedIndex - 1 + tabs.length) % tabs.length;
            this.renderCursorView({ preserveFocus: true });
          }
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          const targetTab = tabs[this.selectedIndex];
          if (targetTab) {
            this.activateTab(targetTab);
            this.closeCursorView();
          }
          return;
        }

        const isSearchFocused =
          document.activeElement &&
          document.activeElement.classList.contains("zdt-search-input");

        if (
          e.key === "Delete" ||
          (e.key === "Backspace" && (!isSearchFocused || !this.searchQuery))
        ) {
          const targetTab = tabs[this.selectedIndex];
          if (targetTab) {
            e.preventDefault();
            e.stopPropagation();
            this.closeTab(targetTab);
          }
          return;
        }
      }
    }

    handleKeyUp(e) {
      if (!this.cursorOpen) return;
      const interaction = this.getPref("cursor_interaction");
      if (interaction !== "hold") return;

      const cursorShortcut = (
        this.getPref("cursor_shortcut") || ""
      ).toLowerCase();
      const releasedKey = (e.key || "").toLowerCase();
      const releasedCode = (e.code || "").toLowerCase();

      if (
        releasedCode === (this.holdActiveKey || "").toLowerCase() ||
        cursorShortcut.includes(releasedKey) ||
        ["alt", "control", "meta"].includes(releasedKey)
      ) {
        const tabs = this.getFilteredTabs();
        const target = this.hoveredTabInHold || tabs[this.selectedIndex];
        if (target && target !== gBrowser.selectedTab) {
          this.activateTab(target);
        }
        this.holdActiveKey = null;
        this.hoveredTabInHold = null;
        this.closeCursorView();
      }
    }

    getTabs() {
      if (!window.gBrowser) return [];
      const scope = this.getPref("workspace_scope");
      const allTabs = Array.from(gBrowser.tabs || []);

      if (scope === "all") {
        return allTabs.filter((t) => !t.closing);
      }

      const visible = Array.from(gBrowser.visibleTabs || allTabs);
      return visible.filter((t) => !t.closing);
    }

    getFilteredTabs() {
      const tabs = this.getTabs();
      const q = (this.searchQuery || "").trim().toLowerCase();
      if (!q) return tabs;

      return tabs.filter((tab) => {
        const title = (
          tab.label ||
          tab.getAttribute("label") ||
          ""
        ).toLowerCase();
        const url = (tab.linkedBrowser?.currentURI?.spec || "").toLowerCase();
        return title.includes(q) || url.includes(q);
      });
    }

    isEssentialOrPinned(tab) {
      return (
        Boolean(tab.pinned) ||
        tab.hasAttribute("zen-essential") ||
        tab.getAttribute("zen-essential") === "true"
      );
    }

    /**
     * Checks if a Pinned/Essential tab is unloaded/discarded ("pending")
     */
    isUnloadedPinnedTab(tab) {
      if (!this.isEssentialOrPinned(tab)) return false;
      if (tab === gBrowser.selectedTab) return false;
      return (
        tab.hasAttribute("pending") ||
        tab.getAttribute("pending") === "true" ||
        !tab.linkedPanel
      );
    }

    /**
     * Counts tabs while excluding unloaded/inactive ("pending") pinned tabs
     */
    getActiveTabCount(tabs) {
      return tabs.filter((tab) => !this.isUnloadedPinnedTab(tab)).length;
    }

    isSplitTab(tab) {
      return (
        tab.hasAttribute("zen-split-view") ||
        Boolean(tab.splitView) ||
        Boolean(tab.group && tab.group.hasAttribute?.("split-view-group"))
      );
    }

    isPlayingAudio(tab) {
      return (
        tab.soundPlaying ||
        tab.hasAttribute("soundplaying") ||
        tab.muted ||
        tab.hasAttribute("muted")
      );
    }

    getTabFavicon(tab) {
      return (
        tab.image ||
        tab.getAttribute("image") ||
        gBrowser.getIcon?.(tab) ||
        DEFAULT_FAVICON
      );
    }

    getTabTitle(tab) {
      return (
        tab.label ||
        tab.getAttribute("label") ||
        tab.linkedBrowser?.currentURI?.spec ||
        "New Tab"
      );
    }

    activateTab(tab) {
      if (!tab || tab.closing) return;
      this.withSidebarPopupSuppressed(() => {
        gBrowser.selectedTab = tab;
      });
      if (this.getPref("close_on_switch") && this.bottomPinned) {
        this.bottomPinned = false;
        this.updateBottomVisibility();
      }
    }

    closeTab(tab) {
      if (!tab || tab.closing) return;
      this.withSidebarPopupSuppressed(() => {
        gBrowser.removeTab(tab, { animate: true });
      });
    }

    toggleMuteTab(tab) {
      if (!tab) return;
      if (typeof tab.toggleMuteAudio === "function") {
        tab.toggleMuteAudio();
      } else if (tab.linkedBrowser) {
        if (tab.linkedBrowser.audioMuted) {
          tab.linkedBrowser.unmute();
        } else {
          tab.linkedBrowser.mute();
        }
      }
      this.refreshViews();
    }

    openNewTab() {
      this.withSidebarPopupSuppressed(() => {
        if (typeof window.BrowserCommands?.openTab === "function") {
          window.BrowserCommands.openTab();
        } else if (typeof window.BrowserOpenTab === "function") {
          window.BrowserOpenTab();
        } else {
          gBrowser.addTrustedTab("about:newtab", { inBackground: false });
        }
      });
    }

    attachDragHandlers(el, tab) {
      el.setAttribute("draggable", "true");

      el.addEventListener("dragstart", (e) => {
        this.draggedTab = tab;
        el.classList.add("zdt-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
        }
      });

      el.addEventListener("dragend", () => {
        this.draggedTab = null;
        el.classList.remove("zdt-dragging");
      });

      el.addEventListener("dragover", (e) => {
        if (!this.draggedTab || this.draggedTab === tab) return;
        e.preventDefault();
        el.classList.add("zdt-drag-over");
      });

      el.addEventListener("dragleave", () => {
        el.classList.remove("zdt-drag-over");
      });

      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("zdt-drag-over");
        if (!this.draggedTab || this.draggedTab === tab) return;

        try {
          const targetIndex = tab._tPos;
          if (
            typeof gBrowser.moveTabTo === "function" &&
            targetIndex !== undefined
          ) {
            gBrowser.moveTabTo(this.draggedTab, targetIndex);
          }
        } catch (_) {}
        this.draggedTab = null;
        this.refreshViews();
      });
    }

    createBadgesNode(tab, { isCompactPinned = false } = {}) {
      const badges = this.createHTML("span", "zdt-tab-badges");

      if (!isCompactPinned) {
        if (tab.hasAttribute("zen-essential")) {
          const b = this.createHTML("span", "zdt-badge", {
            title: "Zen Essential Tab",
          });
          b.textContent = "★";
          badges.appendChild(b);
        } else if (tab.pinned) {
          const b = this.createHTML("span", "zdt-badge", {
            title: "Pinned Tab",
          });
          b.textContent = "📌";
          badges.appendChild(b);
        }
      }

      if (this.isSplitTab(tab)) {
        const b = this.createHTML("span", "zdt-badge", {
          title: "Zen Split View Tab",
        });
        b.textContent = "◫";
        badges.appendChild(b);
      }

      if (this.isPlayingAudio(tab)) {
        const isMuted = tab.muted || tab.hasAttribute("muted");
        const audioBtn = this.createHTML(
          "span",
          "zdt-badge zdt-badge-audio",
          {
            title: isMuted ? "Unmute Tab" : "Mute Tab",
          }
        );
        audioBtn.textContent = isMuted ? "🔇" : "🔊";
        audioBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleMuteTab(tab);
        });
        badges.appendChild(audioBtn);
      }

      return badges;
    }

    /**
     * Builds a Compact Pinned Tab Pill (Icon-only by default, smooth inline expansion on hover,
     * dimmed when unloaded/pending)
     */
    createCompactPinnedPill(tab, { onClickSwitch, isSelected = false } = {}) {
      const showCloseOnPinned = Boolean(this.getPref("pinned_show_close"));
      const unloaded = this.isUnloadedPinnedTab(tab);
      const pill = this.createHTML(
        "div",
        `zdt-tab-pill zdt-tab-pinned-compact ${unloaded ? "zdt-tab-unloaded" : ""}`,
        {
          title: `${this.getTabTitle(tab)}${
            unloaded ? " (Unloaded Pinned)" : " (Pinned)"
          }`,
        }
      );

      if (tab === gBrowser.selectedTab) {
        pill.classList.add("zdt-active");
      }
      if (isSelected) {
        pill.classList.add("zdt-kb-selected");
      }

      const fav = this.createHTML("img", "zdt-tab-favicon", {
        src: this.getTabFavicon(tab),
      });
      fav.addEventListener("error", () => {
        fav.src = DEFAULT_FAVICON;
      });

      const title = this.createHTML("span", "zdt-tab-title");
      title.textContent = this.getTabTitle(tab);

      const badges = this.createBadgesNode(tab, { isCompactPinned: true });

      pill.appendChild(fav);
      pill.appendChild(title);
      pill.appendChild(badges);

      if (showCloseOnPinned) {
        const closeBtn = this.createHTML("button", "zdt-tab-close", {
          title: "Close Pinned Tab",
        });
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeTab(tab);
        });
        pill.appendChild(closeBtn);
      }

      pill.addEventListener("click", (e) => {
        if (e.button === 0) {
          onClickSwitch ? onClickSwitch(tab) : this.activateTab(tab);
        }
      });

      pill.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          this.closeTab(tab);
        }
      });

      this.attachDragHandlers(pill, tab);
      return pill;
    }

    /* ======================================================================
     * VIEW 1: BOTTOM TAB DOCK
     * ====================================================================== */

    toggleBottomDockPin() {
      this.bottomPinned = !this.bottomPinned;
      this.updateBottomVisibility();
    }

    updateBottomVisibility() {
      const mode = this.getPref("bottom_mode");
      if (mode === "disabled") {
        this.bottomDock.classList.remove("zdt-visible", "zdt-pinned");
        return;
      }

      const shouldShow =
        this.bottomPinned ||
        ((mode === "both" || mode === "hover") && this.bottomHovered);

      if (shouldShow) {
        this.renderBottomDock();
        this.bottomDock.classList.add("zdt-visible");
      } else {
        this.bottomDock.classList.remove("zdt-visible");
      }

      this.bottomDock.classList.toggle("zdt-pinned", this.bottomPinned);
    }

    renderBottomDock() {
      if (!this.bottomDock) return;
      const tabs = this.getTabs();
      this.bottomDock.replaceChildren();

      const scrollWrap = this.createHTML("div", "zdt-dock-scroll");
      const pinnedTabs = tabs.filter((t) => this.isEssentialOrPinned(t));
      const normalTabs = tabs.filter((t) => !this.isEssentialOrPinned(t));

      // 1. Render Compact Icon-Only Pinned / Essential Tabs first
      pinnedTabs.forEach((tab) => {
        const compactPill = this.createCompactPinnedPill(tab);
        scrollWrap.appendChild(compactPill);
      });

      if (pinnedTabs.length > 0 && normalTabs.length > 0) {
        scrollWrap.appendChild(this.createHTML("div", "zdt-dock-divider"));
      }

      // 2. Render Standard Workspace Tabs
      normalTabs.forEach((tab) => {
        const pill = this.createHTML("div", "zdt-tab-pill", {
          title: this.getTabTitle(tab),
        });
        if (tab === gBrowser.selectedTab) {
          pill.classList.add("zdt-active");
        }

        const fav = this.createHTML("img", "zdt-tab-favicon", {
          src: this.getTabFavicon(tab),
        });
        fav.addEventListener("error", () => {
          fav.src = DEFAULT_FAVICON;
        });

        const title = this.createHTML("span", "zdt-tab-title");
        title.textContent = this.getTabTitle(tab);

        const badges = this.createBadgesNode(tab);

        const closeBtn = this.createHTML("button", "zdt-tab-close", {
          title: "Close Tab (Middle-click or click ×)",
        });
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeTab(tab);
        });

        pill.appendChild(fav);
        pill.appendChild(title);
        pill.appendChild(badges);
        pill.appendChild(closeBtn);

        pill.addEventListener("click", (e) => {
          if (e.button === 0) {
            this.activateTab(tab);
          }
        });

        pill.addEventListener("auxclick", (e) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            this.closeTab(tab);
          }
        });

        this.attachDragHandlers(pill, tab);
        scrollWrap.appendChild(pill);
      });

      // New Tab (+) button in dock
      const newTabBtn = this.createHTML("button", "zdt-icon-btn", {
        title: "Open New Tab",
      });
      newTabBtn.textContent = "+";
      newTabBtn.addEventListener("click", () => this.openNewTab());

      // Unified Settings (⚙) button in dock
      const gearBtn = this.createHTML(
        "button",
        `zdt-icon-btn ${this.dockSettingsOpen ? "zdt-active" : ""}`,
        {
          title: "Dual Tab Views Settings",
        }
      );
      gearBtn.textContent = "⚙";
      gearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.dockSettingsOpen = !this.dockSettingsOpen;
        this.renderBottomDock();
      });

      this.bottomDock.appendChild(scrollWrap);
      this.bottomDock.appendChild(newTabBtn);
      this.bottomDock.appendChild(gearBtn);

      if (this.dockSettingsOpen) {
        const pop = this.buildSettingsPanel("zdt-dock-settings-popover");
        this.bottomDock.appendChild(pop);
      }

      requestAnimationFrame(() => {
        const activeEl = scrollWrap.querySelector(".zdt-active");
        if (activeEl) {
          activeEl.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      });
    }

    /* ======================================================================
     * VIEW 2: CURSOR TAB VIEW (POPOVER CARD & RADIAL RING)
     * ====================================================================== */

    toggleCursorView() {
      if (this.cursorOpen) {
        this.closeCursorView();
      } else {
        this.openCursorView();
      }
    }

    openCursorView() {
      this.cursorOpen = true;
      this.searchQuery = "";
      this.radialPage = 0;
      this.hoveredTabInHold = null;

      this.cursorAnchorX = this.mouseX || Math.round(window.innerWidth / 2);
      this.cursorAnchorY = this.mouseY || Math.round(window.innerHeight / 2);

      const tabs = this.getTabs();
      const activeIdx = tabs.indexOf(gBrowser.selectedTab);
      this.selectedIndex = activeIdx >= 0 ? activeIdx : 0;

      this.cursorOverlay.classList.add("zdt-visible");
      this.renderCursorView({ preserveFocus: false });
    }

    closeCursorView() {
      this.cursorOpen = false;
      this.holdActiveKey = null;
      this.hoveredTabInHold = null;
      this.cursorSettingsOpen = false;
      this.cursorOverlay.classList.remove("zdt-visible");
      this.cursorOverlay.replaceChildren();
    }

    renderCursorView({ preserveFocus = false } = {}) {
      if (!this.cursorOpen || !this.cursorOverlay) return;

      const layout = this.getPref("cursor_layout");
      if (layout === "radial") {
        this.renderCursorRadial();
      } else {
        this.renderCursorPopover({ preserveFocus });
      }
    }

    renderCursorPopover({ preserveFocus = false } = {}) {
      const tabs = this.getFilteredTabs();
      if (this.selectedIndex >= tabs.length) {
        this.selectedIndex = Math.max(0, tabs.length - 1);
      }

      const density = this.getPref("density") || "normal";

      let popover = this.cursorOverlay.querySelector(".zdt-cursor-popover");
      let searchInput = this.cursorOverlay.querySelector(".zdt-search-input");
      let pinnedStrip = this.cursorOverlay.querySelector(
        ".zdt-popover-pinned-strip"
      );
      let listContainer = this.cursorOverlay.querySelector(".zdt-popover-list");
      let settingsHolder = this.cursorOverlay.querySelector(
        ".zdt-popover-settings-holder"
      );
      let footerCount = this.cursorOverlay.querySelector(".zdt-footer-count");
      let gearBtn = this.cursorOverlay.querySelector(".zdt-popover-gear-btn");

      if (!popover || !preserveFocus) {
        this.cursorOverlay.replaceChildren();

        popover = this.createHTML("div", "zdt-cursor-popover");

        const cardW =
          density === "micro" ? 222 : density === "sleek" ? 256 : 320;
        const cardH =
          density === "micro" ? 310 : density === "sleek" ? 360 : 440;
        const margin = 10;
        const left = Math.min(
          Math.max(margin, this.cursorAnchorX - 36),
          Math.max(margin, window.innerWidth - cardW - margin)
        );
        const top = Math.min(
          Math.max(margin, this.cursorAnchorY - 20),
          Math.max(margin, window.innerHeight - cardH - margin)
        );
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;

        // Header: Search filter + New Tab button
        const header = this.createHTML("div", "zdt-popover-header");
        searchInput = this.createHTML("input", "zdt-search-input", {
          type: "text",
          placeholder: "Filter tabs…",
          value: this.searchQuery,
        });
        searchInput.addEventListener("input", (e) => {
          this.searchQuery = e.target.value || "";
          this.selectedIndex = 0;
          this.renderCursorPopover({ preserveFocus: true });
        });

        const newBtn = this.createHTML("button", "zdt-icon-btn", {
          title: "Open New Tab",
        });
        newBtn.textContent = "+";
        newBtn.addEventListener("click", () => {
          this.openNewTab();
          this.closeCursorView();
        });

        header.appendChild(searchInput);
        header.appendChild(newBtn);

        // Compact Pinned/Essential Icons Strip at the top of the Popover
        pinnedStrip = this.createHTML("div", "zdt-popover-pinned-strip");

        // Scrollable standard tab list
        listContainer = this.createHTML("div", "zdt-popover-list");

        // Expandable Settings Drawer Holder
        settingsHolder = this.createHTML("div", "zdt-popover-settings-holder");

        // Footer: Active Tab Count + Settings (⚙) Icon Button
        const footer = this.createHTML("div", "zdt-popover-footer");
        footerCount = this.createHTML("span", "zdt-footer-count", {
          title: "Active tab count (excludes unloaded pinned tabs)",
        });

        gearBtn = this.createHTML(
          "button",
          `zdt-icon-btn zdt-popover-gear-btn ${
            this.cursorSettingsOpen ? "zdt-active" : ""
          }`,
          {
            title: "Settings (Glass Blur, Layout Size, Color Theme, View Mode)",
          }
        );
        gearBtn.style.width = "22px";
        gearBtn.style.height = "22px";
        gearBtn.style.fontSize = "12px";
        gearBtn.textContent = "⚙";
        gearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.cursorSettingsOpen = !this.cursorSettingsOpen;
          gearBtn.classList.toggle("zdt-active", this.cursorSettingsOpen);
          settingsHolder.replaceChildren();
          if (this.cursorSettingsOpen) {
            settingsHolder.appendChild(
              this.buildSettingsPanel("zdt-settings-panel")
            );
          }
        });

        footer.appendChild(footerCount);
        footer.appendChild(gearBtn);

        popover.appendChild(header);
        popover.appendChild(pinnedStrip);
        popover.appendChild(listContainer);
        popover.appendChild(settingsHolder);
        popover.appendChild(footer);
        this.cursorOverlay.appendChild(popover);

        requestAnimationFrame(() => {
          searchInput?.focus();
        });
      }

      if (gearBtn) {
        gearBtn.classList.toggle("zdt-active", this.cursorSettingsOpen);
      }
      if (settingsHolder) {
        settingsHolder.replaceChildren();
        if (this.cursorSettingsOpen) {
          settingsHolder.appendChild(
            this.buildSettingsPanel("zdt-settings-panel")
          );
        }
      }

      pinnedStrip.replaceChildren();
      listContainer.replaceChildren();

      const activeCount = this.getActiveTabCount(tabs);
      footerCount.textContent = `${activeCount} tab${
        activeCount === 1 ? "" : "s"
      }`;

      const pinnedTabs = [];
      const normalTabs = [];
      tabs.forEach((tab, idx) => {
        if (this.isEssentialOrPinned(tab)) {
          pinnedTabs.push({ tab, idx });
        } else {
          normalTabs.push({ tab, idx });
        }
      });

      // 1. Populate Compact Icon-Only Pinned Strip (expands inline on hover, dimmed if unloaded)
      if (pinnedTabs.length > 0) {
        pinnedStrip.style.display = "flex";
        pinnedTabs.forEach(({ tab, idx }) => {
          const pill = this.createCompactPinnedPill(tab, {
            isSelected: idx === this.selectedIndex,
            onClickSwitch: (t) => {
              this.activateTab(t);
              this.closeCursorView();
            },
          });
          pill.addEventListener("mouseenter", () => {
            this.hoveredTabInHold = tab;
            this.selectedIndex = idx;
          });
          pinnedStrip.appendChild(pill);
        });
      } else {
        pinnedStrip.style.display = "none";
      }

      // 2. Populate Standard Vertical List
      normalTabs.forEach(({ tab, idx }) => {
        const item = this.createHTML("div", "zdt-list-item", {
          title: this.getTabTitle(tab),
        });
        if (tab === gBrowser.selectedTab) {
          item.classList.add("zdt-active");
        }
        if (idx === this.selectedIndex) {
          item.classList.add("zdt-kb-selected");
        }

        const fav = this.createHTML("img", "zdt-tab-favicon", {
          src: this.getTabFavicon(tab),
        });
        fav.addEventListener("error", () => {
          fav.src = DEFAULT_FAVICON;
        });

        const title = this.createHTML("span", "zdt-tab-title");
        title.textContent = this.getTabTitle(tab);

        const badges = this.createBadgesNode(tab);

        const closeBtn = this.createHTML("button", "zdt-tab-close", {
          title: "Close Tab",
        });
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeTab(tab);
        });

        item.appendChild(fav);
        item.appendChild(title);
        item.appendChild(badges);
        item.appendChild(closeBtn);

        item.addEventListener("mouseenter", () => {
          this.hoveredTabInHold = tab;
          this.selectedIndex = idx;
        });

        item.addEventListener("click", (e) => {
          if (e.button === 0) {
            this.activateTab(tab);
            this.closeCursorView();
          }
        });

        item.addEventListener("auxclick", (e) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            this.closeTab(tab);
          }
        });

        this.attachDragHandlers(item, tab);
        listContainer.appendChild(item);
      });

      requestAnimationFrame(() => {
        const sel =
          listContainer.querySelector(".zdt-kb-selected") ||
          pinnedStrip.querySelector(".zdt-kb-selected");
        sel?.scrollIntoView({ block: "nearest" });
      });
    }

    renderCursorRadial() {
      this.cursorOverlay.replaceChildren();

      const density = this.getPref("density") || "normal";
      const tabs = this.getFilteredTabs();
      const activeCount = this.getActiveTabCount(tabs);
      const pageSize = 10;
      const totalPages = Math.max(1, Math.ceil(tabs.length / pageSize));
      if (this.radialPage >= totalPages) {
        this.radialPage = 0;
      }

      const startIdx = this.radialPage * pageSize;
      const pageTabs = tabs.slice(startIdx, startIdx + pageSize);

      const radius =
        density === "micro" ? 82 : density === "sleek" ? 98 : 132;
      const pad = radius + 85;
      const cx = Math.min(
        Math.max(pad, this.cursorAnchorX),
        Math.max(pad, window.innerWidth - pad)
      );
      const cy = Math.min(
        Math.max(pad, this.cursorAnchorY),
        Math.max(pad, window.innerHeight - pad)
      );

      const container = this.createHTML("div", "zdt-radial-container");
      container.style.left = `${cx}px`;
      container.style.top = `${cy}px`;

      container.addEventListener(
        "wheel",
        (e) => {
          if (totalPages > 1) {
            e.preventDefault();
            this.radialPage =
              (this.radialPage + (e.deltaY > 0 ? 1 : -1) + totalPages) %
              totalPages;
            this.renderCursorRadial();
          }
        },
        { passive: false }
      );

      // Center hub with "+" and "⚙" Settings button
      const center = this.createHTML("div", "zdt-radial-center");
      const centerTitle = this.createHTML("div", "zdt-radial-center-title");
      centerTitle.textContent = this.getTabTitle(gBrowser.selectedTab);

      const centerSub = this.createHTML("div", "zdt-radial-center-sub");
      centerSub.textContent =
        totalPages > 1
          ? `${activeCount} tabs (${this.radialPage + 1}/${totalPages})`
          : `${activeCount} tab${activeCount === 1 ? "" : "s"}`;

      const actions = this.createHTML("div", "zdt-radial-Center-actions");
      const newBtn = this.createHTML("button", "zdt-mini-btn", {
        title: "Open New Tab",
      });
      newBtn.textContent = "+";
      newBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openNewTab();
        this.closeCursorView();
      });

      const gearBtn = this.createHTML(
        "button",
        `zdt-mini-btn ${this.cursorSettingsOpen ? "zdt-active" : ""}`,
        {
          title: "Settings",
        }
      );
      gearBtn.textContent = "⚙";
      gearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.cursorSettingsOpen = !this.cursorSettingsOpen;
        this.renderCursorRadial();
      });

      actions.appendChild(newBtn);
      actions.appendChild(gearBtn);

      center.appendChild(centerTitle);
      center.appendChild(centerSub);
      center.appendChild(actions);
      container.appendChild(center);

      if (this.cursorSettingsOpen) {
        const pop = this.buildSettingsPanel("zdt-radial-settings-popover");
        container.appendChild(pop);
      }

      const showCloseOnPinned = Boolean(this.getPref("pinned_show_close"));
      const count = pageTabs.length;

      pageTabs.forEach((tab, i) => {
        const globalIdx = startIdx + i;
        const isPinned = this.isEssentialOrPinned(tab);
        const unloaded = this.isUnloadedPinnedTab(tab);
        const angle = (2 * Math.PI * i) / Math.max(1, count) - Math.PI / 2;
        const x = Math.round(Math.cos(angle) * radius);
        const y = Math.round(Math.sin(angle) * radius);

        const node = this.createHTML(
          "div",
          `zdt-radial-node ${isPinned ? "zdt-radial-pinned-compact" : ""} ${
            unloaded ? "zdt-tab-unloaded" : ""
          }`,
          {
            title: isPinned
              ? `${this.getTabTitle(tab)}${
                  unloaded ? " (Unloaded Pinned)" : " (Pinned)"
                }`
              : this.getTabTitle(tab),
          }
        );
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;

        if (tab === gBrowser.selectedTab) {
          node.classList.add("zdt-active");
        }
        if (globalIdx === this.selectedIndex) {
          node.classList.add("zdt-kb-selected");
        }

        const fav = this.createHTML("img", "zdt-tab-favicon", {
          src: this.getTabFavicon(tab),
        });
        fav.addEventListener("error", () => {
          fav.src = DEFAULT_FAVICON;
        });

        const title = this.createHTML("span", "zdt-tab-title");
        title.textContent = this.getTabTitle(tab);

        node.appendChild(fav);
        node.appendChild(title);

        if (!isPinned || showCloseOnPinned) {
          const closeBtn = this.createHTML("button", "zdt-tab-close", {
            title: "Close Tab",
          });
          if (!isPinned) {
            closeBtn.style.opacity = "1";
          }
          closeBtn.textContent = "×";
          closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closeTab(tab);
          });
          node.appendChild(closeBtn);
        }

        node.addEventListener("mouseenter", () => {
          this.hoveredTabInHold = tab;
          this.selectedIndex = globalIdx;
          centerTitle.textContent = this.getTabTitle(tab);
        });

        node.addEventListener("click", (e) => {
          if (e.button === 0) {
            this.activateTab(tab);
            this.closeCursorView();
          }
        });

        node.addEventListener("auxclick", (e) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            this.closeTab(tab);
          }
        });

        container.appendChild(node);
      });

      this.cursorOverlay.appendChild(container);
    }

    refreshViews() {
      if (this.bottomDock?.classList.contains("zdt-visible")) {
        this.renderBottomDock();
      }
      if (this.cursorOpen) {
        this.renderCursorView({ preserveFocus: true });
      }
    }
  }

  new ZenDualTabController();
})();
