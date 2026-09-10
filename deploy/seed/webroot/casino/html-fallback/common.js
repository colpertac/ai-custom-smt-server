/* Shared ES3-safe helpers for Golden Ark casino UIs (embedded IE). */
/* global casinoCommon:true */

var casinoCommon = (function () {
  function getQuery() {
    var out = {};
    var q = String(window.location.search || "").replace(/^\?/, "");
    if (!q) return out;
    var parts = q.split("&");
    var i;
    for (i = 0; i < parts.length; i++) {
      var pair = parts[i].split("=");
      var key = decodeURIComponent(pair[0] || "");
      var val = decodeURIComponent(pair[1] || "");
      out[key] = val;
    }
    return out;
  }

  function apiBase() {
    // Same origin as lobby WebListeningPort (static webroot + /api).
    return "";
  }

  function createXhr() {
    if (window.XMLHttpRequest) {
      return new XMLHttpRequest();
    }
    try {
      return new ActiveXObject("Msxml2.XMLHTTP");
    } catch (e1) {}
    try {
      return new ActiveXObject("Microsoft.XMLHTTP");
    } catch (e2) {}
    return null;
  }

  function stringify(obj) {
    if (window.JSON && typeof JSON.stringify === "function") {
      return JSON.stringify(obj);
    }
    var parts = [];
    var k;
    for (k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      var v = obj[k];
      var t = typeof v;
      if (t === "number" || t === "boolean") {
        parts.push('"' + k + '":' + v);
      } else if (v === null) {
        parts.push('"' + k + '":null');
      } else {
        parts.push(
          '"' +
            k +
            '":"' +
            String(v)
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"') +
            '"'
        );
      }
    }
    return "{" + parts.join(",") + "}";
  }

  function parseJson(text) {
    if (window.JSON && typeof JSON.parse === "function") {
      return JSON.parse(text);
    }
    return eval("(" + text + ")");
  }

  function post(path, body, onOk, onErr) {
    var xhr = createXhr();
    if (!xhr) {
      onErr("No XMLHttpRequest available");
      return;
    }
    xhr.open("POST", apiBase() + path, true);
    try {
      xhr.setRequestHeader("Content-Type", "application/json");
    } catch (e) {}
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var raw = xhr.responseText || "";
      if (xhr.status === 401) {
        onErr("Unauthorized (session expired or wrong username)");
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        onErr("HTTP " + xhr.status + (raw ? ": " + raw : ""));
        return;
      }
      try {
        onOk(parseJson(raw));
      } catch (err) {
        onErr("Bad JSON: " + raw);
      }
    };
    xhr.send(stringify(body));
  }

  function Session(query) {
    this.username = String(query.user_id || query.username || "").toLowerCase();
    this.sessionid = String(query.session_id || query.sessionid || "");
    this.mid = String(query.mid || "0");
    this.character = String(query.character_name || "");
    this.worldId = String(query.world_id || "");
  }

  Session.prototype.auth = function (extra) {
    var body = {
      username: this.username,
      sessionid: this.sessionid
    };
    var k;
    if (extra) {
      for (k in extra) {
        if (extra.hasOwnProperty(k)) body[k] = extra[k];
      }
    }
    return body;
  };

  Session.prototype.valid = function () {
    return this.username.length > 0 && this.sessionid.length > 0;
  };

  function startGame(session, type, onOk, onErr) {
    post(
      "/api/webgame/start",
      session.auth({ type: type }),
      function (res) {
        if (res.error && res.error !== "Success") {
          onErr(res.error);
          return;
        }
        onOk(res);
      },
      onErr
    );
  }

  function updateGame(session, action, params, onOk, onErr) {
    var body = session.auth({ action: action });
    var k;
    if (params) {
      for (k in params) {
        if (params.hasOwnProperty(k)) body[k] = params[k];
      }
    }
    post(
      "/api/webgame/update",
      body,
      function (res) {
        if (res.error && res.error !== "Success") {
          onErr(res.error);
          return;
        }
        onOk(res);
      },
      onErr
    );
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = String(text);
  }

  function setBusy(busy) {
    var buttons = document.getElementsByTagName("button");
    var i;
    for (i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !!busy;
    }
  }

  return {
    getQuery: getQuery,
    Session: Session,
    startGame: startGame,
    updateGame: updateGame,
    setText: setText,
    setBusy: setBusy,
    parseJson: parseJson
  };
})();
