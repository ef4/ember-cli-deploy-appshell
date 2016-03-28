(function() {
  // We need to defend against reentrance, because if we end up
  // replacing the current page with an updated version, the updated
  // version will probably also include a copy of ourself.
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

  // We're running before we can rely on jQuery having loaded, so
  // we're playing on hard mode.
  function ready(fn) {
    if (document.readyState === "complete") {
      fn();
    } else {
      document.addEventListener( "DOMContentLoaded", fn);
    }
  }

  // This replaces ember-cli's normal autorun step. The module prefix
  // below gets rewritten at build time to match your real value.
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

  // appshell.html is a copy of our index.html that doesn't include a
  // manifest attribute. Therefore we can always grab the latest
  // version without applicationCache intercepting us.
  function getShadowIndex(cb, failureCb) {
    var req = new XMLHttpRequest();
    req.open("GET","appshell.html",true);
    req.onreadystatechange = function(){
      if (req.readyState === req.DONE){
        if (req.status === 200){
          cb(req.response);
        } else {
          failureCb(new Error("failed to retrieve shadow index"));
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

  // We need to manage the timing of script loading to ensure that the
  // newest scripts have loaded before we trigger app
  // boot. Dynamically appended script tags don't otherwise have a
  // reliable ordering.
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
      // importNode is important here. Without it, the browser will
      // implicitly copy the nodes for you, but we would lose the
      // onload handler installed by loader.waitFor.
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
      // Once all the new contents of index.html (fetched via
      // appshell.html) are appended and loaded, we can allow the app
      // to boot. Note that the rest of the applicationCache probably
      // hasn't updated yet at this point! That's OK as long as our
      // assets are fingerprinted -- our new assets came straight from
      // the network. The applicationCache can do its usual update
      // thing in the background (and we share the normal HTTP cache
      // with it, so as long as your cache headers are good we won't
      // double fetch).
      loader.allDoneThen(allowNormalBoot);
    }, function(err) {
      // If something goes wrong with the fetch, it's better to try to
      // boot what we already have than just let the app die.
      allowNormalBoot();
      throw err;
    });
  }

  if (typeof applicationCache === 'undefined' || applicationCache.status === applicationCache.UNCACHED || applicationCache.status === applicationCache.IDLE) {
    // IDLE here only happens if the applicationCache managed to
    // complete its check before we got here, and it found nothing
    // new. So we know we can just boot out of cache immediately.
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
    // This handles the case where we're on a "Lie-Fi" network: it
    // looks up, but it's just hanging. This timeout should become configurable.
    setTimeout(nevermind("checking for update is taking too long"), 500);
  } else {
    // We go down this path when we find the cache is already
    // DOWNLOADING, UPDATEREADY, or OBSOLETE. This can happen if the
    // applicationCache's own update happened so quickly that it
    // finished before we got here.
    log("busting appcache for great freshness");
    cacheBust();
  }

})();
