/* SCORM 1.2 runtime: completion is sent only by SCORM.complete(). */
(function () {
  "use strict";

  var api = null;
  var ready = false;
  var finished = false;
  var startedAt = new Date().getTime();

  function findAPI(win) {
    try {
      var depth = 0;
      while (win && depth++ < 10) {
        if (win.API) return win.API;
        if (win === win.parent) break;
        win = win.parent;
      }
    } catch (error) {}
    return null;
  }

  function succeeded(result) {
    return result === true || result === "true";
  }

  function sessionTime() {
    var elapsed = Math.max(0, Math.floor((new Date().getTime() - startedAt) / 10));
    var hours = Math.floor(elapsed / 360000);
    elapsed -= hours * 360000;
    var minutes = Math.floor(elapsed / 6000);
    elapsed -= minutes * 6000;
    var seconds = Math.floor(elapsed / 100);
    var hundredths = elapsed % 100;
    function pad(value, width) {
      var text = String(value);
      while (text.length < width) text = "0" + text;
      return text;
    }
    return pad(hours, 4) + ":" + pad(minutes, 2) + ":" +
      pad(seconds, 2) + "." + pad(hundredths, 2);
  }

  function init() {
    api = findAPI(window) || (window.opener ? findAPI(window.opener) : null);
    if (!api) return false;
    ready = succeeded(api.LMSInitialize(""));
    startedAt = new Date().getTime();
    return ready;
  }

  function set(key, value) {
    return ready && succeeded(api.LMSSetValue(key, String(value)));
  }

  function get(key) {
    if (!ready) return "";
    try { return api.LMSGetValue(key) || ""; } catch (error) { return ""; }
  }

  function commit() {
    return ready && succeeded(api.LMSCommit(""));
  }

  function finish() {
    if (!ready || finished) return false;
    var result = api.LMSFinish("");
    finished = true;
    ready = false;
    return succeeded(result);
  }

  function complete() {
    if (!ready || finished) return false;
    set("cmi.core.score.min", "0");
    set("cmi.core.score.max", "100");
    set("cmi.core.score.raw", "100");
    set("cmi.core.lesson_status", "completed");
    commit();
    set("cmi.core.session_time", sessionTime());
    set("cmi.core.exit", "");
    commit();
    return finish();
  }

  window.SCORM = { init: init, set: set, get: get, commit: commit, finish: finish, complete: complete };
  window.addEventListener("load", init);
})();
