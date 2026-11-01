# Zen Dual Tab Views (Bottom Dock & Cursor Switcher)

A **Zen Browser Mod** (built for **Sine** and **fx-autoconfig**) designed for non-maximized window workflows where moving the cursor across the window edge to trigger the native sidebar is inconvenient or disruptive.

It adds **two independent, fully interactive tab views**:
1. **Floating Bottom Tab Dock (`Alt+Z` or bottom-edge hover)**: A compact, blurred floating pill dock at the bottom-center of the browser window.
2. **Cursor Tab View (`Alt+X`)**: Summons your tab list right where your mouse cursor already is — configurable between a **Popover Card** (scrollable vertical list with instant search) and a **Radial Ring** (pie menu around the cursor).

---

## ✨ Features

### 1. Floating Bottom Tab Dock
- **Configurable Trigger Modes**:
  - **Both (Default)**: Auto-shows when hovering the bottom-center edge AND can be pinned/unpinned anytime via `Alt+Z`.
  - **Shortcut Only**: Never pops up on mouse hover (so moving your cursor underneath an unmaximized window never triggers it); toggles strictly via `Alt+Z`.
  - **Hover Only**: Auto-shows on bottom edge hover.
- **Smooth Horizontal Scrolling**: Scroll through dozens of tabs with your mouse wheel or trackpad.
- **Separated Compact Pinned / Zen Essential Tabs**: Pinned and Essential tabs render as compact icon-only squares at the start of the dock (and in a dedicated top strip in the Cursor Popover) that smoothly expand inline on hover to reveal their title. Unloaded ("pending") pinned tabs are subtly dimmed (`45%` opacity) and excluded from the active tab counter until loaded.
- **Unified Settings Popover (`⚙`)**: Click the **`⚙`** icon in the Bottom Dock, Cursor Popover footer, or Radial Ring center hub to configure:
  - **Glass Blur (`On` / `Off`)**: Real frosted glass `backdrop-filter: blur(26px) saturate(190%)` over web content (default `On`).
  - **Layout Size (`Normal` / `Sleek` / `Micro`)**: Switch between **Normal** (`34px` rows, `320px` popover), **Sleek Compact** (`26px` rows, `256px` popover), and **Ultra-Dense Micro** (`22px` rows, `222px` popover).
  - **Color Theme (`Zen` / `Dark` / `Light`)**: Follow Zen's active workspace/theme palette & scheme (`Zen`, default), or force `Dark` or `Light`.
  - **Cursor View (`List` / `Ring`)** & **Bottom Dock Mode (`Both` / `Key` / `Hover` / `Off`)**.
- **Zero Sidebar Flash on Tab Switch**: Suppresses Zen's Compact Mode sidebar popup flash (`zen.view.compact.toolbar-flash-popup` / `gZenCompactModeManager`) when switching or opening tabs from the Bottom Dock or Cursor View, while keeping native `Ctrl+Tab` behavior intact.

### 2. Cursor Tab View (Around the Mouse Cursor)
- **Two Switchable Layouts** (toggleable directly from the popup footer or in Sine settings):
  - **Popover List (Default)**: Anchored at your cursor with edge-clamping, instant search/filter input, and full keyboard navigation (`↑`/`↓`, `Enter` to switch, `Delete`/`Backspace` to close highlighted tab, `Esc` to dismiss).
  - **Radial Ring**: Arranges tabs in a circle around your cursor for rapid flick selection (supports mouse-wheel pagination when more than 10 tabs are open).
- **Toggle or Hold-to-Peek**:
  - **Toggle Mode (Default)**: Press `Alt+X` to open; click a tab, press `Enter`, `Escape`, or click outside to close.
  - **Hold-to-Peek Mode**: Hold `Alt+X`, hover over your target tab, and release the key to switch immediately.

### 3. Complete Tab Management
- **Switch & Close**: Left-click to switch tabs; click `×` or middle-click to close any tab without dismissing the dock/popup.
- **Audio Mute Toggle**: Tabs playing audio show a clickable `🔊` / `🔇` button to mute or unmute directly from either view.
- **Zen Workspace & Split View Aware**: Displays tabs from your active Zen Workspace + Pinned/Essential tabs by default, and badges Zen Split View tabs (`◫`).
- **Drag-and-Drop Reordering**: Reorder tabs directly inside either the Bottom Dock or Cursor Popover.
- **New Tab (`+`) Button**: Quickly open a new tab from either view.

---

## 📦 Installation

### Option A: Install via Sine (Recommended)
1. Ensure you have [Sine](https://github.com/CosmoCreeper/Sine) installed in Zen Browser.
2. Open Zen **Settings** → **Sine Mods**.
3. Add this repository URL (`https://github.com/Jaheen/ZenMod_Tab`) and click **Install**.
4. Configure shortcuts and behavior anytime via the gear icon (`preferences.json`) in Sine.

### Option B: Local / fx-autoconfig Install (Windows PowerShell)
If you want to test or install locally into your Zen profile right now:
```powershell
.\install-local.ps1
```
Then restart Zen Browser (or clear startup cache in `about:support` and restart).

---

## ⚙️ Preferences (`about:config` / Sine UI)

| Preference | Default | Description |
| :--- | :--- | :--- |
| `mod.zendualtabs.bottom_mode` | `"both"` | `"both"`, `"shortcut"`, `"hover"`, or `"disabled"` |
| `mod.zendualtabs.bottom_shortcut` | `"Alt+Z"` | Shortcut to toggle the Bottom Tab Dock |
| `mod.zendualtabs.bottom_hover_height` | `"6px"` | Height of the bottom-center hover sensor strip |
| `mod.zendualtabs.cursor_layout` | `"popover"` | `"popover"` (vertical list) or `"radial"` (circle around cursor) |
| `mod.zendualtabs.cursor_shortcut` | `"Alt+X"` | Shortcut to summon the Cursor Tab View |
| `mod.zendualtabs.cursor_interaction` | `"toggle"` | `"toggle"` (press to open/close) or `"hold"` (hold key & release to switch) |
| `mod.zendualtabs.glass_blur` | `true` | Enable real Glass Blur effect (`On` / `Off`) |
| `mod.zendualtabs.density` | `"normal"` | `"normal"` (Default), `"sleek"` (Sleek Compact), or `"micro"` (Ultra-Dense Micro) |
| `mod.zendualtabs.color_theme` | `"zen"` | `"zen"` (Follow Zen Theme), `"dark"`, or `"light"` |
| `mod.zendualtabs.pinned_show_close` | `false` | Show `×` close button on Pinned/Essential tabs when expanded on hover (middle-click always closes) |
| `mod.zendualtabs.workspace_scope` | `"visible"` | `"visible"` (active workspace + pinned) or `"all"` (all workspaces) |
| `mod.zendualtabs.close_on_switch` | `false` | Auto-hide pinned Bottom Dock after switching tabs |

---