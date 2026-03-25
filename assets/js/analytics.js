(function () {
  var config = window.oipAnalytics || {};
  var pageContext = config.page || {};
  var pendingCounts = [];
  var flushTimer = 0;

  function cleanProps(input) {
    var props = {};
    var key;

    for (key in input) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) {
        continue;
      }

      if (input[key] === null || input[key] === undefined || input[key] === "") {
        continue;
      }

      props[key] = input[key];
    }

    return props;
  }

  function track(eventName, props) {
    var payload;

    if (!config.enabled) {
      return;
    }

    payload = buildEventPayload(eventName, cleanProps(props || {}));
    if (!payload) {
      return;
    }

    if (isGoatCounterReady()) {
      window.goatcounter.count(payload);
      return;
    }

    pendingCounts.push(payload);
    ensureFlushTimer();
  }

  function parseUrl(href) {
    try {
      return new URL(href, window.location.href);
    } catch (error) {
      return null;
    }
  }

  function currentPageProps() {
    return cleanProps({
      slug: pageContext.slug,
      title: pageContext.title,
      section: pageContext.section,
      path: pageContext.path
    });
  }

  function isGoatCounterReady() {
    return !!(window.goatcounter && typeof window.goatcounter.count === "function");
  }

  function buildEventPath(eventName, props) {
    var keys = ["path", "slug", "section", "source_slot", "collection"];
    var parts = ["oip:" + eventName];

    keys.forEach(function (key) {
      if (!props[key]) {
        return;
      }

      parts.push(key + "=" + encodeURIComponent(String(props[key])));
    });

    return parts.join("|");
  }

  function getReferrer() {
    if (typeof window.oipAnalyticsEventReferrer === "function") {
      return window.oipAnalyticsEventReferrer() || "";
    }

    return document.referrer || "";
  }

  function buildEventPayload(eventName, props) {
    var path = buildEventPath(eventName, props);

    if (!path) {
      return null;
    }

    return {
      path: path,
      title: props.title || pageContext.title || eventName,
      referrer: getReferrer(),
      event: true
    };
  }

  function flushPendingCounts() {
    var payload;

    if (!isGoatCounterReady()) {
      return;
    }

    while (pendingCounts.length > 0) {
      payload = pendingCounts.shift();
      window.goatcounter.count(payload);
    }

    if (flushTimer) {
      window.clearInterval(flushTimer);
      flushTimer = 0;
    }
  }

  function ensureFlushTimer() {
    if (flushTimer) {
      return;
    }

    flushTimer = window.setInterval(flushPendingCounts, 250);
  }

  function datasetProps(node) {
    if (!node || !node.dataset) {
      return {};
    }

    return cleanProps({
      slug: node.dataset.analyticsSlug,
      title: node.dataset.analyticsTitle,
      section: node.dataset.analyticsSection,
      source_slot: node.dataset.analyticsSourceSlot,
      collection: node.dataset.analyticsCollection,
      path: node.dataset.analyticsPath
    });
  }

  function mergeProps(primary, secondary) {
    var merged = {};
    var key;

    [secondary || {}, primary || {}].forEach(function (source) {
      for (key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) {
          continue;
        }

        if (source[key] === null || source[key] === undefined || source[key] === "") {
          continue;
        }

        merged[key] = source[key];
      }
    });

    return merged;
  }

  function isExternalLink(url) {
    return !!(url && /^https?:$/i.test(url.protocol) && url.origin !== window.location.origin);
  }

  function trackReadProgress() {
    var target = document.querySelector("[data-analytics-eligible-read='true']");
    var activeMs = 0;
    var lastActiveAt = document.hidden ? 0 : Date.now();
    var maxScrollDepth = 0;
    var started = false;
    var completed = false;
    var intervalId;

    if (!target || !pageContext.eligibleRead) {
      return;
    }

    function flushActiveTime(now) {
      if (!lastActiveAt) {
        return;
      }

      activeMs += now - lastActiveAt;
      lastActiveAt = document.hidden ? 0 : now;
    }

    function updateScrollDepth() {
      var doc = document.documentElement;
      var scrollTop = window.pageYOffset || doc.scrollTop || 0;
      var viewed = scrollTop + window.innerHeight;
      var total = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
      var depth = total > 0 ? (viewed / total) * 100 : 100;

      if (depth > maxScrollDepth) {
        maxScrollDepth = Math.min(100, depth);
      }
    }

    function maybeTrack() {
      var activeSeconds = activeMs / 1000;
      var props = currentPageProps();

      if (!started && activeSeconds >= 15) {
        started = true;
        track("essay_read_start", props);
      }

      if (!completed && activeSeconds >= 90 && maxScrollDepth >= 75) {
        completed = true;
        track("essay_read", props);
        window.clearInterval(intervalId);
      }
    }

    updateScrollDepth();

    intervalId = window.setInterval(function () {
      var now = Date.now();

      flushActiveTime(now);
      maybeTrack();
    }, 1000);

    document.addEventListener("visibilitychange", function () {
      var now = Date.now();

      flushActiveTime(now);
      lastActiveAt = document.hidden ? 0 : now;
      maybeTrack();
    });

    window.addEventListener(
      "scroll",
      function () {
        updateScrollDepth();
        maybeTrack();
      },
      { passive: true }
    );

    window.addEventListener("pagehide", function () {
      flushActiveTime(Date.now());
      maybeTrack();
      window.clearInterval(intervalId);
    });
  }

  document.addEventListener(
    "submit",
    function (event) {
      var form = event.target;

      if (!form || !form.matches("[data-analytics-event='newsletter_submit']")) {
        return;
      }

      track("newsletter_submit", mergeProps(datasetProps(form), currentPageProps()));
    },
    true
  );

  document.addEventListener(
    "click",
    function (event) {
      var anchor = event.target.closest("a[href]");
      var url;
      var eventName;
      var props;

      if (!anchor) {
        return;
      }

      url = parseUrl(anchor.getAttribute("href"));

      if (isExternalLink(url)) {
        track("external_link_click", mergeProps(datasetProps(anchor), currentPageProps()));
        return;
      }

      eventName = anchor.dataset.analyticsEvent;
      if (!eventName) {
        return;
      }

      props = mergeProps(datasetProps(anchor), currentPageProps());
      track(eventName, props);
    },
    true
  );

  trackReadProgress();
  flushPendingCounts();
  window.addEventListener("load", flushPendingCounts);
}());
