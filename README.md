# ember-app-shell

This is an ember-cli-deploy plugin that loads your Ember application
via an `applicationCache`-based bootloader. It

 - reliably caches all your assets for speed and offline use
 - always boots your freshest version when the network is sufficiently fast
 - never blocks application boot to preemptively cache assets

## Demo

This app has a working deploy setup for running out of s3, complete with "lightning deploy"-style activation.

https://github.com/ef4/ember-appcache-demo

Running version is here:

http://appcache-demo.eaf4.com/

## Key requirements:

 1. Set `autoRun: false` in the arguments to `new EmberApp` in your `ember-cli-build.js` file. Our bootloader code takes over deciding when to boot your app.

 2. Remove `loader.js` from your package.json, and set `_ignoreMissingLoader: true` in the arguments to `new EmberApp` in your `ember-cli-build.js` file. This addon inlines its own copy of `loader.js` in order to manage ambiguity between multiple versions of your app that may be attempting to load in parallel.

 3. Wherever you are deploying `index.html`, you must also deploy `appshell.html` and `appcache.manifest`.

 4. Make sure you're using fingerprinted assets. This is critical to busting through the application cache to get instant updates when online.

## What is appshell.html?

It's a nearly-identical copy of your index.html, with one key difference: it lacks a `manifest` attribute, so it doesn't get stored in `applicationCache`. We use it to bust through the cache when we want to check for the latest index. If we find a new index, we shove it into DOM and let it take over immediately, while the normal `applicationCache` update is happening in the background.



