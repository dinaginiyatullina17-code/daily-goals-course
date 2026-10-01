(function () {
  "use strict";
  let api = null, lmsReady = false, closed = false, learnerId = "", LS_KEY = "";
  const COURSE_ID = document.documentElement.getAttribute("data-ku-course") || location.pathname;
  const RESTART_KEY = "ku-restart::" + COURSE_ID;
  const startedAt = Date.now();
  const state = { unlocked: 1, done: {}, vars: {}, completed: false };

  function findAPI(win) {
    try { for (let depth = 0; win && depth <= 10; depth += 1) { if (win.API) return win.API; if (!win.parent || win.parent === win) break; win = win.parent; } } catch (error) {}
    return null;
  }
  function lmsInit() {
    api = findAPI(window);
    if (!api) { try { if (window.opener) api = findAPI(window.opener); } catch (error) {} }
    if (!api) return;
    try { api.LMSInitialize(""); lmsReady = true; } catch (error) { lmsReady = false; }
  }
  function lmsGet(key) { if (!lmsReady) return ""; try { return String(api.LMSGetValue(key) || ""); } catch (error) { return ""; } }
  function lmsSet(key, value) { if (!lmsReady) return; try { api.LMSSetValue(key, String(value)); } catch (error) {} }
  function lmsCommit() { if (!lmsReady) return; try { api.LMSCommit(""); } catch (error) {} }
  function lmsFinish() { if (!lmsReady || closed) return; try { api.LMSFinish(""); } catch (error) {} closed = true; lmsReady = false; }

  const lsGet = () => { if (!LS_KEY) return ""; try { return localStorage.getItem(LS_KEY) || ""; } catch (error) { return ""; } };
  const lsSet = (value) => { if (!LS_KEY) return; try { localStorage.setItem(LS_KEY, value); } catch (error) {} };
  const lsDel = () => { if (!LS_KEY) return; try { localStorage.removeItem(LS_KEY); } catch (error) {} };

  function bindLearner() {
    learnerId = lmsReady ? lmsGet("cmi.core.student_id") : "local";
    const legacyKey = "ku::" + COURSE_ID;
    if (lmsReady) {
      try { localStorage.removeItem(legacyKey); } catch (error) {}
      LS_KEY = learnerId ? legacyKey + "::" + learnerId : "";
    } else LS_KEY = legacyKey + "::local";
  }
  function snapshot() { return { unlocked: state.unlocked, done: state.done, vars: state.vars, completed: state.completed }; }
  function serialize() {
    let json = JSON.stringify(snapshot());
    if (json.length <= 4000) return json;
    return JSON.stringify({ unlocked: state.unlocked, done: state.done, vars: {}, completed: state.completed });
  }
  function save() {
    const json = serialize(); lsSet(json);
    if (!lmsReady) return;
    lmsSet("cmi.suspend_data", json);
    const status = lmsGet("cmi.core.lesson_status");
    if (!state.completed && (!status || status === "not attempted" || status === "unknown")) lmsSet("cmi.core.lesson_status", "incomplete");
    lmsCommit();
  }
  function load() {
    const status = lmsGet("cmi.core.lesson_status");
    let json = lmsReady ? lmsGet("cmi.suspend_data") : "";
    if (!json) json = lsGet();
    try {
      const stored = JSON.parse(json || "null");
      if (stored) { state.unlocked = Math.max(1, Number(stored.unlocked) || 1); state.done = stored.done || {}; state.vars = stored.vars || {}; state.completed = !!stored.completed; }
    } catch (error) {}
    if (status === "passed" || status === "completed") state.completed = true;
    if (state.completed && status !== "passed" && lmsReady) { writeResult(); lmsSet("cmi.suspend_data", serialize()); lmsCommit(); }
  }
  function formatSessionTime() {
    let value = Math.max(0, Math.floor((Date.now() - startedAt) / 10)); const hours = Math.floor(value / 360000); value %= 360000;
    const minutes = Math.floor(value / 6000); value %= 6000; const seconds = Math.floor(value / 100), fraction = value % 100;
    return String(hours).padStart(4, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0") + "." + String(fraction).padStart(2, "0");
  }
  function writeResult() {
    lmsSet("cmi.core.score.min", "0"); lmsSet("cmi.core.score.max", "100"); lmsSet("cmi.core.score.raw", "100");
    lmsSet("cmi.core.lesson_status", "completed"); lmsSet("cmi.core.lesson_status", "passed");
  }
  function finishSession() {
    state.completed = true;
    document.querySelectorAll("[data-ku-complete]").forEach((button) => { button.textContent = "Сохраняем результат…"; button.setAttribute("aria-busy", "true"); });
    const json = serialize(); lsSet(json);
    if (lmsReady) { writeResult(); lmsSet("cmi.suspend_data", json); lmsSet("cmi.core.session_time", formatSessionTime()); lmsCommit(); }
    document.dispatchEvent(new CustomEvent("ku:completed", { detail: snapshot() }));
    setTimeout(function () { location.reload(); }, 120);
  }
  function complete() { finishSession(); }
  function bindComplete() { document.querySelectorAll("[data-ku-complete]").forEach((button) => button.addEventListener("click", complete)); }
  function leave() {
    if (closed || state.completed || !lmsReady) return;
    lmsSet("cmi.core.session_time", formatSessionTime()); lmsSet("cmi.core.exit", "suspend"); lmsCommit(); lmsFinish();
  }
  function restart() {
    try { sessionStorage.setItem(RESTART_KEY + "::" + learnerId, "1"); } catch (error) {}
    location.hash = "ku-restart"; location.reload();
  }
  function applyRestart() {
    let requested = location.hash === "#ku-restart";
    try { const key = RESTART_KEY + "::" + learnerId; requested = requested || sessionStorage.getItem(key) === "1"; if (requested) sessionStorage.removeItem(key); } catch (error) {}
    if (!requested) return;
    state.unlocked = 1; state.done = {}; state.vars = {}; state.completed = false; lsDel(); history.replaceState(null, "", location.pathname + location.search);
  }
  function bindRestart() { document.querySelectorAll("[data-ku-restart]").forEach((button) => button.addEventListener("click", restart)); }
  const progress = {
    markDone(id) { if (!id) return; state.done[id] = true; save(); }, isDone(id) { return !!state.done[id]; },
    setUnlocked(value) { const next = Math.max(1, Number(value) || 1); if (next > state.unlocked) { state.unlocked = next; save(); } }, unlocked() { return state.unlocked; }
  };
  window.KU = {
    progress: progress,
    vars: { get(name) { return state.vars[name]; }, set(name, value) { state.vars[name] = value; save(); }, all() { return { ...state.vars }; } },
    save: save,
    complete: complete,
    restart: restart,
    state: state
  };
  window.addEventListener("load", function () {
    lmsInit();
    bindLearner();
    load();
    applyRestart(); bindComplete(); bindRestart(); save(); document.dispatchEvent(new CustomEvent("ku:ready", { detail: snapshot() }));
  });
  window.addEventListener("pagehide", leave);
  window.addEventListener("beforeunload", leave);
})();
