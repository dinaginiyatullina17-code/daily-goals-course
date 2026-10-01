/* SCORM 1.2 runtime for WebSoft/WebTutor. */
(function () {
  'use strict';

  var api = null;
  var ready = false;
  var finished = false;
  var completed = false;
  var startedAt = Date.now();

  function findAPI(start) {
    var current = start;
    for (var depth = 0; current && depth <= 10; depth += 1) {
      try {
        if (current.API) return current.API;
        if (!current.parent || current.parent === current) break;
        current = current.parent;
      } catch (error) {
        break;
      }
    }
    return null;
  }

  function getAPI() {
    var found = findAPI(window);
    if (!found) {
      try { if (window.opener) found = findAPI(window.opener); } catch (error) {}
    }
    return found;
  }

  function formatSessionTime(milliseconds) {
    var hundredths = Math.max(0, Math.floor(milliseconds / 10));
    var hours = Math.floor(hundredths / 360000);
    var minutes = Math.floor((hundredths % 360000) / 6000);
    var seconds = Math.floor((hundredths % 6000) / 100);
    var fraction = hundredths % 100;
    return String(hours).padStart(4, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0') + '.' +
      String(fraction).padStart(2, '0');
  }

  function setValue(key, value) {
    if (!ready || finished) return false;
    return api.LMSSetValue(key, String(value));
  }

  function commit() {
    if (!ready || finished) return false;
    return api.LMSCommit('');
  }

  function finish(exitValue) {
    if (!ready || finished) return false;
    setValue('cmi.core.session_time', formatSessionTime(Date.now() - startedAt));
    setValue('cmi.core.exit', exitValue);
    commit();
    finished = true;
    ready = false;
    return api.LMSFinish('');
  }

  var SCORM = {
    init: function () {
      if (ready || finished) return ready;
      api = getAPI();
      if (!api) return false;
      var result = api.LMSInitialize('');
      ready = result === true || result === 'true';
      if (!ready) return false;
      var status = this.get('cmi.core.lesson_status');
      completed = status === 'completed' || status === 'passed';
      if (!completed && (!status || status === 'not attempted' || status === 'unknown')) {
        setValue('cmi.core.lesson_status', 'incomplete');
        commit();
      }
      return true;
    },
    set: setValue,
    get: function (key) {
      if (!ready || finished) return '';
      return api.LMSGetValue(key);
    },
    commit: commit,
    finish: finish,
    complete: function () {
      if (!ready || finished) return false;
      this.set('cmi.core.score.min', '0');
      this.set('cmi.core.score.max', '100');
      this.set('cmi.core.score.raw', '100');
      this.set('cmi.core.lesson_status', 'completed');
      completed = true;
      commit();
      return finish('');
    },
    suspend: function () {
      if (completed || !ready || finished) return false;
      return finish('suspend');
    }
  };

  window.SCORM = SCORM;
  window.addEventListener('load', function () { SCORM.init(); });
  window.addEventListener('pagehide', function () { SCORM.suspend(); });
  window.addEventListener('beforeunload', function () { SCORM.suspend(); });
})();
