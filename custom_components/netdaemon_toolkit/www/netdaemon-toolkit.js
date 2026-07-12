// NetDaemon Toolkit panel — a minimal, build-free panel for managing the
// NetDaemon source files. Folder tree on the left (resizable), a CodeMirror
// editor with C# highlighting on the right, a live status badge, reload and a
// log view. CodeMirror is vendored locally (www/vendor/codemirror) so nothing
// is loaded from an external CDN. UI strings follow the HA language (en/de).

const CM_BASE = "/netdaemon_toolkit_static/vendor/codemirror";
const WIDTH_KEY = "nd-editor-left-width";

// Material Design icon paths (folder, folder-open, file-document-outline).
const ICONS = {
  folder: "M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z",
  folderOpen: "M19,20H4C2.89,20 2,19.1 2,18V6C2,4.89 2.89,4 4,4H10L12,6H19A2,2 0 0,1 21,8H21L4,8V18L6.14,10H23.21L20.93,18.5C20.7,19.37 19.92,20 19,20Z",
  file: "M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6M6,4H13V9H18V20H6V4Z",
  history: "M13.5,8H12V13L16.28,15.54L17,14.33L13.5,12.25V8M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3",
};

// UI translations. English is the default/fallback; German when HA is in German.
const I18N = {
  en: {
    btnLogs: "Logs", t_logs: "Show NetDaemon logs",
    btnReload: "↻ Reload NetDaemon", t_reload: "Restart NetDaemon and recompile the code",
    t_codegen: "Regenerate these typed entities from the live Home Assistant",
    codegenConfirm: "Regenerate the typed entities from the live Home Assistant?\n" +
      "This overwrites the generated file and takes ~20s.",
    codegenRunning: "Regenerating entities … (~20s)",
    codegenDone: "Entities regenerated: {n} lines. Reload NetDaemon to apply.",
    codegenFail: "Codegen failed: ",
    statusLoading: "NetDaemon …",
    save: "Save",
    btnNewFile: "＋ File", t_newFile: "Create a new file",
    btnNewFolder: "＋ Folder", t_newFolder: "Create a new (empty) folder",
    t_refreshList: "Reload file list",
    filter: "Filter …",
    searchFind: "Search", searchReplace: "Replace",
    t_prev: "Previous (Shift+Enter)", t_next: "Next (Enter)",
    t_replaceOne: "Replace", btnReplaceOne: "Replace",
    t_replaceAll: "Replace all", btnReplaceAll: "All",
    t_searchClose: "Close (Esc)",
    toggleShow: "Show replace", toggleHide: "Hide replace",
    logsTitle: "NetDaemon logs", refresh: "Refresh", close: "Close",
    loading: "Loading …", empty: "(empty)",
    logsUnavailable: "Logs unavailable:\n\n", errorPrefix: "Error: ",
    stActive: "NetDaemon running", stInactive: "NetDaemon not running",
    stNoStatus: "NetDaemon: no status",
    stTitleAlive: "Heartbeat {n}s ago",
    stTitleNoFile: "No heartbeat file — is the StatusApp running?",
    stTitleStale: "Last heartbeat {n}s ago (compile error or stopped?)",
    reloadConfirm: "Reload NetDaemon? The code is recompiled; automations pause briefly.",
    reloadRunning: "Reloading NetDaemon …", reloadDone: "NetDaemon reload triggered.",
    reloadFail: "Reload failed: ",
    discard: "Discard unsaved changes?",
    noFiles: "No .cs files found.", noMatches: "No matches.",
    matches: "{n} matches",
    opened: "Opened: ", saved: "Saved: ",
    openFail: "Open failed: ", saveFail: "Save failed: ", loadFail: "Load failed: ",
    fallbackNote: "Highlighting failed to load — plain text field active.",
    genTooltip: "Auto-generated — overwritten on the next codegen.",
    reservedTooltip: "Managed by NetDaemon Toolkit itself — read-only here.",
    appToggleTitle: "App enabled — click to toggle",
    t_traces: "Show decision traces", tracesTitle: "Decision traces",
    tracesEmpty: "No traces recorded yet.", traceNoSel: "Select a run on the left.",
    traceTrigger: "Trigger", traceInputs: "Inputs", traceDecision: "Decision",
    traceActual: "Actual", traceAction: "Action",
    outInSync: "in sync", outDrift: "drift", outError: "error", outWouldAct: "would act",
    outNoData: "no comparison data", outDisabled: "gated (gastherme off)",
    traceFilter: "Filter text …", traceFrom: "From", traceTo: "To",
    traceClear: "Clear filters", traceNoMatches: "No traces match the filter.",
    promptNewRoot: "New file (path relative to root):",
    promptNewIn: "New file in {dir}/ :",
    promptNewFolderRoot: "New folder (path relative to root):",
    promptNewFolderIn: "New folder in {dir}/ :",
    promptRename: "Rename / move (path):",
    confirmDeleteFile: "Delete file?\n",
    promptRenameFolder: "Rename / move folder:",
    confirmDeleteFolder: "Delete folder and all files inside?\n",
    ctxNew: "New file…", ctxNewHere: "New file here…",
    ctxNewFolder: "New folder…", ctxNewFolderHere: "New folder here…",
    ctxRename: "Rename…", ctxDelete: "Delete…",
    ctxRenameFolder: "Rename folder…", ctxDeleteFolder: "Delete folder…",
    createFail: "Create failed: ", renameFail: "Rename failed: ", deleteFail: "Delete failed: ",
    createFolderFail: "Folder create failed: ",
    renameFolderFail: "Folder rename failed: ", deleteFolderFail: "Folder delete failed: ",
  },
  de: {
    btnLogs: "Logs", t_logs: "NetDaemon-Logs anzeigen",
    btnReload: "↻ NetDaemon neu laden", t_reload: "NetDaemon neu starten und den Code neu kompilieren",
    t_codegen: "Diese typisierten Entities aus dem laufenden Home Assistant neu generieren",
    codegenConfirm: "Typisierte Entities aus dem laufenden Home Assistant neu generieren?\n" +
      "Überschreibt die generierte Datei und dauert ~20s.",
    codegenRunning: "Entities werden generiert … (~20s)",
    codegenDone: "Entities neu generiert: {n} Zeilen. Zum Übernehmen NetDaemon neu laden.",
    codegenFail: "Codegen fehlgeschlagen: ",
    statusLoading: "NetDaemon …",
    save: "Speichern",
    btnNewFile: "＋ Datei", t_newFile: "Neue Datei anlegen",
    btnNewFolder: "＋ Ordner", t_newFolder: "Neuen (leeren) Ordner anlegen",
    t_refreshList: "Dateiliste neu laden",
    filter: "Filter …",
    searchFind: "Suchen", searchReplace: "Ersetzen",
    t_prev: "Vorheriger (Shift+Enter)", t_next: "Nächster (Enter)",
    t_replaceOne: "Ersetzen", btnReplaceOne: "Ersetzen",
    t_replaceAll: "Alle ersetzen", btnReplaceAll: "Alle",
    t_searchClose: "Schließen (Esc)",
    toggleShow: "Ersetzen anzeigen", toggleHide: "Ersetzen ausblenden",
    logsTitle: "NetDaemon-Logs", refresh: "Aktualisieren", close: "Schließen",
    loading: "Lade …", empty: "(leer)",
    logsUnavailable: "Logs nicht verfügbar:\n\n", errorPrefix: "Fehler: ",
    stActive: "NetDaemon aktiv", stInactive: "NetDaemon nicht aktiv",
    stNoStatus: "NetDaemon: kein Status",
    stTitleAlive: "Heartbeat vor {n} s",
    stTitleNoFile: "Keine Heartbeat-Datei — läuft die StatusApp?",
    stTitleStale: "Letztes Lebenszeichen vor {n} s (Compile-Fehler oder gestoppt?)",
    reloadConfirm: "NetDaemon neu laden? Der Code wird neu kompiliert; die Automationen pausieren kurz.",
    reloadRunning: "NetDaemon wird neu geladen …", reloadDone: "NetDaemon-Reload ausgelöst.",
    reloadFail: "Reload fehlgeschlagen: ",
    discard: "Ungespeicherte Änderungen verwerfen?",
    noFiles: "Keine .cs-Dateien gefunden.", noMatches: "Keine Treffer.",
    matches: "{n} Treffer",
    opened: "Geöffnet: ", saved: "Gespeichert: ",
    openFail: "Öffnen fehlgeschlagen: ", saveFail: "Speichern fehlgeschlagen: ", loadFail: "Laden fehlgeschlagen: ",
    fallbackNote: "Highlighting nicht geladen — einfaches Textfeld aktiv.",
    genTooltip: "Automatisch generiert – wird beim nächsten Codegen überschrieben.",
    reservedTooltip: "Wird von NetDaemon Toolkit selbst verwaltet — hier schreibgeschützt.",
    appToggleTitle: "App aktiv — zum Umschalten klicken",
    t_traces: "Entscheidungs-Traces anzeigen", tracesTitle: "Entscheidungs-Traces",
    tracesEmpty: "Noch keine Traces aufgezeichnet.", traceNoSel: "Links einen Lauf auswählen.",
    traceTrigger: "Auslöser", traceInputs: "Eingaben", traceDecision: "Entscheidung",
    traceActual: "Tatsächlich", traceAction: "Aktion",
    outInSync: "synchron", outDrift: "Abweichung", outError: "Fehler", outWouldAct: "würde handeln",
    outNoData: "keine Vergleichsdaten", outDisabled: "gegated (Gastherme aus)",
    traceFilter: "Text filtern …", traceFrom: "Von", traceTo: "Bis",
    traceClear: "Filter zurücksetzen", traceNoMatches: "Keine Traces zum Filter gefunden.",
    promptNewRoot: "Neue Datei (Pfad relativ zur Wurzel):",
    promptNewIn: "Neue Datei in {dir}/ :",
    promptNewFolderRoot: "Neuer Ordner (Pfad relativ zur Wurzel):",
    promptNewFolderIn: "Neuer Ordner in {dir}/ :",
    promptRename: "Umbenennen / verschieben (Pfad):",
    confirmDeleteFile: "Datei löschen?\n",
    promptRenameFolder: "Ordner umbenennen / verschieben:",
    confirmDeleteFolder: "Ordner mit allen enthaltenen Dateien löschen?\n",
    ctxNew: "Neue Datei…", ctxNewHere: "Neue Datei hier…",
    ctxNewFolder: "Neuer Ordner…", ctxNewFolderHere: "Neuer Ordner hier…",
    ctxRename: "Umbenennen…", ctxDelete: "Löschen…",
    ctxRenameFolder: "Ordner umbenennen…", ctxDeleteFolder: "Ordner löschen…",
    createFail: "Anlegen fehlgeschlagen: ", renameFail: "Umbenennen fehlgeschlagen: ", deleteFail: "Löschen fehlgeschlagen: ",
    createFolderFail: "Ordner anlegen fehlgeschlagen: ",
    renameFolderFail: "Ordner umbenennen fehlgeschlagen: ", deleteFolderFail: "Ordner löschen fehlgeschlagen: ",
  },
};

function svgIcon(path, cls) {
  return `<svg class="ic ${cls || ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"></path></svg>`;
}

// Heuristic hint only (non-enforced): generated code probably shouldn't be edited.
function isGenerated(path) {
  return path.toLowerCase().includes("generated");
}

// Filename (without .cs) -> NetDaemon class slug, e.g. HeatingShadowApp ->
// heating_shadow_app. Used to match a file to its input_boolean.netdaemon_*
// toggle. Must match NetDaemon's own app-id derivation, which does not split
// before a digit (e.g. O2TvAutostartApp -> o2tv_autostart_app, not
// o2_tv_autostart_app) — see HaNetDaemon.Apps.Common.Tracer.Slug.
function fileSlug(filename) {
  return filename
    .replace(/\.cs$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

// CodeMirror overlay that highlights every (case-insensitive) occurrence.
function searchOverlay(query) {
  return {
    token(stream) {
      if (stream.match(query, true, true)) return "searching";
      while (!stream.eol()) {
        stream.next();
        if (stream.match(query, false, true)) break;
      }
      return null;
    },
  };
}

function _loadJs(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("failed to load " + src));
    document.head.appendChild(s);
  });
}

// Load CodeMirror once, shared across panel instances.
function ensureCodeMirror() {
  if (window.__ndCmPromise) return window.__ndCmPromise;
  // CSS is pulled in via @import inside the component's own <style> so it works
  // even though HA renders the panel inside a shadow root. Only the JS is global.
  window.__ndCmPromise = (async () => {
    await _loadJs(CM_BASE + "/codemirror.min.js");
    // Mode + addons, loaded after the core (order matters: searchcursor before
    // search; dialog before search/jump-to-line).
    const extras = [
      "/clike.min.js",
      "/addon/dialog/dialog.min.js",
      "/addon/search/searchcursor.min.js",
      "/addon/search/jump-to-line.min.js",
      "/addon/edit/matchbrackets.min.js",
      "/addon/edit/closebrackets.min.js",
      "/addon/selection/active-line.min.js",
    ];
    for (const f of extras) await _loadJs(CM_BASE + f);
    return window.CodeMirror;
  })();
  return window.__ndCmPromise;
}

class NetDaemonToolkitPanel extends HTMLElement {
  constructor() {
    super();
    this._files = [];
    this._folders = [];
    this._reserved = [];
    this._expanded = new Set(["apps"]); // folder paths expanded; everything but apps/ itself starts collapsed
    this._filter = "";
    this._tabs = []; // open files: {path, doc/savedGen (CM) or content/savedContent (textarea)}
    this._active = null;
    this._pendingOpen = null;
    this._loading = false;
    this._rendered = false;
    this._cm = null;
    this._ta = null;
    this._beforeUnload = (e) => {
      if (this._tabs.some((t) => this._tabDirty(t))) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._render();
      this._rendered = true;
      this._initEditor();
      this._loadFiles();
    }
    this._applyTheme();
    this._updateToggles();
  }

  set panel(panel) {
    this._panel = panel;
  }

  // ── i18n ──────────────────────────────────────────────────────────────────

  get _lang() {
    const l = (this._hass && this._hass.language) || "en";
    return l.toLowerCase().startsWith("de") ? "de" : "en";
  }

  _t(key, vars) {
    let s = (I18N[this._lang] && I18N[this._lang][key]) || I18N.en[key] || key;
    if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }

  _ws(msg) {
    return this._hass.connection.sendMessagePromise(msg);
  }

  // ── editor abstraction (CodeMirror, with a plain-textarea fallback) ──────

  async _initEditor() {
    let CM = null;
    try {
      CM = await Promise.race([
        ensureCodeMirror(),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("timeout (4s) loading CodeMirror")), 4000)
        ),
      ]);
    } catch (e) {
      console.error("[nd-editor] CodeMirror load failed:", e);
    }

    if (CM) {
      try {
        this._cm = CM(this._host, {
          value: "",
          mode: "text/x-csharp",
          lineNumbers: true,
          indentUnit: 4,
          tabSize: 4,
          lineWrapping: false,
          theme: this._theme(),
          matchBrackets: true,
          autoCloseBrackets: true,
          styleActiveLine: true,
        });
        this._curTheme = this._theme();
        this._cm.setSize("100%", "100%");
        this._cm.on("change", () => this._syncActiveDirty());
        this._cm.setOption("extraKeys", {
          "Ctrl-S": () => this._save(),
          "Cmd-S": () => this._save(),
          "Ctrl-F": () => this._openSearch(false),
          "Cmd-F": () => this._openSearch(false),
          "Ctrl-H": () => this._openSearch(true),
          "Cmd-Alt-F": () => this._openSearch(true),
          "Shift-Ctrl-F": () => this._openSearch(true),
          "Shift-Cmd-F": () => this._openSearch(true),
          "Ctrl-G": () => this._findNext(false),
          "Cmd-G": () => this._findNext(false),
          "Shift-Ctrl-G": () => this._findNext(true),
          "Shift-Cmd-G": () => this._findNext(true),
          "Esc": () => this._closeSearch(),
        });
        this._observeResize();
        this._refreshSoon();
      } catch (e) {
        console.error("[nd-editor] creating CodeMirror instance failed:", e);
        this._cm = null;
      }
    }

    if (!this._cm) {
      // Guaranteed fallback so editing always works.
      console.warn("[nd-editor] falling back to plain textarea");
      const ta = document.createElement("textarea");
      ta.className = "fallback-ta";
      ta.spellcheck = false;
      ta.addEventListener("input", () => {
        const t = this._activeTab();
        if (t) {
          t.content = this._ta.value;
          this._syncActiveDirty();
        }
      });
      this._host.appendChild(ta);
      this._ta = ta;
      this._setInfo(this._t("fallbackNote"), false);
    }

    if (this._pendingOpen != null) {
      const p = this._pendingOpen;
      this._pendingOpen = null;
      this._open(p);
    }
  }

  _activeTab() {
    return this._tabs.find((t) => t.path === this._active) || null;
  }

  _tabDirty(tab) {
    if (this._cm) return tab.doc ? !tab.doc.isClean(tab.savedGen) : false;
    return tab.content !== tab.savedContent;
  }

  _valueOf(tab) {
    return this._cm ? tab.doc.getValue() : tab.content;
  }

  _showTab(tab) {
    if (this._cm) {
      this._cm.swapDoc(tab.doc);
      this._refreshSoon();
    } else if (this._ta) {
      this._ta.value = tab.content;
      this._ta.disabled = false;
    }
  }

  _syncActiveDirty() {
    const t = this._activeTab();
    if (!t) return;
    const d = this._tabDirty(t);
    if (d !== t._lastDirty) {
      t._lastDirty = d;
      this._renderTabs();
    }
  }

  _renderTabs() {
    if (!this._tabsEl) return;
    this._tabsEl.innerHTML = "";
    for (const tab of this._tabs) {
      const dirty = this._tabDirty(tab);
      tab._lastDirty = dirty;
      const el = document.createElement("div");
      el.className = "tab" + (tab.path === this._active ? " active" : "");
      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = (dirty ? "● " : "") + tab.path.split("/").pop();
      label.title = tab.path;
      label.addEventListener("click", () => this._activate(tab.path));
      const close = document.createElement("button");
      close.className = "tab-close";
      close.textContent = "×";
      close.title = this._t("close");
      close.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._closeTab(tab.path);
      });
      el.appendChild(label);
      el.appendChild(close);
      this._tabsEl.appendChild(el);
    }
  }

  _activate(path) {
    const tab = this._tabs.find((t) => t.path === path);
    if (!tab) return;
    this._active = path;
    this._showTab(tab);
    const reserved = this._isReserved(path);
    if (this._cm) this._cm.setOption("readOnly", reserved);
    else if (this._ta) this._ta.disabled = reserved;
    this._saveBtn.disabled = reserved;
    if (reserved) this._setInfo(this._t("reservedTooltip"));
    this._renderTabs();
    this._renderTree();
  }

  _closeTab(path) {
    const idx = this._tabs.findIndex((t) => t.path === path);
    if (idx < 0) return;
    if (this._tabDirty(this._tabs[idx]) && !confirm(this._t("discard"))) return;
    this._tabs.splice(idx, 1);
    if (this._active === path) {
      const next = this._tabs[idx] || this._tabs[idx - 1];
      if (next) this._activate(next.path);
      else this._emptyEditor();
    }
    this._renderTabs();
    this._renderTree();
  }

  _emptyEditor() {
    this._active = null;
    if (this._cm) this._cm.swapDoc(window.CodeMirror.Doc("", "text/x-csharp"));
    else if (this._ta) {
      this._ta.value = "";
      this._ta.disabled = true;
    }
    this._saveBtn.disabled = true;
    this._setInfo("");
  }

  _theme() {
    return this._hass && this._hass.themes && this._hass.themes.darkMode
      ? "material-darker"
      : "default";
  }

  _applyTheme() {
    if (!this._cm) return;
    const t = this._theme();
    if (t !== this._curTheme) {
      this._cm.setOption("theme", t);
      this._curTheme = t;
    }
  }

  // CodeMirror measures its container on creation; if that happens while the
  // panel has no height yet it renders blank until refreshed.
  _refreshSoon() {
    if (!this._cm) return;
    requestAnimationFrame(() => {
      if (this._cm) this._cm.refresh();
      setTimeout(() => this._cm && this._cm.refresh(), 200);
    });
  }

  _observeResize() {
    if (!window.ResizeObserver || this._ro) return;
    this._ro = new ResizeObserver(() => {
      if (this._cm) this._cm.refresh();
    });
    this._ro.observe(this._host);
  }

  connectedCallback() {
    // Give the host element a real height so the editor can fill it instead of
    // growing unbounded.
    this.style.display = "block";
    this.style.height = "100vh";
    this.style.overflow = "hidden";
    window.addEventListener("beforeunload", this._beforeUnload);
    // Re-entering the panel can attach a previously-built editor; make sure it
    // re-measures and re-observes now that it is visible again.
    if (this._cm) this._observeResize();
    this._refreshSoon();
    // Poll the NetDaemon heartbeat for the status badge.
    if (!this._statusTimer) {
      this._statusTimer = setInterval(() => this._pollStatus(), 10000);
    }
    this._pollStatus();
  }

  disconnectedCallback() {
    window.removeEventListener("beforeunload", this._beforeUnload);
    if (this._ro) {
      this._ro.disconnect();
      this._ro = null;
    }
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }
    if (this._logsTimer) {
      clearInterval(this._logsTimer);
      this._logsTimer = null;
    }
  }

  // ── data ─────────────────────────────────────────────────────────────────

  async _loadFiles() {
    try {
      const res = await this._ws({ type: "netdaemon_toolkit/list" });
      this._files = res.files || [];
      this._folders = res.folders || [];
      this._reserved = res.reserved || [];
      this._dir.textContent = res.directory || "";
      await this._loadTraceApps();
      this._renderTree();
    } catch (e) {
      this._setInfo(this._t("loadFail") + (e.message || e), true);
    }
  }

  // Which apps have decision traces -> their files get a trace button.
  async _loadTraceApps() {
    try {
      const r = await this._ws({ type: "netdaemon_toolkit/traces" });
      this._traceApps = new Set((r.apps || []).map((a) => a.app));
    } catch (e) {
      this._traceApps = new Set();
    }
  }

  async _open(path) {
    // Already open -> just switch to it.
    if (this._tabs.some((t) => t.path === path)) {
      this._activate(path);
      return;
    }
    // Editor not ready yet -> remember and open once it is.
    if (!this._cm && !this._ta) {
      this._pendingOpen = path;
      return;
    }
    try {
      const res = await this._ws({ type: "netdaemon_toolkit/read", path });
      // Re-check after the await: a rapid double-click can pass the initial
      // "already open" check twice before either tab is pushed.
      if (this._tabs.some((t) => t.path === path)) {
        this._activate(path);
        return;
      }
      const content = res.content || "";
      const tab = { path };
      if (this._cm) {
        tab.doc = window.CodeMirror.Doc(content, "text/x-csharp");
        tab.savedGen = tab.doc.changeGeneration();
      } else {
        tab.content = content;
        tab.savedContent = content;
      }
      this._tabs.push(tab);
      this._activate(path);
      this._setInfo(this._t("opened") + path);
    } catch (e) {
      this._setInfo(this._t("openFail") + (e.message || e), true);
    }
  }

  async _save() {
    const tab = this._activeTab();
    if (!tab) return;
    this._saveBtn.disabled = true;
    try {
      await this._ws({
        type: "netdaemon_toolkit/write",
        path: tab.path,
        content: this._valueOf(tab),
      });
      if (this._cm) tab.savedGen = tab.doc.changeGeneration(true);
      else tab.savedContent = tab.content;
      this._setInfo(this._t("saved") + tab.path);
      this._renderTabs();
    } catch (e) {
      this._setInfo(this._t("saveFail") + (e.message || e), true);
    }
    this._saveBtn.disabled = false;
  }

  // ── search / replace ──────────────────────────────────────────────────────

  _openSearch(replace) {
    if (!this._cm) return;
    this._searchBar.hidden = false;
    this._setReplaceVisible(!!replace);
    const sel = this._cm.getSelection();
    if (sel && !sel.includes("\n")) this._findInput.value = sel;
    this._findInput.focus();
    this._findInput.select();
    this._refreshSearch();
    if (this._findInput.value) this._findNext(false);
  }

  _setReplaceVisible(v) {
    this._replaceVisible = v;
    const d = v ? "" : "none";
    this._replInput.style.display = d;
    this.querySelector(".srch-one").style.display = d;
    this.querySelector(".srch-all").style.display = d;
    this._toggleBtn.textContent = v ? "▾" : "▸";
    this._toggleBtn.title = this._t(v ? "toggleHide" : "toggleShow");
  }

  _closeSearch() {
    if (!this._searchBar || this._searchBar.hidden) return;
    this._searchBar.hidden = true;
    this._clearOverlay();
    this._clearMark();
    if (this._cm) this._cm.focus();
  }

  _clearOverlay() {
    if (this._cm && this._searchOverlay) {
      this._cm.removeOverlay(this._searchOverlay);
      this._searchOverlay = null;
    }
  }

  _clearMark() {
    if (this._currentMark) {
      this._currentMark.clear();
      this._currentMark = null;
    }
  }

  _refreshSearch() {
    if (!this._cm) return;
    this._clearOverlay();
    this._clearMark();
    const q = this._findInput.value;
    if (q) {
      this._searchOverlay = searchOverlay(q);
      this._cm.addOverlay(this._searchOverlay);
    }
    this._updateCount();
  }

  _updateCount() {
    if (!this._cm) return;
    const q = this._findInput.value;
    if (!q) {
      this._countEl.textContent = "";
      return;
    }
    const CM = window.CodeMirror;
    let n = 0;
    const cur = this._cm.getSearchCursor(q, CM.Pos(this._cm.firstLine(), 0), { caseFold: true });
    while (cur.findNext()) n++;
    this._countEl.textContent = this._t("matches", { n });
  }

  _findNext(reverse) {
    if (!this._cm) return;
    const q = this._findInput.value;
    if (!q) return;
    const cm = this._cm;
    const CM = window.CodeMirror;
    const from = reverse ? cm.getCursor("from") : cm.getCursor("to");
    let cur = cm.getSearchCursor(q, from, { caseFold: true });
    let found = reverse ? cur.findPrevious() : cur.findNext();
    if (!found) {
      const wrap = reverse ? CM.Pos(cm.lastLine()) : CM.Pos(cm.firstLine(), 0);
      cur = cm.getSearchCursor(q, wrap, { caseFold: true });
      found = reverse ? cur.findPrevious() : cur.findNext();
    }
    if (found) {
      this._clearMark();
      cm.setSelection(cur.from(), cur.to());
      cm.scrollIntoView({ from: cur.from(), to: cur.to() }, 40);
      this._currentMark = cm.markText(cur.from(), cur.to(), { className: "nd-current-match" });
    }
  }

  _replaceOne() {
    if (!this._cm) return;
    const q = this._findInput.value;
    if (!q) return;
    const cm = this._cm;
    if (cm.getSelection().toLowerCase() === q.toLowerCase()) {
      cm.replaceSelection(this._replInput.value);
    }
    this._findNext(false);
    this._refreshSearch();
  }

  _replaceAll() {
    if (!this._cm) return;
    const q = this._findInput.value;
    if (!q) return;
    const cm = this._cm;
    const CM = window.CodeMirror;
    const repl = this._replInput.value;
    cm.operation(() => {
      const cur = cm.getSearchCursor(q, CM.Pos(cm.firstLine(), 0), { caseFold: true });
      while (cur.findNext()) cur.replace(repl);
    });
    this._refreshSearch();
  }

  // ── file tree ──────────────────────────────────────────────────────────

  // Managed by the integration itself (e.g. apps/_toolkit) — read-only here.
  _isReserved(path) {
    return (this._reserved || []).some((r) => path === r || path.startsWith(r + "/"));
  }

  _buildTree() {
    const root = { path: "", dirs: {}, files: [] };
    const walkTo = (path) => {
      const parts = path.split("/");
      let node = root;
      for (const name of parts) {
        if (!node.dirs[name]) {
          node.dirs[name] = {
            path: (node.path ? node.path + "/" : "") + name,
            dirs: {},
            files: [],
          };
        }
        node = node.dirs[name];
      }
      return node;
    };
    for (const f of this._files) {
      const parts = f.split("/");
      const dir = parts.slice(0, -1).join("/");
      const node = dir ? walkTo(dir) : root;
      node.files.push({ name: parts[parts.length - 1], path: f });
    }
    // Folders with no .cs files yet wouldn't otherwise appear at all.
    for (const d of this._folders) walkTo(d);
    return root;
  }

  _renderTree() {
    this._appToggleEntities = this._hass
      ? Object.keys(this._hass.states).filter((id) =>
          id.startsWith("input_boolean.netdaemon_")
        )
      : [];
    this._list.innerHTML = "";
    if (!this._files.length && !this._folders.length) {
      this._listNote(this._t("noFiles"));
      return;
    }
    this._renderNode(this._buildTree(), 0, this._list);
    if (this._filter && !this._list.childElementCount) {
      this._listNote(this._t("noMatches"));
    }
    this._updateToggles();
  }

  _updateToggles() {
    if (!this._list || !this._hass) return;
    for (const tg of this._list.querySelectorAll(".app-toggle")) {
      const st = this._hass.states[tg.dataset.entity];
      tg.classList.toggle("on", !!st && st.state === "on");
    }
  }

  _listNote(text) {
    const note = document.createElement("div");
    note.className = "muted";
    note.textContent = text;
    this._list.appendChild(note);
  }

  // ── file operations ────────────────────────────────────────────────────

  _showCtx(x, y, items) {
    if (!this._ctx) return;
    this._ctx.innerHTML = "";
    for (const it of items) {
      const b = document.createElement("button");
      b.className = "ctx-item";
      b.textContent = it.label;
      b.addEventListener("click", () => {
        this._hideCtx();
        it.fn();
      });
      this._ctx.appendChild(b);
    }
    this._ctx.style.left = x + "px";
    this._ctx.style.top = y + "px";
    this._ctx.hidden = false;
  }

  _hideCtx() {
    if (this._ctx) this._ctx.hidden = true;
  }

  async _promptCreate(baseDir) {
    let name = window.prompt(
      baseDir ? this._t("promptNewIn", { dir: baseDir }) : this._t("promptNewRoot"),
      ""
    );
    if (!name) return;
    name = name.trim();
    if (!name) return;
    if (!name.endsWith(".cs")) name += ".cs";
    const path = baseDir ? baseDir + "/" + name : name;
    try {
      await this._ws({ type: "netdaemon_toolkit/create", path, content: "" });
      await this._loadFiles();
      this._open(path);
    } catch (e) {
      this._setInfo(this._t("createFail") + (e.message || e), true);
    }
  }

  async _promptCreateFolder(baseDir) {
    let name = window.prompt(
      baseDir ? this._t("promptNewFolderIn", { dir: baseDir }) : this._t("promptNewFolderRoot"),
      ""
    );
    if (!name) return;
    name = name.trim();
    if (!name) return;
    const path = baseDir ? baseDir + "/" + name : name;
    try {
      await this._ws({ type: "netdaemon_toolkit/create_folder", path });
      await this._loadFiles();
    } catch (e) {
      this._setInfo(this._t("createFolderFail") + (e.message || e), true);
    }
  }

  async _promptRename(path) {
    let np = window.prompt(this._t("promptRename"), path);
    if (!np) return;
    np = np.trim();
    if (!np || np === path) return;
    if (!np.endsWith(".cs")) np += ".cs";
    try {
      await this._ws({ type: "netdaemon_toolkit/rename", path, new_path: np });
      const tab = this._tabs.find((t) => t.path === path);
      if (tab) {
        tab.path = np;
        if (this._active === path) this._active = np;
      }
      await this._loadFiles();
      this._renderTabs();
    } catch (e) {
      this._setInfo(this._t("renameFail") + (e.message || e), true);
    }
  }

  async _deleteFile(path) {
    if (!window.confirm(this._t("confirmDeleteFile") + path)) return;
    try {
      await this._ws({ type: "netdaemon_toolkit/delete", path });
      const idx = this._tabs.findIndex((t) => t.path === path);
      if (idx >= 0) {
        this._tabs.splice(idx, 1);
        if (this._active === path) {
          const next = this._tabs[idx] || this._tabs[idx - 1];
          if (next) this._activate(next.path);
          else this._emptyEditor();
        }
        this._renderTabs();
      }
      await this._loadFiles();
    } catch (e) {
      this._setInfo(this._t("deleteFail") + (e.message || e), true);
    }
  }

  async _promptRenameFolder(path) {
    let np = window.prompt(this._t("promptRenameFolder"), path);
    if (!np) return;
    np = np.trim().replace(/\/+$/, "");
    if (!np || np === path) return;
    try {
      await this._ws({ type: "netdaemon_toolkit/rename_folder", path, new_path: np });
      const prefix = path + "/";
      for (const t of this._tabs) {
        if (t.path.startsWith(prefix)) {
          const moved = np + "/" + t.path.slice(prefix.length);
          if (this._active === t.path) this._active = moved;
          t.path = moved;
        }
      }
      await this._loadFiles();
      this._renderTabs();
    } catch (e) {
      this._setInfo(this._t("renameFolderFail") + (e.message || e), true);
    }
  }

  async _deleteFolder(path) {
    if (!window.confirm(this._t("confirmDeleteFolder") + path)) return;
    try {
      await this._ws({ type: "netdaemon_toolkit/delete_folder", path });
      const prefix = path + "/";
      for (const p of this._tabs.filter((t) => t.path.startsWith(prefix)).map((t) => t.path)) {
        const idx = this._tabs.findIndex((t) => t.path === p);
        this._tabs.splice(idx, 1);
        if (this._active === p) {
          const next = this._tabs[0];
          if (next) this._activate(next.path);
          else this._emptyEditor();
        }
      }
      await this._loadFiles();
      this._renderTabs();
    } catch (e) {
      this._setInfo(this._t("deleteFolderFail") + (e.message || e), true);
    }
  }

  _fileMatches(name) {
    return !this._filter || name.toLowerCase().includes(this._filter);
  }

  _dirHasMatch(dir) {
    if (dir.files.some((f) => this._fileMatches(f.name))) return true;
    return Object.keys(dir.dirs).some((n) => this._dirHasMatch(dir.dirs[n]));
  }

  _renderNode(node, depth, container, claimed) {
    claimed = claimed || {}; // { [filePath]: { gen, toggle, trace } } already shown on the parent folder row
    const filtering = !!this._filter;
    for (const name of Object.keys(node.dirs).sort()) {
      const dir = node.dirs[name];
      if (filtering && !this._dirHasMatch(dir)) continue;
      const open = filtering ? true : this._expanded.has(dir.path);
      const gen = isGenerated(dir.path);
      const reserved = this._isReserved(dir.path);
      const head = document.createElement("button");
      head.className = "folder" + (gen ? " generated" : "") + (reserved ? " reserved" : "");
      head.style.paddingLeft = 8 + depth * 14 + "px";
      if (reserved) head.title = this._t("reservedTooltip");
      head.innerHTML =
        `<span class="chev">${open ? "▾" : "▸"}</span>` +
        svgIcon(open ? ICONS.folderOpen : ICONS.folder) +
        `<span class="lbl"></span>`;
      head.querySelector(".lbl").textContent = name;
      head.addEventListener("click", () => {
        if (this._expanded.has(dir.path)) this._expanded.delete(dir.path);
        else this._expanded.add(dir.path);
        this._renderTree();
      });
      if (!reserved) {
        head.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          this._showCtx(ev.clientX, ev.clientY, [
            { label: this._t("ctxNewHere"), fn: () => this._promptCreate(dir.path) },
            { label: this._t("ctxNewFolderHere"), fn: () => this._promptCreateFolder(dir.path) },
            { label: this._t("ctxRenameFolder"), fn: () => this._promptRenameFolder(dir.path) },
            { label: this._t("ctxDeleteFolder"), fn: () => this._deleteFolder(dir.path) },
          ]);
        });
      }
      // A folder's action buttons (regenerate / on-off toggle / trace) key
      // off whichever direct child file matches — e.g. WashingMachineApp.cs
      // inside apps/WashingMachine/ owns the toggle+trace, so the folder row
      // gets them instead of the individual file row. Lets a domain folder
      // with several files (the app + its pure-logic files) act as the one
      // place to control/inspect that app, without needing it expanded. But
      // a folder can hold SEVERAL independent apps too (e.g. apps/_toolkit/
      // has 3) — only promote a button when exactly one file in the folder
      // matches, otherwise leave it per-file so each app stays individually
      // controllable.
      const childClaimed = {};
      const genMatches = dir.files.filter((f) => isGenerated(f.path));
      if (genMatches.length === 1) {
        const f = genMatches[0];
        const rg = document.createElement("button");
        rg.className = "nd-regen";
        rg.textContent = "⟲";
        rg.title = this._t("t_codegen");
        rg.disabled = !!this._codegenBusy;
        rg.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._runCodegen();
        });
        head.appendChild(rg);
        (childClaimed[f.path] ||= {}).gen = true;
      }
      const toggleMatches = [];
      const traceMatches = [];
      for (const f of dir.files) {
        const slug = fileSlug(f.name);
        const id = (this._appToggleEntities || []).find((tid) => tid.endsWith("_" + slug));
        if (id) toggleMatches.push({ file: f, id });
        if (this._traceApps && this._traceApps.has(slug)) traceMatches.push({ file: f, slug });
      }
      if (toggleMatches.length === 1) {
        const { file: f, id: toggleId } = toggleMatches[0];
        const tg = document.createElement("span");
        tg.className = "app-toggle";
        tg.dataset.entity = toggleId;
        tg.title = this._t("appToggleTitle");
        tg.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const on =
            this._hass.states[toggleId] && this._hass.states[toggleId].state === "on";
          this._hass.callService(
            "input_boolean", on ? "turn_off" : "turn_on", { entity_id: toggleId }
          );
        });
        head.appendChild(tg);
        (childClaimed[f.path] ||= {}).toggle = true;
      }
      if (traceMatches.length === 1) {
        const { file: f, slug } = traceMatches[0];
        const tb = document.createElement("button");
        tb.className = "nd-trace";
        tb.innerHTML = svgIcon(ICONS.history);
        tb.title = this._t("t_traces");
        tb.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._openTraces(slug, f.name);
        });
        head.appendChild(tb);
        (childClaimed[f.path] ||= {}).trace = true;
      }
      container.appendChild(head);
      if (open) this._renderNode(dir, depth + 1, container, childClaimed);
    }
    for (const file of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!this._fileMatches(file.name)) continue;
      const gen = isGenerated(file.path);
      const reserved = this._isReserved(file.path);
      const claim = claimed[file.path] || {};
      const item = document.createElement("button");
      item.className =
        "file" + (file.path === this._active ? " active" : "") +
        (gen ? " generated" : "") + (reserved ? " reserved" : "");
      item.style.paddingLeft = 8 + depth * 14 + 16 + "px";
      if (reserved) item.title = this._t("reservedTooltip");
      item.innerHTML = svgIcon(ICONS.file) + `<span class="lbl"></span>`;
      item.querySelector(".lbl").textContent = file.name;
      if (gen) item.title = this._t("genTooltip");
      // Regenerate / on-off toggle / trace buttons normally live on the
      // enclosing folder row (see the dirs loop above) — except when the
      // folder couldn't claim them (tree root with no parent folder, or a
      // folder holding several independent apps, each keeping its own).
      if (gen && !claim.gen) {
        const rg = document.createElement("button");
        rg.className = "nd-regen";
        rg.textContent = "⟲";
        rg.title = this._t("t_codegen");
        rg.disabled = !!this._codegenBusy;
        rg.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._runCodegen();
        });
        item.appendChild(rg);
      }
      const slug = fileSlug(file.name);
      if (!claim.toggle) {
        const toggleId = (this._appToggleEntities || []).find((id) => id.endsWith("_" + slug));
        if (toggleId) {
          const tg = document.createElement("span");
          tg.className = "app-toggle";
          tg.dataset.entity = toggleId;
          tg.title = this._t("appToggleTitle");
          tg.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const on =
              this._hass.states[toggleId] && this._hass.states[toggleId].state === "on";
            this._hass.callService(
              "input_boolean", on ? "turn_off" : "turn_on", { entity_id: toggleId }
            );
          });
          item.appendChild(tg);
        }
      }
      if (!claim.trace && this._traceApps && this._traceApps.has(slug)) {
        const tb = document.createElement("button");
        tb.className = "nd-trace";
        tb.innerHTML = svgIcon(ICONS.history);
        tb.title = this._t("t_traces");
        tb.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._openTraces(slug, file.name);
        });
        item.appendChild(tb);
      }
      item.addEventListener("click", () => this._open(file.path));
      if (!reserved) {
        item.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          this._showCtx(ev.clientX, ev.clientY, [
            { label: this._t("ctxRename"), fn: () => this._promptRename(file.path) },
            { label: this._t("ctxDelete"), fn: () => this._deleteFile(file.path) },
          ]);
        });
      }
      container.appendChild(item);
    }
  }

  // ── status + info ────────────────────────────────────────────────────────

  _setInfo(text, isError) {
    this._info.textContent = text;
    this._info.className = "info" + (isError ? " error" : "");
  }

  async _reloadNetDaemon() {
    if (!window.confirm(this._t("reloadConfirm"))) return;
    const btn = this.querySelector(".nd-reload");
    btn.disabled = true;
    this._setInfo(this._t("reloadRunning"));
    try {
      await this._ws({ type: "netdaemon_toolkit/reload" });
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        this._pollStatus();
        if (tries >= 8) {
          clearInterval(iv);
          btn.disabled = false;
          this._setInfo(this._t("reloadDone"));
        }
      }, 2000);
    } catch (e) {
      btn.disabled = false;
      this._setInfo(this._t("reloadFail") + (e.message || e), true);
    }
  }

  async _runCodegen() {
    if (this._codegenBusy) return;
    if (!window.confirm(this._t("codegenConfirm"))) return;
    this._codegenBusy = true;
    this.querySelectorAll(".nd-regen").forEach((b) => {
      b.disabled = true;
      b.classList.add("busy");
    });
    this._setInfo(this._t("codegenRunning"));
    try {
      const r = await this._ws({ type: "netdaemon_toolkit/codegen" });
      if (r.success) {
        this._setInfo(this._t("codegenDone", { n: r.lines }));
        this._loadFiles(); // refresh tree so the regenerated file shows up
      } else {
        this._setInfo(this._t("codegenFail") + (r.reason || ""), true);
      }
    } catch (e) {
      this._setInfo(this._t("codegenFail") + (e.message || e), true);
    }
    this._codegenBusy = false;
    this.querySelectorAll(".nd-regen").forEach((b) => {
      b.disabled = false;
      b.classList.remove("busy");
    });
  }

  // ── decision traces ────────────────────────────────────────────────────

  _traceOutcome(o) {
    const M = {
      "in-sync": { c: "#3fb96a", k: "outInSync" },
      drift: { c: "#e0a030", k: "outDrift" },
      error: { c: "#ff6b6b", k: "outError" },
      "would-act": { c: "#5b9bd5", k: "outWouldAct" },
      "no-data": { c: "var(--divider-color,#888)", k: "outNoData" },
      disabled: { c: "#6b7a99", k: "outDisabled" },
    };
    return M[o] || { c: "var(--divider-color,#888)", k: null };
  }

  async _openTraces(slug, filename) {
    this._tracesSlug = slug;
    this._traceSel = -1;
    this._tracesTitleEl.textContent = this._t("tracesTitle") + " — " + filename;
    if (this._tfQ) this._tfQ.value = "";
    if (this._tfFrom) this._tfFrom.value = "";
    if (this._tfTo) this._tfTo.value = "";
    this._tracesList.innerHTML = "";
    this._tracesDetail.innerHTML = `<div class="muted">${this._t("loading")}</div>`;
    this._tracesOverlay.hidden = false;
    await this._loadTraces();
  }

  async _loadTraces() {
    const req = { type: "netdaemon_toolkit/traces", app: this._tracesSlug, tail: 500 };
    const q = (this._tfQ && this._tfQ.value || "").trim();
    if (q) req.q = q;
    const fromMs = this._tfFrom && this._tfFrom.value ? Date.parse(this._tfFrom.value) : NaN;
    const toMs = this._tfTo && this._tfTo.value ? Date.parse(this._tfTo.value) : NaN;
    if (!isNaN(fromMs)) req.since = Math.floor(fromMs / 1000);
    if (!isNaN(toMs)) req.until = Math.floor(toMs / 1000);
    const filtered = !!(q || req.since || req.until);

    try {
      const r = await this._ws(req);
      this._traces = (r.entries || []).slice().reverse(); // newest first
      this._renderTraceList();
      if (this._traces.length) this._showTrace(0);
      else
        this._tracesDetail.innerHTML =
          `<div class="muted">${this._t(filtered ? "traceNoMatches" : "tracesEmpty")}</div>`;
    } catch (e) {
      this._tracesDetail.innerHTML =
        `<div class="info error">${this._t("errorPrefix")}${this._esc(String(e.message || e))}</div>`;
    }
  }

  _renderTraceList() {
    this._tracesList.innerHTML = "";
    (this._traces || []).forEach((t, i) => {
      const oc = this._traceOutcome(t.outcome);
      const b = document.createElement("button");
      b.className = "nd-trace-item" + (i === this._traceSel ? " active" : "");
      b.style.borderLeftColor = oc.c;
      b.innerHTML =
        `<span class="tr-when"></span>` +
        (t.kind ? `<span class="tr-kind"></span>` : "") +
        `<span class="tr-sum"></span>`;
      b.querySelector(".tr-when").textContent = t.ts
        ? new Date(t.ts * 1000).toLocaleString()
        : "";
      if (t.kind) b.querySelector(".tr-kind").textContent = t.kind;
      b.querySelector(".tr-sum").textContent = t.summary || t.trigger || "";
      b.addEventListener("click", () => this._showTrace(i));
      this._tracesList.appendChild(b);
    });
  }

  _showTrace(i) {
    this._traceSel = i;
    const t = (this._traces || [])[i];
    if (!t) {
      this._tracesDetail.innerHTML = `<div class="muted">${this._t("traceNoSel")}</div>`;
      return;
    }
    const oc = this._traceOutcome(t.outcome);
    const ocLabel = oc.k ? this._t(oc.k) : t.outcome || "";
    const when = t.ts ? new Date(t.ts * 1000).toLocaleString() : "";
    const sec = (key, obj) =>
      obj == null
        ? ""
        : `<div class="tr-sec"><div class="tr-sec-h">${this._t(key)}</div>${this._kv(obj)}</div>`;
    // Any field beyond the well-known ones (apps sometimes add their own,
    // e.g. a plain array like "entities") still gets shown, generically.
    const KNOWN_TOP = new Set([
      "ts", "kind", "trigger", "outcome", "summary", "inputs", "decision", "actual", "action",
    ]);
    const extraHtml = Object.keys(t)
      .filter((k) => !KNOWN_TOP.has(k) && t[k] != null)
      .map((k) => `<div class="tr-sec"><div class="tr-sec-h">${this._esc(k)}</div>${this._anyVal(t[k])}</div>`)
      .join("");
    this._tracesDetail.innerHTML =
      `<div class="tr-head"><span class="tr-badge" style="background:${oc.c}">${this._esc(
        ocLabel
      )}</span>${t.kind ? `<span class="tr-kind">${this._esc(String(t.kind))}</span>` : ""}` +
      `<span class="tr-time">${when}</span></div>` +
      `<div class="tr-sec"><div class="tr-sec-h">${this._t("traceTrigger")}</div>` +
      `<div class="tr-val">${this._esc(String(t.trigger ?? ""))}</div></div>` +
      sec("traceInputs", t.inputs) +
      sec("traceDecision", t.decision) +
      sec("traceActual", t.actual) +
      sec("traceAction", t.action) +
      extraHtml;
    this._renderTraceList();
  }

  _esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // One-level key/value grid; nested objects/arrays printed compact.
  _kv(obj) {
    const rows = Object.keys(obj).map((k) => {
      let v = obj[k];
      if (v !== null && typeof v === "object") v = JSON.stringify(v);
      return `<div class="tr-k">${this._esc(k)}</div><div class="tr-v">${this._esc(
        String(v)
      )}</div>`;
    });
    return `<div class="tr-grid">${rows.join("")}</div>`;
  }

  // Render an arbitrary trace field: arrays as a line-per-item list, plain
  // objects as a key/value grid, everything else as plain text.
  _anyVal(v) {
    if (Array.isArray(v)) {
      return `<div class="tr-val">${v.map((x) => this._esc(String(x))).join("<br>")}</div>`;
    }
    if (typeof v === "object") return this._kv(v);
    return `<div class="tr-val">${this._esc(String(v))}</div>`;
  }

  _closeTraces() {
    this._tracesOverlay.hidden = true;
  }

  _openLogs() {
    this._logsOverlay.hidden = false;
    this._loadLogs();
    if (!this._logsTimer) this._logsTimer = setInterval(() => this._loadLogs(), 3000);
  }

  // Colour each line by NetDaemon log level; continuation lines (stack traces)
  // inherit the level of the line above.
  _renderLogs(text) {
    const esc = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let level = "";
    const html = text.replace(/\s+$/, "").split("\n").map((line) => {
      const m = line.match(/\[\d{2}:\d{2}:\d{2}\s+([A-Z]{3})\]/);
      if (m) {
        const lv = m[1];
        level = lv === "ERR" || lv === "FTL" ? "err" : lv === "WRN" ? "warn" : "";
      }
      const cls = level ? ` class="log-${level}"` : "";
      return `<span${cls}>${esc(line)}</span>`;
    }).join("\n");
    this._logsPre.innerHTML = html;
  }

  _closeLogs() {
    this._logsOverlay.hidden = true;
    if (this._logsTimer) {
      clearInterval(this._logsTimer);
      this._logsTimer = null;
    }
  }

  async _loadLogs() {
    const pre = this._logsPre;
    // Stick to the bottom only if the user is already there (live tail).
    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24;
    if (!pre.textContent.trim()) pre.textContent = this._t("loading");
    try {
      const r = await this._ws({ type: "netdaemon_toolkit/logs", tail: 300 });
      if (r.available) {
        this._renderLogs(r.logs || this._t("empty"));
        if (atBottom) pre.scrollTop = pre.scrollHeight;
      } else {
        pre.textContent = this._t("logsUnavailable") + (r.reason || "");
      }
    } catch (e) {
      pre.textContent = this._t("errorPrefix") + (e.message || e);
    }
  }

  async _pollStatus() {
    if (!this._ndRt || !this._hass) return;
    try {
      const r = await this._ws({ type: "netdaemon_toolkit/status" });
      if (r.alive) {
        this._ndRt.className = "nd-rt ok";
        this._ndRt.textContent = "● " + this._t("stActive");
        this._ndRt.title = this._t("stTitleAlive", { n: r.age });
      } else {
        this._ndRt.className = "nd-rt bad";
        this._ndRt.textContent =
          "● " + (r.ts == null ? this._t("stNoStatus") : this._t("stInactive"));
        this._ndRt.title =
          r.ts == null ? this._t("stTitleNoFile") : this._t("stTitleStale", { n: r.age });
      }
    } catch (e) {
      /* ignore transient errors */
    }
  }

  // ── resizable splitter ─────────────────────────────────────────────────

  _initSplitter() {
    const stored = parseInt(localStorage.getItem(WIDTH_KEY) || "", 10);
    if (stored > 0) this._left.style.width = stored + "px";

    let active = false;
    const onMove = (ev) => {
      if (!active) return;
      const rect = this._left.getBoundingClientRect();
      const w = Math.min(Math.max(ev.clientX - rect.left, 160), 700);
      this._left.style.width = w + "px";
      ev.preventDefault();
    };
    const onUp = () => {
      if (!active) return;
      active = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      localStorage.setItem(WIDTH_KEY, parseInt(this._left.style.width, 10) || 280);
      if (this._cm) this._cm.refresh();
    };
    this._splitter.addEventListener("pointerdown", (ev) => {
      active = true;
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      ev.preventDefault();
    });
  }

  // ── render skeleton ────────────────────────────────────────────────────

  _render() {
    const t = (k) => this._t(k);
    this.innerHTML = `
      <style>
        @import url("/netdaemon_toolkit_static/vendor/codemirror/codemirror.min.css");
        @import url("/netdaemon_toolkit_static/vendor/codemirror/theme/material-darker.min.css");
        @import url("/netdaemon_toolkit_static/vendor/codemirror/addon/dialog/dialog.min.css");
        netdaemon-toolkit-panel { display:block; height:100vh; overflow:hidden; }
        .nd-wrap { display:flex; flex-direction:column; height:100%; box-sizing:border-box;
                   --nd-mono: ui-monospace, "JetBrains Mono", "Cascadia Code", "Fira Code",
                              "SF Mono", Menlo, Consolas, monospace;
                   font-family:var(--paper-font-body1_-_font-family,sans-serif);
                   color:var(--primary-text-color); background:var(--primary-background-color); }
        .nd-bar { display:flex; align-items:center; gap:12px; padding:8px 16px;
                  background:var(--app-header-background-color,var(--primary-color));
                  color:var(--app-header-text-color,#fff); }
        .nd-bar .title { font-weight:600; }
        .nd-right { margin-left:auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap;
                    justify-content:flex-end; }
        .nd-rt { font-size:13px; font-weight:600; padding:7px 12px; border-radius:8px;
                 border:1px solid var(--divider-color,#444); white-space:nowrap; }
        .nd-rt.ok  { color:#3fb96a; background:rgba(63,185,106,.14); border-color:rgba(63,185,106,.45); }
        .nd-rt.bad { color:#ff6b6b; background:rgba(255,107,107,.14); border-color:rgba(255,107,107,.5); }
        .nd-body { display:flex; flex:1; min-height:0; }
        .nd-left { width:280px; flex:none; display:flex; flex-direction:column; min-height:0; }
        .nd-dir { font-size:11px; opacity:.7; padding:8px; word-break:break-all;
                  border-bottom:1px solid var(--divider-color,#eee); }
        .nd-filter { margin:6px; padding:6px 9px; border-radius:8px;
                     border:1px solid var(--divider-color,#ccc);
                     background:var(--card-background-color,#fff); color:var(--primary-text-color);
                     font-family:var(--nd-mono); font-size:13px; }
        .nd-list { overflow:auto; padding:6px; display:flex; flex-direction:column; gap:1px; }
        .folder, .file { display:flex; align-items:center; text-align:left; background:none;
                         border:none; cursor:pointer; padding:5px 8px; border-radius:8px;
                         color:var(--primary-text-color); font-family:var(--nd-mono);
                         font-size:13px; }
        .ic { width:16px; height:16px; flex:none; fill:currentColor; opacity:.55; margin-right:6px; }
        .chev { flex:none; width:1em; text-align:center; opacity:.55; }
        .lbl { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .folder { font-weight:500; color:var(--secondary-text-color, #9aa0a6); }
        .folder .ic, .folder .chev { opacity:.4; }
        .folder:hover, .file:hover { background:var(--secondary-background-color,#eee); }
        .generated { color:var(--warning-color,#e0a030); }
        .generated .ic { opacity:.8; }
        .reserved { color:var(--warning-color,#e0a030); opacity:.7; }
        .reserved .ic { opacity:.7; }
        .file.active { background:var(--primary-color); color:#fff; }
        .file.active .ic { opacity:.9; }
        .app-toggle { flex:none; width:30px; height:16px; border-radius:8px; margin-left:6px;
                      background:var(--divider-color,#777); position:relative; cursor:pointer;
                      transition:background .15s; }
        .app-toggle::after { content:""; position:absolute; top:2px; left:2px; width:12px; height:12px;
                             border-radius:50%; background:#fff; transition:left .15s; }
        .app-toggle.on { background:#3fb96a; }
        .app-toggle.on::after { left:16px; }
        .nd-regen { flex:none; margin-left:6px; width:22px; height:18px; line-height:1; padding:0;
                    border:1px solid var(--divider-color,#777); border-radius:6px; cursor:pointer;
                    background:var(--card-background-color,#222); color:inherit; font-size:13px; }
        .nd-regen:hover { background:var(--primary-color); color:#fff; }
        .nd-regen:disabled { cursor:default; opacity:.6; }
        .nd-regen.busy { animation:nd-spin 1s linear infinite; }
        @keyframes nd-spin { to { transform:rotate(360deg); } }
        .nd-trace { flex:none; margin-left:6px; width:22px; height:18px; padding:0; display:flex;
                    align-items:center; justify-content:center; border:1px solid var(--divider-color,#777);
                    border-radius:6px; cursor:pointer; background:var(--card-background-color,#222);
                    color:inherit; }
        .nd-trace .ic { width:13px; height:13px; margin:0; opacity:.7; }
        .nd-trace:hover { background:var(--primary-color); }
        .nd-trace:hover .ic { opacity:1; fill:#fff; }
        .nd-splitter { width:6px; flex:none; cursor:col-resize;
                       background:var(--divider-color,#ccc); opacity:.5; }
        .nd-splitter:hover { opacity:1; }
        .nd-edit { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; padding:8px; gap:8px; }
        .nd-edithead { display:flex; align-items:center; gap:8px; }
        .nd-tabs { flex:1; display:flex; gap:4px; overflow-x:auto; min-width:0; }
        .tab { display:flex; align-items:center; gap:4px; padding:5px 6px 5px 10px;
               border-radius:8px 8px 0 0; background:var(--secondary-background-color,#eee);
               cursor:pointer; white-space:nowrap; font-size:12px; font-family:var(--nd-mono);
               max-width:240px; flex:none; opacity:.7; }
        .tab.active { background:var(--card-background-color,#fff);
                      outline:1px solid var(--divider-color,#ccc); opacity:1; }
        .tab-label { overflow:hidden; text-overflow:ellipsis; }
        .tab-close { border:none; background:none; cursor:pointer; color:inherit;
                     font-size:15px; line-height:1; opacity:.6; padding:0 3px; border-radius:4px; }
        .tab-close:hover { opacity:1; background:var(--divider-color,#ccc); }
        .nd-editor-host { flex:1; min-height:0; overflow:hidden;
                          border:1px solid var(--divider-color,#ccc); border-radius:8px; }
        .nd-editor-host .CodeMirror { height:100%; font-size:13px; font-family:var(--nd-mono); }
        .nd-editor-host .CodeMirror-scrollbar-filler,
        .nd-editor-host .CodeMirror-gutter-filler { background:transparent; }
        .fallback-ta { width:100%; height:100%; box-sizing:border-box; resize:none; tab-size:4;
                       font-family:monospace; font-size:13px; border:none; padding:10px;
                       background:var(--card-background-color,#fff); color:var(--primary-text-color); }
        .nd-search { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:6px 8px;
                     border-radius:8px; background:var(--secondary-background-color,#222); }
        .nd-search[hidden] { display:none; }
        .nd-search input { font-family:var(--nd-mono); font-size:13px; padding:5px 8px;
                           border-radius:6px; border:1px solid var(--divider-color,#444);
                           background:var(--card-background-color,#111); color:var(--primary-text-color); }
        .srch-find, .srch-repl { flex:1; min-width:120px; }
        .srch-count { font-size:12px; opacity:.7; white-space:nowrap; min-width:64px; }
        .srch-btn { cursor:pointer; border:none; border-radius:6px; padding:5px 9px; line-height:1;
                    background:var(--primary-color); color:#fff; font-size:13px; }
        .srch-btn:hover { opacity:.9; }
        .CodeMirror .cm-searching { background:rgba(255,190,0,.20); border-radius:2px; }
        .CodeMirror .nd-current-match { background:#ffb300; border-radius:2px; }
        .CodeMirror .nd-current-match, .CodeMirror .nd-current-match * { color:#000 !important; }
        button.action { cursor:pointer; border:none; border-radius:8px; padding:8px 16px;
                        background:var(--primary-color); color:#fff; font-weight:600; }
        button.action:disabled { opacity:.5; cursor:default; }
        .info { font-size:12px; min-height:1em; opacity:.8; }
        .info.error { color:var(--error-color,#c62828); opacity:1; }
        .muted { opacity:.6; font-size:13px; padding:6px; }
        .nd-tools { display:flex; flex-wrap:wrap; gap:6px; padding:0 6px 4px; }
        .tree-btn { cursor:pointer; border:1px solid var(--divider-color,#444); border-radius:6px;
                    background:var(--card-background-color,#111); color:var(--primary-text-color);
                    font-size:12px; padding:4px 8px; font-family:var(--nd-mono); }
        .tree-btn:hover { background:var(--secondary-background-color,#333); }
        .nd-ctx { position:fixed; z-index:9; min-width:170px; padding:4px; display:flex;
                  flex-direction:column; background:var(--card-background-color,#222);
                  border:1px solid var(--divider-color,#444); border-radius:8px;
                  box-shadow:0 6px 24px rgba(0,0,0,.4); }
        .nd-ctx[hidden] { display:none; }
        .ctx-item { text-align:left; border:none; background:none; cursor:pointer; padding:7px 10px;
                    border-radius:6px; color:var(--primary-text-color); font-size:13px; }
        .ctx-item:hover { background:var(--secondary-background-color,#333); }
        .nd-logs-overlay { position:fixed; inset:0; z-index:20; background:rgba(0,0,0,.5);
                           display:flex; align-items:center; justify-content:center; }
        .nd-logs-overlay[hidden] { display:none; }
        .nd-logs-box { width:90%; height:80%; max-width:1100px; display:flex; flex-direction:column;
                       background:var(--card-background-color,#1c1c1c);
                       border:1px solid var(--divider-color,#444); border-radius:10px; overflow:hidden; }
        .nd-logs-head { display:flex; align-items:center; gap:8px; padding:8px 12px;
                        background:var(--secondary-background-color,#222); }
        .nd-logs-title { font-weight:600; margin-right:auto; }
        .nd-logs-pre { flex:1; margin:0; overflow:auto; padding:10px; white-space:pre-wrap;
                       word-break:break-word; font-family:var(--nd-mono); font-size:12px;
                       line-height:1.4; color:var(--primary-text-color);
                       background:var(--card-background-color,#111); }
        .nd-logs-pre .log-warn { color:#e0a030; }
        .nd-logs-pre .log-err { color:#ff6b6b; }
        .nd-traces-overlay { position:fixed; inset:0; z-index:21; background:rgba(0,0,0,.5);
                             display:flex; align-items:center; justify-content:center; }
        .nd-traces-overlay[hidden] { display:none; }
        .nd-traces-box { width:90%; height:80%; max-width:1100px; display:flex; flex-direction:column;
                         background:var(--card-background-color,#1c1c1c);
                         border:1px solid var(--divider-color,#444); border-radius:10px; overflow:hidden; }
        .nd-traces-filters { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
                             padding:8px 12px; border-bottom:1px solid var(--divider-color,#444);
                             font-size:12px; }
        .nd-traces-filters label { display:flex; align-items:center; gap:5px; opacity:.85; }
        .nd-tf-q { flex:1; min-width:140px; font-family:var(--nd-mono); font-size:13px;
                   padding:5px 8px; border-radius:6px; border:1px solid var(--divider-color,#444);
                   background:var(--card-background-color,#111); color:var(--primary-text-color); }
        .nd-traces-filters input[type=datetime-local] {
                   font-family:var(--nd-mono); font-size:12px; padding:4px 6px; border-radius:6px;
                   border:1px solid var(--divider-color,#444);
                   background:var(--card-background-color,#111); color:var(--primary-text-color); }
        .nd-traces-body { flex:1; display:flex; min-height:0; }
        .nd-traces-list { width:300px; flex:none; overflow:auto; display:flex; flex-direction:column;
                          border-right:1px solid var(--divider-color,#444); }
        .nd-trace-item { text-align:left; background:none; border:none; border-left:3px solid transparent;
                         border-bottom:1px solid var(--divider-color,#333); cursor:pointer; padding:8px 10px;
                         color:var(--primary-text-color); display:flex; flex-direction:column; gap:2px; }
        .nd-trace-item:hover { background:var(--secondary-background-color,#2a2a2a); }
        .nd-trace-item.active { background:var(--secondary-background-color,#333); }
        .nd-trace-item .tr-when { font-size:11px; opacity:.6; font-family:var(--nd-mono); }
        .nd-trace-item .tr-sum { font-size:13px; }
        .tr-kind { font-family:var(--nd-mono); font-size:10.5px; opacity:.85; align-self:flex-start;
                   padding:1px 6px; border-radius:8px; background:var(--secondary-background-color,#333);
                   border:1px solid var(--divider-color,#555); }
        .tr-head .tr-kind { align-self:auto; }
        .nd-traces-detail { flex:1; overflow:auto; padding:14px; font-size:13px; min-width:0; }
        .tr-head { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .tr-badge { color:#000; font-weight:600; font-size:12px; padding:3px 9px; border-radius:10px; }
        .tr-time { opacity:.7; font-family:var(--nd-mono); font-size:12px; }
        .tr-sec { margin-bottom:14px; }
        .tr-sec-h { font-weight:600; opacity:.7; font-size:12px; text-transform:uppercase;
                    letter-spacing:.04em; margin-bottom:5px; }
        .tr-val { font-family:var(--nd-mono); }
        .tr-grid { display:grid; grid-template-columns:auto 1fr; gap:3px 14px;
                   font-family:var(--nd-mono); font-size:12.5px; }
        .tr-k { opacity:.65; }
        .tr-v { word-break:break-word; }
      </style>
      <div class="nd-wrap">
        <div class="nd-bar">
          <span class="title">NetDaemon Toolkit</span>
          <div class="nd-right">
            <button class="action nd-logs" title="${t("t_logs")}">${t("btnLogs")}</button>
            <button class="action nd-reload" title="${t("t_reload")}">${t("btnReload")}</button>
            <span class="nd-rt">${t("statusLoading")}</span>
          </div>
        </div>
        <div class="nd-body">
          <div class="nd-left">
            <div class="nd-dir"></div>
            <div class="nd-tools">
              <button class="tree-btn nd-new" title="${t("t_newFile")}">${t("btnNewFile")}</button>
              <button class="tree-btn nd-new-folder" title="${t("t_newFolder")}">${t("btnNewFolder")}</button>
              <button class="tree-btn nd-refresh" title="${t("t_refreshList")}">⟳</button>
            </div>
            <input class="nd-filter" type="search" placeholder="${t("filter")}" spellcheck="false" />
            <div class="nd-list"></div>
          </div>
          <div class="nd-splitter"></div>
          <div class="nd-edit">
            <div class="nd-edithead">
              <div class="nd-tabs"></div>
              <button class="action save" disabled>${t("save")}</button>
            </div>
            <div class="nd-search" hidden>
              <button class="srch-btn srch-toggle" title="${t("toggleShow")}">▸</button>
              <input class="srch-find" type="text" placeholder="${t("searchFind")}" spellcheck="false" />
              <span class="srch-count"></span>
              <button class="srch-btn srch-prev" title="${t("t_prev")}">‹</button>
              <button class="srch-btn srch-next" title="${t("t_next")}">›</button>
              <input class="srch-repl" type="text" placeholder="${t("searchReplace")}" spellcheck="false" />
              <button class="srch-btn srch-one" title="${t("t_replaceOne")}">${t("btnReplaceOne")}</button>
              <button class="srch-btn srch-all" title="${t("t_replaceAll")}">${t("btnReplaceAll")}</button>
              <button class="srch-btn srch-close" title="${t("t_searchClose")}">×</button>
            </div>
            <div class="nd-editor-host"></div>
            <div class="info"></div>
          </div>
        </div>
        <div class="nd-ctx" hidden></div>
        <div class="nd-logs-overlay" hidden>
          <div class="nd-logs-box">
            <div class="nd-logs-head">
              <span class="nd-logs-title">${t("logsTitle")}</span>
              <button class="action nd-logs-reload">${t("btnReload")}</button>
              <button class="action nd-logs-refresh">${t("refresh")}</button>
              <button class="action nd-logs-close">${t("close")}</button>
            </div>
            <pre class="nd-logs-pre"></pre>
          </div>
        </div>
        <div class="nd-traces-overlay" hidden>
          <div class="nd-traces-box">
            <div class="nd-logs-head">
              <span class="nd-logs-title nd-traces-title"></span>
              <button class="action nd-traces-refresh">${t("refresh")}</button>
              <button class="action nd-traces-close">${t("close")}</button>
            </div>
            <div class="nd-traces-filters">
              <input class="nd-tf-q" type="search" placeholder="${t("traceFilter")}" spellcheck="false" />
              <label>${t("traceFrom")} <input class="nd-tf-from" type="datetime-local" /></label>
              <label>${t("traceTo")} <input class="nd-tf-to" type="datetime-local" /></label>
              <button class="tree-btn nd-tf-clear">${t("traceClear")}</button>
            </div>
            <div class="nd-traces-body">
              <div class="nd-traces-list"></div>
              <div class="nd-traces-detail"></div>
            </div>
          </div>
        </div>
      </div>`;

    this._ndRt = this.querySelector(".nd-rt");
    this._dir = this.querySelector(".nd-dir");
    this._list = this.querySelector(".nd-list");
    this._splitter = this.querySelector(".nd-splitter");
    this._left = this.querySelector(".nd-left");
    this._tabsEl = this.querySelector(".nd-tabs");
    this._host = this.querySelector(".nd-editor-host");
    this._saveBtn = this.querySelector(".save");
    this._info = this.querySelector(".info");

    this._filterInput = this.querySelector(".nd-filter");
    this._filterInput.addEventListener("input", () => {
      this._filter = this._filterInput.value.trim().toLowerCase();
      this._renderTree();
    });
    this.querySelector(".nd-refresh").addEventListener("click", () => this._loadFiles());
    this.querySelector(".nd-reload").addEventListener("click", () => this._reloadNetDaemon());
    this._saveBtn.addEventListener("click", () => this._save());

    // Logs overlay.
    this._logsOverlay = this.querySelector(".nd-logs-overlay");
    this._logsPre = this.querySelector(".nd-logs-pre");
    this.querySelector(".nd-logs").addEventListener("click", () => this._openLogs());
    this.querySelector(".nd-logs-reload").addEventListener("click", () => this._reloadNetDaemon());
    this.querySelector(".nd-logs-refresh").addEventListener("click", () => this._loadLogs());
    this.querySelector(".nd-logs-close").addEventListener("click", () => this._closeLogs());

    // Traces overlay.
    this._tracesOverlay = this.querySelector(".nd-traces-overlay");
    this._tracesTitleEl = this.querySelector(".nd-traces-title");
    this._tracesList = this.querySelector(".nd-traces-list");
    this._tracesDetail = this.querySelector(".nd-traces-detail");
    this.querySelector(".nd-traces-refresh").addEventListener("click", () => this._loadTraces());
    this.querySelector(".nd-traces-close").addEventListener("click", () => this._closeTraces());
    this._tfQ = this.querySelector(".nd-tf-q");
    this._tfFrom = this.querySelector(".nd-tf-from");
    this._tfTo = this.querySelector(".nd-tf-to");
    let tfDebounce;
    const reload = () => {
      clearTimeout(tfDebounce);
      tfDebounce = setTimeout(() => this._loadTraces(), 300);
    };
    this._tfQ.addEventListener("input", reload);
    this._tfFrom.addEventListener("change", reload);
    this._tfTo.addEventListener("change", reload);
    this.querySelector(".nd-tf-clear").addEventListener("click", () => {
      this._tfQ.value = "";
      this._tfFrom.value = "";
      this._tfTo.value = "";
      this._loadTraces();
    });

    // Search bar wiring.
    this._searchBar = this.querySelector(".nd-search");
    this._findInput = this.querySelector(".srch-find");
    this._replInput = this.querySelector(".srch-repl");
    this._countEl = this.querySelector(".srch-count");
    this._findInput.addEventListener("input", () => this._refreshSearch());
    this._findInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._findNext(ev.shiftKey);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this._closeSearch();
      }
    });
    this._replInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._replaceOne();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this._closeSearch();
      }
    });
    this.querySelector(".srch-next").addEventListener("click", () => this._findNext(false));
    this.querySelector(".srch-prev").addEventListener("click", () => this._findNext(true));
    this.querySelector(".srch-one").addEventListener("click", () => this._replaceOne());
    this.querySelector(".srch-all").addEventListener("click", () => this._replaceAll());
    this.querySelector(".srch-close").addEventListener("click", () => this._closeSearch());
    this._toggleBtn = this.querySelector(".srch-toggle");
    this._toggleBtn.addEventListener("click", () => this._setReplaceVisible(!this._replaceVisible));

    // File operations.
    this._ctx = this.querySelector(".nd-ctx");
    this.querySelector(".nd-new").addEventListener("click", () => this._promptCreate(""));
    this.querySelector(".nd-new-folder").addEventListener("click", () => this._promptCreateFolder(""));
    this._list.addEventListener("contextmenu", (ev) => {
      if (ev.target === this._list) {
        ev.preventDefault();
        this._showCtx(ev.clientX, ev.clientY, [
          { label: this._t("ctxNew"), fn: () => this._promptCreate("") },
          { label: this._t("ctxNewFolder"), fn: () => this._promptCreateFolder("") },
        ]);
      }
    });
    document.addEventListener("click", () => this._hideCtx());

    this._initSplitter();
  }
}

customElements.define("netdaemon-toolkit-panel", NetDaemonToolkitPanel);
