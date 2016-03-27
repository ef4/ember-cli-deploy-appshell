(function() {
  if (window._ember_cli_deploy_appshell_running) {
    return;
  }
  window._ember_cli_deploy_appshell_running = true;

  function log(msg) {
    msg = '[appshell] ' + msg;
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift(msg);
    console.log.apply(console, args);
  }

  function ready(fn) {
    if (document.readyState === "complete") {
      fn();
    } else {
      document.addEventListener( "DOMContentLoaded", fn);
    }
  }

  var allowedNormalBoot = false;
  function allowNormalBoot() {
    if (allowedNormalBoot){ return; }
    log("allowing app to boot");
    allowedNormalBoot = true;
    var tag = document.createElement('script');
    tag.type = "text/javascript";
    tag.textContent = "require('MODULE_PREFIX/app').default.create(require('MODULE_PREFIX/config/environment').default.APP)";
    ready(function(){
      document.getElementsByTagName('body')[0].appendChild(tag);
    });
  }

  function getShadowIndex(cb) {
    var req = new XMLHttpRequest();
    req.open("GET","/appshell.html",true);
    req.onreadystatechange = function(){
      if (req.readyState === req.DONE){
        if (req.status === 200){
          cb(req.response);
        } else {
          throw new Error("failed to retrieve shadow index");
        }
      }
    };
    req.send();
  }

  function htmlParser(){
    // Browsers back through IE9 support DOMParser, although not
    // necessarily with html support.
    var parser = new DOMParser();

    // Firefox/Opera/IE throw errors on unsupported types
    try {
      // WebKit returns null on unsupported types
      if (parser.parseFromString("", "text/html")) {
        // text/html parsing is natively supported
        return function(htmlString){ return parser.parseFromString(htmlString, 'text/html'); };
      }
    } catch (ex) {}

    return function(htmlString) {
      var doc = document.implementation.createHTMLDocument("");
      if (htmlString.toLowerCase().indexOf('<!doctype') > -1) {
        doc.documentElement.innerHTML = htmlString;
      }
      else {
        doc.body.innerHTML = htmlString;
      }
      return doc;
    };
  }

  function scriptLoader() {
    var pendingScripts = 0;
    var allDoneCb;

    function didLoad() {
      pendingScripts--;
      if (pendingScripts === 0) {
        if (allDoneCb) {
          allDoneCb();
        }
      }
    }

    return {
      waitFor: function(script) {
        if (script.hasAttribute('src')) {
          script.onload = didLoad;
          script.onerror = didLoad;
          script.onabort = didLoad;
          pendingScripts++;
        }
      },
      allDoneThen: function(cb) {
        if (pendingScripts === 0) {
          cb();
        } else {
          allDoneCb = cb;
        }
      }
    };
  }

  function replace(source, destination, loader) {
    while (destination.firstChild) {
      destination.firstChild.remove();
    }
    while (source.firstChild) {
      var child = document.importNode(source.firstChild, true);
      source.firstChild.remove();
      if (child.tagName === 'SCRIPT') {
        loader.waitFor(child);
      }
      destination.appendChild(child);
    }
  }

  function cacheBust() {
    log("fetching shadow index");
    getShadowIndex(function(html) {
      log("got shadow index, stuffing it into dom");
      window.shadowIndex = html;
      var doc = htmlParser()(html);
      var loader = scriptLoader();
      replace(doc.getElementsByTagName('head')[0], document.getElementsByTagName('head')[0], loader);
      replace(doc.getElementsByTagName('body')[0], document.getElementsByTagName('body')[0], loader);
      loader.allDoneThen(allowNormalBoot);
    });
  }

  if (typeof applicationCache === 'undefined' || applicationCache.status === applicationCache.UNCACHED || applicationCache.status === applicationCache.IDLE) {
    log("appcache is idle or missing, allowing normal boot");
    allowNormalBoot();
  } else if (applicationCache.status === applicationCache.CHECKING) {
    log("appcache check is in progress, will wait briefly");
    var waiting = true;
    var nevermind = function(msg) {
      return function() {
        if (waiting){
          log(msg);
          waiting = false;
          allowNormalBoot();
        }
      };
    };
    var useLatest = function(msg) {
      return function(){
        if (waiting) {
          log(msg);
          waiting = false;
          cacheBust();
        }
      };
    };
    applicationCache.addEventListener("noupdate", nevermind("confirmed no update"));
    applicationCache.addEventListener("error", nevermind("error while updating"));
    applicationCache.addEventListener("obsolete", useLatest("appcache is obsolete"));
    applicationCache.addEventListener("downloading", useLatest("downloading update"));
    setTimeout(nevermind("checking for update is taking too long"), 500);
  } else {
    log("busting appcache for great freshness");
    cacheBust();
  }

})();
