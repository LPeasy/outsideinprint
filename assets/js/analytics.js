(function () {
  var config = window.oipAnalytics || {};
  var pageContext = config.page || {};
  var pendingCounts = [];
  var flushTimer = 0;
  var readinessDeadline = 0;
  var queueExpired = false;
  var hostname = window.location.hostname.toLowerCase();
  var localHost = /^(localhost|127(?:\.[0-9]{1,3}){3}|\[::1\])$/.test(hostname);
  var allowedHost = (hostname === "outsideinprint.org" && window.location.protocol === "https:") ||
    (config.allowLocal === true && localHost && /^https?:$/.test(window.location.protocol));
  config.enabled = config.enabled === true && allowedHost;
  var acquisition = config.enabled ? funnelAcquisition() : null;
  var sourceLabel = acquisition
    ? "almanack-organic|platform=" + acquisition.platform + "|segment=" + acquisition.segment + "|post=" + acquisition.post
    : classifySource();
  window.oipAnalyticsEventReferrer = function () {
    return sourceLabel;
  };
  window.goatcounter = window.goatcounter || {};
  window.goatcounter.no_events = true;
  window.goatcounter.allow_local = config.allowLocal === true;
  window.goatcounter.path = function () {
    return config.enabled ? internalPath(pageContext.path) || null : null;
  };
  window.goatcounter.referrer = window.oipAnalyticsEventReferrer;

  if (!config.enabled) {
    return;
  }

  // Only fixed campaign codes are retained. Never store or send arbitrary URL data.
  function validAcquisition(value) {
    var segments = ["weekend", "everyday-history", "dialogue"];
    return value && Object.keys(value).sort().join(",") === "expires,platform,post,segment" &&
      ["facebook", "instagram", "linkedin", "pinterest", "x"].indexOf(value.platform) !== -1 &&
      segments.indexOf(value.segment) !== -1 &&
      (["01", "02", "03", "04"].some(function (number) { return value.post === value.segment + "-" + number; }) ||
        value.post === value.segment + "-bio") &&
      typeof value.expires === "number" && Number.isFinite(value.expires) &&
      value.expires > Date.now() && value.expires <= Date.now() + 30 * 60 * 1000;
  }

  function funnelAcquisition() {
    var key = "oip.almanack-acquisition.v1";
    var params = new URLSearchParams(window.location.search);
    var segment = {
      "/subscribe/weekend/": "weekend",
      "/subscribe/everyday-history/": "everyday-history",
      "/subscribe/dialogue/": "dialogue"
    }[window.location.pathname];
    var value = null;
    var supplied = params.has("utm_campaign") || params.has("utm_source") || params.has("utm_content") || params.has("utm_medium");

    if (supplied) {
      if (segment && ["utm_campaign", "utm_source", "utm_content", "utm_medium"].every(function (name) { return params.getAll(name).length === 1; }) &&
          params.get("utm_campaign") === "almanack-organic" && params.get("utm_medium") === "organic_social") {
        value = {
          platform: params.get("utm_source"),
          segment: segment,
          post: params.get("utm_content"),
          expires: Date.now() + 30 * 60 * 1000
        };
        if (!validAcquisition(value)) {
          value = null;
        }
      }
      try {
        if (value) {
          window.sessionStorage.setItem(key, JSON.stringify(value));
        } else {
          window.sessionStorage.removeItem(key);
        }
      } catch (error) {
        // Storage denial must not affect navigation, signup, or this page's attribution.
      }
      return value;
    }

    try {
      value = JSON.parse(window.sessionStorage.getItem(key));
      if (validAcquisition(value)) {
        return value;
      }
      window.sessionStorage.removeItem(key);
    } catch (error) {
      // Missing, corrupt, or blocked storage falls back to ordinary source classification.
    }
    return null;
  }

  function matchesHost(host, domains) {
    return domains.some(function (domain) {
      return host === domain || host.slice(-(domain.length + 1)) === "." + domain;
    });
  }

  function classifySource() {
    var referrer;
    var referrerHost = "";
    var params;
    var campaign;
    var source;

    try {
      referrer = new URL(document.referrer);
      if (/^https?:$/.test(referrer.protocol)) {
        referrerHost = referrer.hostname.toLowerCase();
      }
    } catch (error) {
      referrerHost = "";
    }

    if (referrerHost && referrer.origin === window.location.origin) {
      return "internal";
    }

    try {
      params = new URLSearchParams(window.location.search);
      if (params.getAll("utm_campaign").length === 1 && params.getAll("utm_source").length === 1) {
        campaign = params.get("utm_campaign");
        source = params.get("utm_source");
        if (campaign === "2045-launch") {
          if (source === "buttondown") {
            return "newsletter-2045-launch";
          }
          if (["facebook", "instagram", "linkedin", "x"].indexOf(source) !== -1) {
            return "social-2045-launch";
          }
        }
      }
    } catch (error) {
      // Unrecognized query values never leave the browser.
    }

    if (!referrerHost) {
      return "direct_unknown";
    }
    if (matchesHost(referrerHost, ["chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "copilot.microsoft.com", "gemini.google.com"])) {
      return "ai_referral";
    }
    if (matchesHost(referrerHost, ["google.com", "google.co.uk", "google.ca", "google.com.au"])) {
      return "google";
    }
    if (matchesHost(referrerHost, ["bing.com"])) {
      return "bing";
    }
    if (matchesHost(referrerHost, ["buttondown.com", "buttondown.email"])) {
      return "newsletter";
    }
    if (matchesHost(referrerHost, ["facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com", "t.co"])) {
      return "social";
    }
    return "other";
  }

  function internalPath(value) {
    var parsed;
    if (!value) {
      return "";
    }
    parsed = parseUrl(String(value));
    if (!parsed || !/^https?:$/.test(parsed.protocol)) {
      return "";
    }
    if (parsed.origin !== "https://outsideinprint.org" && !(localHost && config.allowLocal === true && parsed.origin === window.location.origin)) {
      return "";
    }
    return parsed.pathname || "/";
  }

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
      flushPendingCounts();
      window.goatcounter.count(payload);
      return;
    }

    if (queueExpired || pendingCounts.length >= 40) {
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
      path: internalPath(pageContext.path)
    });
  }

  function isGoatCounterReady() {
    return !!(window.goatcounter && typeof window.goatcounter.count === "function");
  }

  function buildEventPath(eventName, props) {
    var keys = ["path", "slug", "section", "source_slot", "collection", "product", "format"];
    var parts = ["oip:" + eventName];

    props.path = internalPath(props.path);

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

    return "";
  }

  function buildEventPayload(eventName, props) {
    var path = buildEventPath(eventName, props);

    if (!path) {
      return null;
    }

    // Recheck expiry during long page visits as well as on navigation.
    if (acquisition && !validAcquisition(acquisition)) {
      acquisition = null;
      sourceLabel = classifySource();
      try { window.sessionStorage.removeItem("oip.almanack-acquisition.v1"); } catch (error) {}
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

    if (readinessDeadline && Date.now() >= readinessDeadline) {
      pendingCounts.length = 0;
      queueExpired = true;
      window.clearInterval(flushTimer);
      flushTimer = 0;
      readinessDeadline = 0;
      return;
    }

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
    readinessDeadline = 0;
  }

  function ensureFlushTimer() {
    if (flushTimer) {
      return;
    }

    readinessDeadline = Date.now() + 10000;
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
      product: node.dataset.analyticsProduct,
      format: node.dataset.analyticsFormat,
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

  function applyNewsletterAcquisition(form) {
    // Revalidate the original state. Calling funnelAcquisition here would restart
    // expiry on a tagged page. Disabled controls are omitted from native POSTs.
    var value = config.enabled && validAcquisition(acquisition) ? acquisition : null;
    var fields = {
      utm_campaign: value ? "almanack-organic" : "",
      utm_medium: value ? "organic_social" : "",
      utm_source: value ? value.platform : "",
      metadata__oip_segment: value ? value.segment : "",
      metadata__oip_post: value ? value.post : ""
    };
    Object.keys(fields).forEach(function (name) {
      var field = form.elements && form.elements[name];
      if (field && field.type === "hidden") {
        field.value = fields[name];
        field.disabled = !value;
      }
    });
  }

  document.addEventListener(
    "submit",
    function (event) {
      var form = event.target;

      var eventName;

      if (!form || !form.matches("[data-analytics-event]")) {
        return;
      }

      eventName = form.dataset.analyticsEvent;
      if (!eventName) {
        return;
      }

      if (eventName === "newsletter_submit") {
        applyNewsletterAcquisition(form);
      }
      track(eventName, mergeProps(datasetProps(form), currentPageProps()));
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
      eventName = anchor.dataset.analyticsEvent;

      if (eventName) {
        props = mergeProps(datasetProps(anchor), currentPageProps());
        track(eventName, props);
        return;
      }

      if (isExternalLink(url)) {
        track("external_link_click", mergeProps(datasetProps(anchor), currentPageProps()));
        return;
      }
    },
    true
  );

  if (/^\/subscribe\/(weekend|everyday-history|dialogue)\/$/.test(pageContext.path || "")) {
    track("funnel_view", currentPageProps());
  }
  trackReadProgress();
  flushPendingCounts();
  window.addEventListener("load", flushPendingCounts);
}());
