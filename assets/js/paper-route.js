(function () {
  var STORAGE_KEY = "oip-paper-route:v2";
  var ACTIVE_GAME = null;
  var BOB_FRAME = {
    rideStraight: 0,
    leanRight: 1,
    rideStraightAlt: 2,
    leanLeft: 3,
    throwLeft: 4,
    throwRight: 5,
    throwLeftLean: 6,
    throwRightLean: 7,
    airThrowLeft: 8,
    airThrowRight: 9,
    airbornePeak: 13,
    airborneHold: 15,
    wheelieStart: 18,
    wheelieRise: 19,
    wheeliePeak: 21,
    wheelieHold: 23,
    puddleSplash: 27,
    puddleWobble: 28,
    puddleLoss: 30,
    puddleRecover: 32,
    runEndStart: 34,
    runEndLast: 41
  };
  var RAMP_FRAMES = ["ramp_wood", "ramp_metal"];
  var ROAD_DECAL_CONFIGS = [
    { frame: "road_crack", width: 54, alpha: .34 },
    { frame: "road_tire_scuffs", width: 64, alpha: .24 }
  ];
  var TRACK_ROAD_SEAM_OVERLAP = 1;
  var TRACK_SEGMENT_FRAMES = {
    left: ["track_left_01", "track_left_02", "track_left_03", "track_left_04", "track_left_05", "track_left_06"],
    right: ["track_right_01", "track_right_02", "track_right_03", "track_right_04", "track_right_05", "track_right_06"]
  };
  var TRACK_LOT_TARGETS = {
    left: [
      {
        mailbox: { x: .73, y: .77, width: 38, height: 44 },
        doorstep: { x: .34, y: .5, width: 58, height: 42 },
        window: { x: .2, y: .4, width: 42, height: 38 }
      },
      {
        mailbox: { x: .76, y: .78, width: 38, height: 44 },
        doorstep: { x: .54, y: .51, width: 58, height: 42 },
        window: { x: .34, y: .4, width: 42, height: 38 }
      },
      {
        mailbox: { x: .73, y: .74, width: 38, height: 44 },
        doorstep: { x: .33, y: .5, width: 58, height: 42 },
        window: { x: .2, y: .41, width: 42, height: 38 }
      },
      {
        mailbox: { x: .73, y: .77, width: 38, height: 44 },
        doorstep: { x: .34, y: .5, width: 58, height: 42 },
        window: { x: .2, y: .4, width: 42, height: 38 }
      },
      {
        mailbox: { x: .76, y: .78, width: 38, height: 44 },
        doorstep: { x: .54, y: .51, width: 58, height: 42 },
        window: { x: .34, y: .4, width: 42, height: 38 }
      },
      {
        mailbox: { x: .73, y: .74, width: 38, height: 44 },
        doorstep: { x: .33, y: .5, width: 58, height: 42 },
        window: { x: .2, y: .41, width: 42, height: 38 }
      }
    ],
    right: [
      {
        mailbox: { x: .33, y: .76, width: 38, height: 44 },
        doorstep: { x: .55, y: .48, width: 58, height: 42 },
        window: { x: .42, y: .31, width: 42, height: 38 }
      },
      {
        mailbox: { x: .29, y: .76, width: 38, height: 44 },
        doorstep: { x: .53, y: .51, width: 58, height: 42 },
        window: { x: .62, y: .28, width: 42, height: 38 }
      },
      {
        mailbox: { x: .28, y: .72, width: 38, height: 44 },
        doorstep: { x: .55, y: .58, width: 58, height: 42 },
        window: { x: .53, y: .39, width: 42, height: 38 }
      },
      {
        mailbox: { x: .33, y: .76, width: 38, height: 44 },
        doorstep: { x: .55, y: .48, width: 58, height: 42 },
        window: { x: .42, y: .31, width: 42, height: 38 }
      },
      {
        mailbox: { x: .29, y: .76, width: 38, height: 44 },
        doorstep: { x: .53, y: .51, width: 58, height: 42 },
        window: { x: .62, y: .28, width: 42, height: 38 }
      },
      {
        mailbox: { x: .28, y: .72, width: 38, height: 44 },
        doorstep: { x: .55, y: .58, width: 58, height: 42 },
        window: { x: .53, y: .39, width: 42, height: 38 }
      }
    ]
  };
  var TRACK_SEGMENT_SLOTS = [
    { y: 0, height: 600 / 1280 },
    { y: 640 / 1280, height: 600 / 1280 }
  ];
  var TRACK_SEGMENT_LOT_SEQUENCE = {
    left: [[0, 1], [2, 0], [1, 2], [0, 2], [1, 0], [2, 1]],
    right: [[0, 1], [2, 0], [1, 2], [0, 2], [1, 0], [2, 1]]
  };

  function buildTrackTargetGroup(targets, slot) {
    var group = {};

    ["mailbox", "doorstep", "window"].forEach(function (type) {
      group[type] = {
        x: targets[type].x,
        y: slot.y + targets[type].y * slot.height,
        width: targets[type].width,
        height: targets[type].height
      };
    });

    return group;
  }

  function buildTrackSegmentConfigs(side) {
    var frames = TRACK_SEGMENT_FRAMES[side] || [];
    var lots = TRACK_LOT_TARGETS[side] || [];
    var sequence = TRACK_SEGMENT_LOT_SEQUENCE[side] || [];

    return frames.map(function (frame, index) {
      var pair = sequence[index % sequence.length] || [index % lots.length, (index + 1) % lots.length];

      return {
        frame: frame,
        targetGroups: [
          buildTrackTargetGroup(lots[pair[0] % lots.length], TRACK_SEGMENT_SLOTS[0]),
          buildTrackTargetGroup(lots[pair[1] % lots.length], TRACK_SEGMENT_SLOTS[1])
        ]
      };
    });
  }

  var TRACK_SEGMENT_CONFIGS = {
    left: buildTrackSegmentConfigs("left"),
    right: buildTrackSegmentConfigs("right")
  };
  var INTRO_DURATION = 8.5;
  var INTRO_RIDE_FRAMES = ["intro_bob_ride_front_01", "intro_bob_ride_front_02", "intro_bob_ride_front_03", "intro_bob_ride_front_04", "intro_bob_ride_front_05", "intro_bob_ride_front_06"];
  var SPOT_SIDE_FRAMES = ["spot_run_side_01", "spot_run_side_02", "spot_run_side_03", "spot_run_side_04", "spot_run_side_05", "spot_run_side_06"];
  var SPOT_RUN_PAPER_SIDE_FRAMES = ["spot_run_paper_side_01", "spot_run_paper_side_02", "spot_run_paper_side_03", "spot_run_paper_side_04", "spot_run_paper_side_05", "spot_run_paper_side_06"];
  var SPOT_FRONT_FRAMES = ["spot_run_front_01", "spot_run_front_02", "spot_run_front_03"];
  var SPOT_BACK_FRAMES = ["spot_run_back_01", "spot_run_back_02", "spot_run_back_03"];
  var POOL_SIZES = {
    trackSegments: 12,
    targets: 72,
    papers: 5,
    ramps: 4,
    puddles: 5,
    spots: 1,
    roadDecals: 8,
    hitFlashes: 8,
    puddleSplashes: 6,
    floatTexts: 10
  };
  var TUNING = {
    baseSpeed: 178,
    speedRamp: 2.05,
    speedCapBonus: 118,
    slowMultiplier: .65,
    steerSpeed: 270,
    verticalSteerSpeed: 155,
    paperSpeed: 520,
    paperLift: -92,
    paperCooldown: 280,
    touchPaperCooldown: 340,
    maxActivePapers: 5,
    targetBaseInterval: 1280,
    targetRamp: 6,
    targetMinInterval: 820,
    targetJitter: 360,
    puddleBaseInterval: 3300,
    puddleRamp: 5,
    puddleMinInterval: 2150,
    puddleJitter: 720,
    rampBaseInterval: 5600,
    rampRamp: 4,
    rampMinInterval: 3900,
    rampJitter: 900,
    roadDecalBaseInterval: 1650,
    roadDecalMinInterval: 980,
    roadDecalJitter: 1050,
    firstTargetDelay: 420,
    firstPuddleDelay: 2300,
    firstRampDelay: 3900,
    spotFirstDelay: 8000,
    spotInterval: 12000,
    spotSpeed: 360,
    spotPaperSpeed: 390,
    playerDisplay: { width: 96, height: 96 },
    playerBody: { width: 88, height: 104 },
    trackSegmentSpawnBuffer: 90,
    rampDisplay: { width: 72, height: 134 },
    rampBody: { width: 64, height: 70 },
    paperBody: { width: 21, height: 13 },
    paperDisplay: { width: 32, height: 20 },
    puddleDisplay: { width: 82, height: 34 },
    spotDisplay: { width: 108, height: 72 },
    spotBody: { width: 82, height: 42 },
    spotVerticalJitter: 60,
    spotBounceDistance: 34,
    spotBounceLift: 10,
    spotBounceDuration: 150,
    spotOffscreenRelease: 110,
    hitFlashDisplay: { width: 68, height: 68 }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function browserSupportsWebp() {
    var canvas;

    try {
      canvas = document.createElement("canvas");
      return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    } catch (error) {
      return false;
    }
  }

  function readHighScore() {
    var raw;
    var value;

    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      raw = "";
    }

    value = parseInt(raw || "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function writeHighScore(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.round(value))));
    } catch (error) {
      // Private browsing can block local storage; the run still plays.
    }
  }

  function setText(node, value) {
    if (node) {
      node.textContent = String(value);
    }
  }

  function RouteAudio() {
    this.context = null;
    this.master = null;
  }

  RouteAudio.prototype.ensure = function () {
    var AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return null;
    }

    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = .18;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }

    return this.context;
  };

  RouteAudio.prototype.play = function (name) {
    var context = this.ensure();
    var now;
    var settings = {
      throw: [520, .045, "square"],
      mailbox: [740, .08, "triangle"],
      doorstep: [620, .09, "triangle"],
      window: [920, .11, "sawtooth"],
      ramp: [460, .16, "triangle"],
      puddle: [170, .13, "sine"],
      clear: [820, .12, "triangle"],
      jump: [560, .08, "triangle"],
      wheelie: [390, .035, "square"],
      miss: [210, .08, "sine"],
      start: [660, .12, "triangle"],
      end: [330, .16, "sine"],
      record: [880, .2, "triangle"]
    }[name] || [440, .08, "triangle"];
    var oscillator;
    var gain;

    if (!context || !this.master) {
      return;
    }

    now = context.currentTime;
    oscillator = context.createOscillator();
    gain = context.createGain();
    oscillator.type = settings[2];
    oscillator.frequency.setValueAtTime(settings[0], now);
    if (name === "ramp" || name === "record") {
      oscillator.frequency.exponentialRampToValueAtTime(settings[0] * 1.45, now + settings[1]);
    } else if (name === "puddle" || name === "miss") {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, settings[0] * .55), now + settings[1]);
    }
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.82, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + settings[1]);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + settings[1] + .03);
  };

  function PaperRouteGame(options) {
    this.options = options || {};
    this.root = this.options.root;
    this.container = this.options.container;
    this.bobSrc = this.options.bobSrc || "";
    this.bobSheetSrc = this.options.bobSheetSrc || "";
    this.bobSheetWebpSrc = this.options.bobSheetWebpSrc || "";
    this.paperSrc = this.options.paperSrc || "";
    this.paperWebpSrc = this.options.paperWebpSrc || "";
    this.puddleSrc = this.options.puddleSrc || "";
    this.puddleWebpSrc = this.options.puddleWebpSrc || "";
    this.puddleSplashSrc = this.options.puddleSplashSrc || "";
    this.puddleSplashWebpSrc = this.options.puddleSplashWebpSrc || "";
    this.mailboxHitSrc = this.options.mailboxHitSrc || "";
    this.mailboxHitWebpSrc = this.options.mailboxHitWebpSrc || "";
    this.doorstepHitSrc = this.options.doorstepHitSrc || "";
    this.doorstepHitWebpSrc = this.options.doorstepHitWebpSrc || "";
    this.windowHitSrc = this.options.windowHitSrc || "";
    this.windowHitWebpSrc = this.options.windowHitWebpSrc || "";
    this.propsAtlasSrc = this.options.propsAtlasSrc || "";
    this.propsAtlasWebpSrc = this.options.propsAtlasWebpSrc || "";
    this.propsAtlasJsonSrc = this.options.propsAtlasJsonSrc || "";
    this.lotsAtlasSrc = this.options.lotsAtlasSrc || "";
    this.lotsAtlasWebpSrc = this.options.lotsAtlasWebpSrc || "";
    this.lotsAtlasJsonSrc = this.options.lotsAtlasJsonSrc || "";
    this.trackAtlasSrc = this.options.trackAtlasSrc || "";
    this.trackAtlasWebpSrc = this.options.trackAtlasWebpSrc || "";
    this.trackAtlasJsonSrc = this.options.trackAtlasJsonSrc || "";
    this.introAtlasSrc = this.options.introAtlasSrc || "";
    this.introAtlasWebpSrc = this.options.introAtlasWebpSrc || "";
    this.introAtlasJsonSrc = this.options.introAtlasJsonSrc || "";
    this.stage = this.container && this.container.closest ? this.container.closest(".paper-route-stage") : null;
    this.status = this.options.status;
    this.scoreNode = this.options.score;
    this.papersNode = this.options.papers;
    this.timeNode = this.options.time;
    this.highNode = this.options.high;
    this.muteButton = this.options.muteButton;
    this.pauseButton = this.options.pauseButton;
    this.restartButton = this.options.restartButton;
    this.startButton = this.options.startButton;
    this.introPanel = this.options.introPanel;
    this.introProgress = this.options.introProgress;
    this.skipIntroButton = this.options.skipIntroButton;
    this.startCard = this.options.startCard;
    this.pauseCard = this.options.pauseCard;
    this.summaryCard = this.options.summaryCard;
    this.summaryTitle = this.options.summaryTitle;
    this.summaryCopy = this.options.summaryCopy;
    this.summaryMetrics = this.options.summaryMetrics;
    this.summaryRestart = this.options.summaryRestart;
    this.touchPanel = this.options.touchPanel;
    this.touchControls = this.options.touchControls || [];
    this.highScore = readHighScore();
    this.rules = window.OipPaperRouteRules.create({ highScore: this.highScore });
    this.audio = new RouteAudio();
    this.muted = false;
    this.themeObserver = null;
    this.scene = null;
    this.game = null;
    this.background = null;
    this.roadSurface = null;
    this.roadCenterLine = null;
    this.roadLeftCurb = null;
    this.roadRightCurb = null;
    this.roadDecals = null;
    this.targets = null;
    this.trackSegments = null;
    this.ramps = null;
    this.puddles = null;
    this.spots = null;
    this.papers = null;
    this.player = null;
    this.finalScoreText = null;
    this.introLayer = null;
    this.introObjects = {};
    this.keys = {};
    this.heldLeft = false;
    this.heldRight = false;
    this.heldUp = false;
    this.heldDown = false;
    this.trickHeld = false;
    this.throwCooldown = 0;
    this.targetTimer = 0;
    this.puddleTimer = 0;
    this.spotTimer = 0;
    this.rampTimer = 0;
    this.roadDecalTimer = 0;
    this.targetSpawnCount = 0;
    this.rampSpawnCount = 0;
    this.rampFrameOffset = Math.floor(Math.random() * RAMP_FRAMES.length);
    this.trackSegmentFrameOffset = {
      left: Math.floor(Math.random() * TRACK_SEGMENT_FRAMES.left.length),
      right: Math.floor(Math.random() * TRACK_SEGMENT_FRAMES.right.length)
    };
    this.trackSegmentCursor = {
      left: 0,
      right: 0
    };
    this.routeOffset = 0;
    this.introMode = "loading-runtime";
    this.introElapsed = 0;
    this.introPrepComplete = false;
    this.introComplete = false;
    this.routeAssetsStarted = false;
    this.routeAssetsReady = false;
    this.routeAssetsFailed = false;
    this.routeLoadProgress = 0;
    this.objectPools = {};
    this.poolStats = {};
    this.playerPose = "";
    this.poseHoldUntil = 0;
    this.heldPose = "";
    this.finishSequenceId = 0;
    this.lastSummaryMetrics = [];
    this.basePlayerX = 0;
    this.basePlayerY = 0;
    this.width = 480;
    this.height = 853;
    this.roadLeft = 150;
    this.roadRight = 330;
    this.cleanup = [];
    this.reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.webpSupported = browserSupportsWebp();

    this.bindDom();
    this.setTouchPanel(false);
    this.createPhaserGame();
    this.observeTheme();
    this.syncAudioButton();
    this.syncHud("Bag packed. Load the morning edition.");
  }

  PaperRouteGame.prototype.bind = function (node, eventName, handler) {
    if (!node) {
      return;
    }

    node.addEventListener(eventName, handler);
    this.cleanup.push(function () {
      node.removeEventListener(eventName, handler);
    });
  };

  PaperRouteGame.prototype.bindDom = function () {
    var self = this;

    this.bind(this.startButton, "click", function () {
      self.start();
    });
    this.bind(this.skipIntroButton, "click", function () {
      self.skipIntro();
    });
    this.bind(this.summaryRestart, "click", function () {
      self.start();
    });
    this.bind(this.restartButton, "click", function () {
      self.start();
    });
    this.bind(this.pauseButton, "click", function () {
      self.togglePause();
    });
    this.bind(this.muteButton, "click", function () {
      self.toggleMute();
    });

    this.touchControls.forEach(function (button) {
      var action = button.getAttribute("data-paper-route-action") || "";
      self.bind(button, "pointerdown", function (event) {
        event.preventDefault();
        button.setPointerCapture && button.setPointerCapture(event.pointerId);
        self.handleAction(action, true);
      });
      self.bind(button, "pointerup", function (event) {
        event.preventDefault();
        self.handleAction(action, false);
      });
      self.bind(button, "pointercancel", function () {
        self.handleAction(action, false);
      });
      self.bind(button, "pointerleave", function () {
        self.handleAction(action, false);
      });
    });

    this.bind(this.root, "keydown", function (event) {
      self.handleDomKey(event, true);
    });
    this.bind(this.root, "keyup", function (event) {
      self.handleDomKey(event, false);
    });
  };

  PaperRouteGame.prototype.handleDomKey = function (event, pressed) {
    var key = event.key || "";
    var target = event.target;
    var buttonTarget = target && target.closest && target.closest("button");
    var handled = false;

    if (!pressed) {
      if (key === "ArrowLeft" || key === "a" || key === "A") {
        this.heldLeft = false;
        handled = true;
      } else if (key === "ArrowRight" || key === "d" || key === "D") {
        this.heldRight = false;
        handled = true;
      } else if (key === "ArrowUp" || key === "w" || key === "W") {
        this.heldUp = false;
        handled = true;
      } else if (key === "ArrowDown" || key === "s" || key === "S") {
        this.heldDown = false;
        handled = true;
      } else if (key === "Shift" || key === "k" || key === "K") {
        this.stopWheelie();
        handled = true;
      }

      if (handled) {
        event.preventDefault();
      }
      return;
    }

    if (key === "ArrowLeft" || key === "a" || key === "A") {
      this.heldLeft = true;
      handled = true;
    } else if (key === "ArrowRight" || key === "d" || key === "D") {
      this.heldRight = true;
      handled = true;
    } else if (key === "ArrowUp" || key === "w" || key === "W") {
      this.heldUp = true;
      handled = true;
    } else if (key === "ArrowDown" || key === "s" || key === "S") {
      this.heldDown = true;
      handled = true;
    } else if ((key === "q" || key === "Q" || key === "j" || key === "J") && !buttonTarget) {
      this.throwPaper("left", false);
      handled = true;
    } else if ((key === "e" || key === "E" || key === "l" || key === "L") && !buttonTarget) {
      this.throwPaper("right", false);
      handled = true;
    } else if (key === " " && !buttonTarget) {
      this.startHop();
      handled = true;
    } else if (key === "Shift" || key === "k" || key === "K") {
      this.startWheelie();
      handled = true;
    } else if (key === "p" || key === "P") {
      this.togglePause();
      handled = true;
    } else if (key === "r" || key === "R") {
      this.start();
      handled = true;
    }

    if (handled) {
      event.preventDefault();
    }
  };

  PaperRouteGame.prototype.handleAction = function (action, pressed) {
    if (action === "steer-left") {
      this.heldLeft = pressed;
    } else if (action === "steer-right") {
      this.heldRight = pressed;
    } else if (pressed && action === "throw-left") {
      this.throwPaper("left", true);
    } else if (pressed && action === "throw-right") {
      this.throwPaper("right", true);
    } else if (pressed && action === "jump") {
      this.startHop();
    } else if (action === "trick") {
      if (pressed) {
        this.startWheelie();
      } else {
        this.stopWheelie();
      }
    }
  };

  PaperRouteGame.prototype.syncAudioButton = function () {
    if (this.root) {
      this.root.classList.toggle("paper-route-overlay--muted", this.muted);
    }

    if (!this.muteButton) {
      return;
    }

    this.muteButton.textContent = this.muted ? "Audio: Muted" : "Audio: On";
    this.muteButton.setAttribute("aria-label", this.muted ? "Turn Paper-Bob sound on" : "Mute Paper-Bob sound");
    this.muteButton.setAttribute("aria-pressed", this.muted ? "true" : "false");
  };

  PaperRouteGame.prototype.toggleMute = function () {
    this.muted = !this.muted;
    this.syncAudioButton();

    if (!this.muted) {
      this.playSound("mailbox");
    }

    this.syncHud(this.muted ? "Audio muted." : "Audio on.");
  };

  PaperRouteGame.prototype.playSound = function (name) {
    if (!this.muted && this.audio) {
      this.audio.play(name);
    }
  };

  PaperRouteGame.prototype.setTouchPanel = function (visible) {
    if (this.touchPanel) {
      this.touchPanel.hidden = !visible;
    }
  };

  PaperRouteGame.prototype.summaryMetricItems = function (state) {
    var deliveries = (state && state.deliveries) || {};
    var puddlesCleared = (state && state.puddlesCleared) || 0;
    var puddleHits = (state && state.puddleHits) || 0;

    return [
      { key: "mailbox", value: deliveries.mailbox || 0, label: "Mailboxes" },
      { key: "doorstep", value: deliveries.doorstep || 0, label: "Doorsteps" },
      { key: "window", value: deliveries.window || 0, label: "Windows" },
      { key: "ramp", value: (state && state.rampsTaken) || 0, label: "Ramps" },
      {
        key: "puddle",
        value: puddlesCleared + "/" + puddleHits,
        label: "Puddles",
        aria: "Puddles cleared " + puddlesCleared + "; puddles hit " + puddleHits
      },
      { key: "papers", value: (state && state.papers) || 0, label: "Papers left" }
    ];
  };

  PaperRouteGame.prototype.renderSummaryMetrics = function (state) {
    var items = this.summaryMetricItems(state);
    var node = this.summaryMetrics;

    this.lastSummaryMetrics = items.map(function (item) {
      return {
        key: item.key,
        value: String(item.value),
        label: item.label
      };
    });

    if (!node) {
      return;
    }

    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }

    items.forEach(function (item) {
      var tile = document.createElement("span");
      var icon = document.createElement("span");
      var value = document.createElement("strong");

      tile.className = "paper-route-result-tile paper-route-result-tile--" + item.key;
      tile.setAttribute("role", "listitem");
      tile.setAttribute("aria-label", item.aria || (item.label + ": " + item.value));
      icon.className = "paper-route-result-icon";
      icon.setAttribute("aria-hidden", "true");
      value.textContent = item.value;
      tile.appendChild(icon);
      tile.appendChild(value);
      node.appendChild(tile);
    });
  };

  PaperRouteGame.prototype.clearSummaryMetrics = function () {
    this.lastSummaryMetrics = [];
    if (!this.summaryMetrics) {
      return;
    }
    while (this.summaryMetrics.firstChild) {
      this.summaryMetrics.removeChild(this.summaryMetrics.firstChild);
    }
  };

  PaperRouteGame.prototype.clearFinalScore = function () {
    if (!this.finalScoreText) {
      return;
    }
    if (this.scene && this.scene.tweens) {
      this.scene.tweens.killTweensOf(this.finalScoreText);
    }
    this.finalScoreText.setVisible(false);
    this.finalScoreText.setText("");
    this.finalScoreText.setAlpha(1);
    this.finalScoreText.setScale(1);
  };

  PaperRouteGame.prototype.showFinalScore = function (score) {
    var x;
    var y;

    if (!this.finalScoreText) {
      return;
    }

    x = this.player ? this.player.x : this.width * .5;
    y = this.player ? this.player.y - 116 : this.height * .62;
    this.finalScoreText.setText(String(Math.max(0, Math.round(score || 0))));
    this.finalScoreText.setPosition(x, y);
    this.finalScoreText.setVisible(true);

    if (this.reducedMotion || !this.scene || !this.scene.tweens) {
      this.finalScoreText.setAlpha(1);
      this.finalScoreText.setScale(1);
      return;
    }

    this.finalScoreText.setAlpha(0);
    this.finalScoreText.setScale(.78);
    this.scene.tweens.add({
      targets: this.finalScoreText,
      alpha: 1,
      scale: 1,
      duration: 360,
      ease: "Back.Out"
    });
  };

  PaperRouteGame.prototype.createPhaserGame = function () {
    var self = this;

    this.game = new window.Phaser.Game({
      type: window.Phaser.CANVAS,
      parent: this.container,
      width: 480,
      height: 853,
      backgroundColor: "#eadbc4",
      scale: {
        mode: window.Phaser.Scale.FIT,
        autoCenter: window.Phaser.Scale.CENTER_BOTH
      },
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
          gravity: { y: 0 }
        }
      },
      scene: [{
        key: "PaperRouteScene",
        preload: function () {
          self.preloadScene(this);
        },
        create: function () {
          self.createScene(this);
        },
        update: function (time, delta) {
          self.updateScene(time, delta);
        }
      }]
    });
  };

  PaperRouteGame.prototype.assetSrc = function (fallbackSrc, webpSrc) {
    return this.webpSupported && webpSrc ? webpSrc : fallbackSrc;
  };

  PaperRouteGame.prototype.preloadScene = function (scene) {
    if (this.introAtlasSrc && this.introAtlasJsonSrc) {
      scene.load.atlas("paperBobIntro", this.assetSrc(this.introAtlasSrc, this.introAtlasWebpSrc), this.introAtlasJsonSrc);
    }
  };

  PaperRouteGame.prototype.createScene = function (scene) {
    var self = this;
    var playerTexture;

    this.scene = scene;
    this.background = scene.add.graphics();
    this.generateTextures(scene);
    this.createBobAnimations(scene);
    this.createIntroAnimations(scene);
    this.roadDecals = scene.add.group();
    this.targets = scene.physics.add.group();
    this.trackSegments = scene.add.group();
    this.ramps = scene.physics.add.group();
    this.puddles = scene.physics.add.group();
    this.spots = scene.physics.add.group();
    this.papers = scene.physics.add.group();
    this.createRoadKitObjects(scene);
    playerTexture = scene.textures.exists("paperBobSheet") ? "paperBobSheet" : (scene.textures.exists("paperBobSprite") ? "paperBobSprite" : "paperRouteCourierFallback");
    this.player = scene.physics.add.sprite(0, 0, playerTexture, 0);
    this.player.setDepth(18);
    this.player.setOrigin(.5, .72);
    this.setPlayerDisplaySize(1);
    this.setPlayerPose("ride");
    this.player.body.setSize(TUNING.playerBody.width, TUNING.playerBody.height, true);
    this.finalScoreText = scene.add.text(0, 0, "", {
      color: "#fff8e8",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: "34px",
      fontStyle: "bold",
      stroke: "#2b2117",
      strokeThickness: 7,
      shadow: { offsetX: 0, offsetY: 4, color: "rgba(47,31,17,.36)", blur: 6, fill: true }
    });
    this.finalScoreText.setOrigin(.5);
    this.finalScoreText.setDepth(52);
    this.finalScoreText.setVisible(false);

    this.keys.up = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.UP);
    this.keys.down = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keys.left = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keys.right = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keys.w = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.W);
    this.keys.a = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.A);
    this.keys.s = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.S);
    this.keys.d = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.D);
    this.keys.q = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.Q);
    this.keys.e = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.E);
    this.keys.j = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.J);
    this.keys.l = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.L);
    this.keys.space = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keys.shift = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keys.k = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.K);
    this.keys.p = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.P);
    this.keys.r = scene.input.keyboard.addKey(window.Phaser.Input.Keyboard.KeyCodes.R);

    scene.physics.add.overlap(this.papers, this.targets, function (paper, target) {
      self.scoreDelivery(paper, target);
    });
    scene.physics.add.overlap(this.player, this.ramps, function (player, ramp) {
      self.takeRamp(ramp);
    });
    scene.physics.add.overlap(this.player, this.puddles, function (player, puddle) {
      self.hitPuddle(puddle);
    });
    scene.physics.add.overlap(this.player, this.spots, function (player, spot) {
      self.hitSpot(spot);
    });
    scene.scale.on("resize", function () {
      self.layoutScene();
    });

    this.layoutScene();
    this.beginIntro();
  };

  PaperRouteGame.prototype.createBobAnimations = function (scene) {
    function frames(frameNumbers) {
      return frameNumbers.map(function (frame) {
        return { key: "paperBobSheet", frame: frame };
      });
    }

    function create(key, frameNumbers, frameRate, repeat) {
      if (!scene.textures.exists("paperBobSheet") || scene.anims.exists(key)) {
        return;
      }

      scene.anims.create({
        key: key,
        frames: frames(frameNumbers),
        frameRate: frameRate,
        repeat: repeat
      });
    }

    create("bobRide", [BOB_FRAME.rideStraight, BOB_FRAME.rideStraightAlt], 5, -1);
    create("bobAirborne", [BOB_FRAME.airbornePeak, BOB_FRAME.airborneHold], 5, -1);
    create("bobWheelieRise", [BOB_FRAME.wheelieStart, BOB_FRAME.wheelieRise, BOB_FRAME.wheeliePeak, BOB_FRAME.wheelieHold], 10, 0);
    create("bobPuddleHit", [BOB_FRAME.puddleSplash, BOB_FRAME.puddleWobble, BOB_FRAME.puddleLoss, BOB_FRAME.puddleRecover], 7, 0);
    create("bobRunEnd", [34, 35, 36, 37, 38, 39, 40, 41], 4, 0);
  };

  PaperRouteGame.prototype.createIntroAnimations = function (scene) {
    function atlasFrames(frameNames) {
      return frameNames.map(function (frame) {
        return { key: "paperBobIntro", frame: frame };
      });
    }

    function create(key, frameNames, frameRate, repeat) {
      if (!scene.textures.exists("paperBobIntro") || scene.anims.exists(key)) {
        return;
      }
      scene.anims.create({
        key: key,
        frames: atlasFrames(frameNames),
        frameRate: frameRate,
        repeat: repeat
      });
    }

    create("introBobRideFront", INTRO_RIDE_FRAMES, 7, -1);
    create("spotRunSide", SPOT_SIDE_FRAMES, 8, -1);
    create("spotRunPaperSide", SPOT_RUN_PAPER_SIDE_FRAMES, 8, -1);
    create("spotRunFront", SPOT_FRONT_FRAMES, 8, -1);
    create("spotRunBack", SPOT_BACK_FRAMES, 8, -1);
  };

  PaperRouteGame.prototype.hasBobSheet = function () {
    return !!(this.scene && this.scene.textures.exists("paperBobSheet"));
  };

  PaperRouteGame.prototype.hasRoutePropsAtlas = function () {
    return !!(this.scene && this.scene.textures.exists("paperRouteProps"));
  };

  PaperRouteGame.prototype.hasLotsAtlas = function () {
    return !!(this.scene && this.scene.textures.exists("paperBobLots"));
  };

  PaperRouteGame.prototype.hasTrackAtlas = function () {
    return !!(this.scene && this.scene.textures.exists("paperBobTrack"));
  };

  PaperRouteGame.prototype.hasIntroAtlas = function () {
    return !!(this.scene && this.scene.textures.exists("paperBobIntro"));
  };

  PaperRouteGame.prototype.hasRoutePropsFrame = function (frameName) {
    return !!(this.hasRoutePropsAtlas() && this.scene.textures.getFrame("paperRouteProps", frameName));
  };

  PaperRouteGame.prototype.hasLotsFrame = function (frameName) {
    return !!(this.hasLotsAtlas() && this.scene.textures.getFrame("paperBobLots", frameName));
  };

  PaperRouteGame.prototype.hasTrackFrame = function (frameName) {
    return !!(this.hasTrackAtlas() && this.scene.textures.getFrame("paperBobTrack", frameName));
  };

  PaperRouteGame.prototype.hasIntegratedTrackAtlas = function () {
    return this.hasTrackFrame(TRACK_SEGMENT_FRAMES.left[0]) && this.hasTrackFrame(TRACK_SEGMENT_FRAMES.right[0]);
  };

  PaperRouteGame.prototype.createRoadKitObjects = function (scene) {
    var roadFrame;

    if (this.roadSurface || !this.hasRoutePropsFrame("road_surface") || !this.hasRoutePropsFrame("road_center_dashes")) {
      return;
    }

    roadFrame = scene.textures.getFrame("paperRouteProps", "road_surface");
    this.roadSurface = scene.add.tileSprite(0, 0, roadFrame.width, this.height, "paperRouteProps", "road_surface");
    this.roadSurface.setOrigin(0, 0);
    this.roadSurface.setDepth(2);
    this.roadSurface.setAlpha(.98);

    this.roadCenterLine = scene.add.tileSprite(0, 0, 26, this.height, "paperRouteProps", "road_center_dashes");
    this.roadCenterLine.setOrigin(.5, 0);
    this.roadCenterLine.setDepth(3);
    this.roadCenterLine.setAlpha(.9);

    if (this.hasRoutePropsFrame("road_curb_left")) {
      this.roadLeftCurb = scene.add.tileSprite(0, 0, scene.textures.getFrame("paperRouteProps", "road_curb_left").width, this.height, "paperRouteProps", "road_curb_left");
      this.roadLeftCurb.setOrigin(0, 0);
      this.roadLeftCurb.setDepth(4);
    }

    if (this.hasRoutePropsFrame("road_curb_right")) {
      this.roadRightCurb = scene.add.tileSprite(0, 0, scene.textures.getFrame("paperRouteProps", "road_curb_right").width, this.height, "paperRouteProps", "road_curb_right");
      this.roadRightCurb.setOrigin(0, 0);
      this.roadRightCurb.setDepth(4);
    }

    this.layoutRoadKitObjects();
  };

  PaperRouteGame.prototype.layoutRoadKitObjects = function () {
    var roadWidth = this.roadRight - this.roadLeft;
    var curbWidth = clamp(this.width * .09, 36, 54);
    var edgeOverlap = TRACK_ROAD_SEAM_OVERLAP;
    var integratedTrackActive = this.hasIntegratedTrackAtlas();
    var centerFrame;
    var roadFrame;

    if (!this.scene) {
      return;
    }
    if (!this.roadSurface) {
      this.createRoadKitObjects(this.scene);
    }
    if (!this.roadSurface) {
      return;
    }

    this.roadSurface.setPosition(this.roadLeft, 0);
    roadFrame = this.scene.textures.getFrame("paperRouteProps", "road_surface");
    this.roadSurface.setSize(roadFrame ? roadFrame.width : roadWidth, this.height);
    this.roadSurface.setScale(roadWidth / (roadFrame ? roadFrame.width : roadWidth), 1);

    if (this.roadCenterLine) {
      centerFrame = this.scene.textures.getFrame("paperRouteProps", "road_center_dashes");
      this.roadCenterLine.setPosition(this.width * .5, 0);
      this.roadCenterLine.setSize(centerFrame ? centerFrame.width : 26, this.height);
    }

    if (this.roadLeftCurb) {
      this.roadLeftCurb.setVisible(!integratedTrackActive);
      this.roadLeftCurb.setPosition(this.roadLeft - curbWidth + edgeOverlap, 0);
      this.roadLeftCurb.setSize(this.roadLeftCurb.frame.width, this.height);
      this.roadLeftCurb.setScale(curbWidth / this.roadLeftCurb.frame.width, 1);
    }

    if (this.roadRightCurb) {
      this.roadRightCurb.setVisible(!integratedTrackActive);
      this.roadRightCurb.setPosition(this.roadRight - edgeOverlap, 0);
      this.roadRightCurb.setSize(this.roadRightCurb.frame.width, this.height);
      this.roadRightCurb.setScale(curbWidth / this.roadRightCurb.frame.width, 1);
    }
  };

  PaperRouteGame.prototype.trackSegmentDisplayWidth = function (side) {
    var edgeOverlap = TRACK_ROAD_SEAM_OVERLAP;

    return side === "left" ? this.roadLeft + edgeOverlap : this.width - this.roadRight + edgeOverlap;
  };

  PaperRouteGame.prototype.trackSegmentX = function (side) {
    var edgeOverlap = TRACK_ROAD_SEAM_OVERLAP;

    return side === "left" ? 0 : this.roadRight - edgeOverlap;
  };

  PaperRouteGame.prototype.trackSegmentConfig = function (side, index) {
    var configs = TRACK_SEGMENT_CONFIGS[side] || [];
    var offset = this.trackSegmentFrameOffset[side] || 0;

    return configs.length ? configs[(index + offset) % configs.length] : null;
  };

  PaperRouteGame.prototype.trackSegmentDisplayHeight = function (side, config) {
    var frame = config && this.hasTrackFrame(config.frame) ? this.scene.textures.getFrame("paperBobTrack", config.frame) : null;
    var displayWidth = this.trackSegmentDisplayWidth(side);

    return frame ? displayWidth * frame.height / frame.width : 0;
  };

  PaperRouteGame.prototype.resetTrackSegmentQueues = function () {
    this.trackSegmentCursor.left = 0;
    this.trackSegmentCursor.right = 0;
  };

  PaperRouteGame.prototype.positionTrackSegmentHitbox = function (segment, target) {
    var config;
    var x;
    var y;

    if (!segment || !target || !target.active) {
      return;
    }
    config = target.getData("targetConfig");
    if (!config) {
      return;
    }

    x = segment.x + config.x * segment.displayWidth;
    y = segment.y + config.y * segment.displayHeight;
    target.setPosition(x, y);
    if (target.body) {
      if (target.body.reset) {
        target.body.reset(x, y);
      } else if (target.body.updateFromGameObject) {
        target.body.updateFromGameObject();
      }
    }
  };

  PaperRouteGame.prototype.createTrackSegmentHitbox = function (segment, side, type, config, groupIndex) {
    var target = this.getPooledObject("targets") || this.scene.physics.add.sprite(-999, -999, "paperRouteTargetMarker");

    target.setTexture("paperRouteTargetMarker");
    target.setVisible(false);
    target.body.setSize(config.width, config.height, true);
    target.setVelocity(0, 0);
    target.setData("type", type);
    target.setData("side", side);
    target.setData("hit", false);
    target.setData("propertyFrame", segment.getData("frame"));
    target.setData("property", segment);
    target.setData("segment", segment);
    target.setData("targetConfig", config);
    target.setData("targetGroupIndex", groupIndex);
    if (!this.targets.contains(target)) {
      this.targets.add(target);
    }
    this.positionTrackSegmentHitbox(segment, target);

    return target;
  };

  PaperRouteGame.prototype.releaseTrackSegment = function (segment) {
    var self = this;
    var hitboxes = segment && segment.getData ? segment.getData("targets") || [] : [];

    hitboxes.slice().forEach(function (target) {
      if (target && target.active) {
        self.releasePooledObject(target);
      }
    });
    this.releasePooledObject(segment);
  };

  PaperRouteGame.prototype.spawnTrackSegment = function (side, y) {
    var cursor = this.trackSegmentCursor[side] || 0;
    var config = this.trackSegmentConfig(side, cursor);
    var displayWidth;
    var displayHeight;
    var segment;
    var targets = [];
    var self = this;

    if (!config || !this.hasTrackFrame(config.frame)) {
      return null;
    }

    displayWidth = this.trackSegmentDisplayWidth(side);
    displayHeight = this.trackSegmentDisplayHeight(side, config);
    if (!displayHeight) {
      return null;
    }

    segment = this.getPooledObject("trackSegments") || this.scene.add.image(-999, -999, "paperBobTrack", config.frame);
    segment.setTexture("paperBobTrack", config.frame);
    segment.setOrigin(0, 0);
    segment.setPosition(this.trackSegmentX(side), y);
    segment.setDepth(4);
    segment.setDisplaySize(displayWidth, displayHeight);
    segment.setData("side", side);
    segment.setData("frame", config.frame);
    segment.setData("segmentTop", Math.round(segment.y));
    segment.setData("segmentBottom", Math.round(segment.y + segment.displayHeight));
    segment.setData("targetGroups", config.targetGroups.length);
    config.targetGroups.forEach(function (group, groupIndex) {
      ["mailbox", "doorstep", "window"].forEach(function (type) {
        targets.push(self.createTrackSegmentHitbox(segment, side, type, group[type], groupIndex));
      });
    });
    segment.setData("targets", targets);
    if (!this.trackSegments.contains(segment)) {
      this.trackSegments.add(segment);
    }
    this.trackSegmentCursor[side] = cursor + 1;

    return segment;
  };

  PaperRouteGame.prototype.seedTrackSegments = function () {
    var self = this;

    if (!this.hasIntegratedTrackAtlas() || !this.trackSegments) {
      return;
    }

    this.resetTrackSegmentQueues();
    ["left", "right"].forEach(function (side) {
      var config = self.trackSegmentConfig(side, self.trackSegmentCursor[side] || 0);
      var displayHeight = self.trackSegmentDisplayHeight(side, config);
      var y = -displayHeight;
      var guard = 0;
      var segment;

      while (displayHeight && y < self.height + TUNING.trackSegmentSpawnBuffer && guard < 8) {
        segment = self.spawnTrackSegment(side, y);
        y += segment ? segment.displayHeight : displayHeight;
        guard += 1;
      }
    });
  };

  PaperRouteGame.prototype.ensureTrackSegmentCoverage = function (side) {
    var self = this;
    var active = [];
    var displayHeight;
    var topMost = Infinity;
    var bottomMost = -Infinity;
    var guard = 0;
    var config;
    var segment;

    if (!this.hasIntegratedTrackAtlas() || !this.trackSegments) {
      return;
    }

    this.trackSegments.children.each(function (child) {
      if (child.active && child.getData("side") === side) {
        active.push(child);
        topMost = Math.min(topMost, child.y);
        bottomMost = Math.max(bottomMost, child.y + child.displayHeight);
      }
    });

    config = this.trackSegmentConfig(side, this.trackSegmentCursor[side] || 0);
    displayHeight = this.trackSegmentDisplayHeight(side, config);
    if (!displayHeight) {
      return;
    }

    if (!active.length) {
      this.spawnTrackSegment(side, -displayHeight);
      topMost = -displayHeight;
      bottomMost = 0;
    }

    while (topMost > -displayHeight - 4 && guard < 4) {
      segment = this.spawnTrackSegment(side, topMost - displayHeight);
      if (!segment) {
        break;
      }
      topMost = segment.y;
      guard += 1;
    }

    guard = 0;
    while (bottomMost < this.height + TUNING.trackSegmentSpawnBuffer && guard < 6) {
      segment = self.spawnTrackSegment(side, bottomMost);
      if (!segment) {
        break;
      }
      bottomMost = segment.y + segment.displayHeight;
      guard += 1;
    }
  };

  PaperRouteGame.prototype.updateTrackSegments = function (scrollDelta) {
    var self = this;

    if (!this.hasIntegratedTrackAtlas() || !this.trackSegments) {
      return;
    }

    this.trackSegments.children.each(function (segment) {
      var hitboxes;

      if (!segment.active) {
        return;
      }

      segment.y += scrollDelta;
      segment.setData("segmentTop", Math.round(segment.y));
      segment.setData("segmentBottom", Math.round(segment.y + segment.displayHeight));
      hitboxes = segment.getData("targets") || [];
      hitboxes.forEach(function (target) {
        if (target && target.active) {
          self.positionTrackSegmentHitbox(segment, target);
          target.setVelocity(0, 0);
        }
      });

      if (segment.y > self.height + TUNING.trackSegmentSpawnBuffer) {
        self.releaseTrackSegment(segment);
      }
    });

    this.ensureTrackSegmentCoverage("left");
    this.ensureTrackSegmentCoverage("right");
  };

  PaperRouteGame.prototype.updateRoadKitObjects = function () {
    var integratedTrackActive;

    if (!this.roadSurface) {
      this.layoutRoadKitObjects();
    }
    if (!this.roadSurface) {
      return;
    }

    integratedTrackActive = this.hasIntegratedTrackAtlas();

    if (this.roadSurface) {
      this.roadSurface.tilePositionY = -this.routeOffset;
    }
    if (this.roadCenterLine) {
      this.roadCenterLine.tilePositionY = -this.routeOffset;
    }
    if (this.roadLeftCurb) {
      this.roadLeftCurb.setVisible(!integratedTrackActive);
      this.roadLeftCurb.tilePositionY = -this.routeOffset;
    }
    if (this.roadRightCurb) {
      this.roadRightCurb.setVisible(!integratedTrackActive);
      this.roadRightCurb.tilePositionY = -this.routeOffset;
    }
  };

  PaperRouteGame.prototype.setIntroProgress = function (value) {
    var percent = clamp(value, 0, 1) * 100;

    if (this.introProgress) {
      this.introProgress.style.width = percent.toFixed(1) + "%";
    }
  };

  PaperRouteGame.prototype.setIntroPanel = function (visible) {
    if (this.introPanel) {
      this.introPanel.hidden = !visible;
    }
  };

  PaperRouteGame.prototype.setIntroReadyControls = function (ready) {
    if (this.skipIntroButton) {
      this.skipIntroButton.disabled = !ready;
    }
  };

  PaperRouteGame.prototype.targetWithinRouteBounds = function (target) {
    return !!(
      target &&
      target.x > -100 &&
      target.x < this.width + 100 &&
      target.y > -this.height &&
      target.y < this.height + 160
    );
  };

  PaperRouteGame.prototype.createObjectPools = function () {
    var self = this;

    function register(name, create, size) {
      var pool = self.objectPools[name] || [];
      var index;
      var item;

      for (index = pool.length; index < size; index += 1) {
        item = create();
        self.releasePooledObject(item);
        pool.push(item);
      }
      self.objectPools[name] = pool;
      self.poolStats[name] = pool.length;
    }

    if (!this.scene) {
      return;
    }

    if (this.hasIntegratedTrackAtlas()) {
      register("trackSegments", function () {
        var image = self.scene.add.image(-999, -999, "paperBobTrack", TRACK_SEGMENT_FRAMES.left[0]);
        image.setOrigin(0, 0);
        image.setDepth(4);
        self.trackSegments.add(image);
        return image;
      }, POOL_SIZES.trackSegments);
    }

    register("targets", function () {
      var sprite = self.scene.physics.add.sprite(-999, -999, "paperRouteTargetMarker");
      sprite.setVisible(false);
      self.targets.add(sprite);
      return sprite;
    }, POOL_SIZES.targets);

    register("papers", function () {
      var sprite = self.scene.physics.add.sprite(-999, -999, self.scene.textures.exists("paperRoutePaperAsset") ? "paperRoutePaperAsset" : "paperRoutePaper");
      sprite.setDepth(16);
      self.papers.add(sprite);
      return sprite;
    }, POOL_SIZES.papers);

    register("ramps", function () {
      var sprite = self.scene.physics.add.sprite(-999, -999, "paperRouteRamp");
      sprite.setDepth(8);
      self.ramps.add(sprite);
      return sprite;
    }, POOL_SIZES.ramps);

    register("puddles", function () {
      var sprite = self.scene.physics.add.sprite(-999, -999, self.scene.textures.exists("paperRoutePuddleAsset") ? "paperRoutePuddleAsset" : "paperRoutePuddle");
      sprite.setDepth(7);
      self.puddles.add(sprite);
      return sprite;
    }, POOL_SIZES.puddles);

    if (this.hasIntroAtlas()) {
      register("spots", function () {
        var sprite = self.scene.physics.add.sprite(-999, -999, "paperBobIntro", SPOT_SIDE_FRAMES[0]);
        sprite.setDepth(19);
        self.spots.add(sprite);
        return sprite;
      }, POOL_SIZES.spots);
    }

    if (this.hasRoutePropsAtlas()) {
      register("roadDecals", function () {
        var image = self.scene.add.image(-999, -999, "paperRouteProps", "road_crack");
        image.setDepth(4);
        self.roadDecals.add(image);
        return image;
      }, POOL_SIZES.roadDecals);
    }

    register("hitFlashes", function () {
      var image = self.scene.add.image(-999, -999, self.scene.textures.exists("paperRouteMailboxHitAsset") ? "paperRouteMailboxHitAsset" : "paperRoutePaper");
      image.setDepth(24);
      return image;
    }, POOL_SIZES.hitFlashes);

    register("puddleSplashes", function () {
      var image = self.scene.add.image(-999, -999, self.scene.textures.exists("paperRoutePuddleSplashAsset") ? "paperRoutePuddleSplashAsset" : "paperRoutePuddle");
      image.setDepth(23);
      return image;
    }, POOL_SIZES.puddleSplashes);

    register("floatTexts", function () {
      var text = self.scene.add.text(-999, -999, "", {
        color: "#f6dfb7",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "20px",
        fontStyle: "bold",
        stroke: "#2b2117",
        strokeThickness: 4
      });
      text.setOrigin(.5);
      text.setDepth(30);
      return text;
    }, POOL_SIZES.floatTexts);
  };

  PaperRouteGame.prototype.getPooledObject = function (name) {
    var pool = this.objectPools[name] || [];
    var item = null;
    var index;

    for (index = 0; index < pool.length; index += 1) {
      if (!pool[index].active) {
        item = pool[index];
        break;
      }
    }
    if (!item) {
      return null;
    }

    item.setActive(true);
    item.setVisible(true);
    item.setAlpha(1);
    item.setAngle(0);
    item.setScale(1);
    item.clearTint && item.clearTint();
    if (item.body) {
      item.body.enable = true;
      item.body.setVelocity(0, 0);
      item.body.setAngularVelocity && item.body.setAngularVelocity(0);
    }

    return item;
  };

  PaperRouteGame.prototype.releasePooledObject = function (item) {
    var destroyOnRelease;

    if (!item) {
      return;
    }
    destroyOnRelease = !!(item.getData && item.getData("ephemeralTarget"));

    if (this.scene && this.scene.tweens) {
      this.scene.tweens.killTweensOf(item);
    }
    item.setActive && item.setActive(false);
    item.setVisible && item.setVisible(false);
    item.setPosition && item.setPosition(-999, -999);
    item.setAlpha && item.setAlpha(1);
    item.setAngle && item.setAngle(0);
    item.setScale && item.setScale(1);
    item.clearTint && item.clearTint();
    if (destroyOnRelease && item.destroy) {
      item.destroy();
      return;
    }
    if (item.data && item.data.removeAll) {
      item.data.removeAll();
    }
    if (item.body) {
      item.body.enable = false;
      item.body.setVelocity(0, 0);
      item.body.setAngularVelocity && item.body.setAngularVelocity(0);
    }
  };

  PaperRouteGame.prototype.updateIntroLoadProgress = function () {
    var loadingProgress = this.routeAssetsReady ? 1 : this.routeLoadProgress;

    this.setIntroProgress(this.introPrepComplete ? 1 : Math.min(.98, loadingProgress));
  };

  PaperRouteGame.prototype.promotePlayerTexture = function () {
    if (!this.player) {
      return;
    }
    if (this.hasBobSheet()) {
      this.player.setTexture("paperBobSheet", BOB_FRAME.rideStraight);
      this.playerPose = "";
      this.setPlayerPose("ride");
    } else if (this.scene && this.scene.textures.exists("paperBobSprite")) {
      this.player.setTexture("paperBobSprite");
    }
  };

  PaperRouteGame.prototype.queueDeferredRouteAssets = function () {
    var scene = this.scene;
    var queued = 0;

    if (!scene) {
      return 0;
    }

    function textureMissing(key) {
      return !scene.textures.exists(key);
    }

    if (this.bobSheetSrc && textureMissing("paperBobSheet")) {
      scene.load.spritesheet("paperBobSheet", this.assetSrc(this.bobSheetSrc, this.bobSheetWebpSrc), {
        frameWidth: 128,
        frameHeight: 128
      });
      queued += 1;
    }
    if (this.bobSrc && textureMissing("paperBobSprite")) {
      scene.load.image("paperBobSprite", this.bobSrc);
      queued += 1;
    }
    if (this.paperSrc && textureMissing("paperRoutePaperAsset")) {
      scene.load.image("paperRoutePaperAsset", this.assetSrc(this.paperSrc, this.paperWebpSrc));
      queued += 1;
    }
    if (this.puddleSrc && textureMissing("paperRoutePuddleAsset")) {
      scene.load.image("paperRoutePuddleAsset", this.assetSrc(this.puddleSrc, this.puddleWebpSrc));
      queued += 1;
    }
    if (this.puddleSplashSrc && textureMissing("paperRoutePuddleSplashAsset")) {
      scene.load.image("paperRoutePuddleSplashAsset", this.assetSrc(this.puddleSplashSrc, this.puddleSplashWebpSrc));
      queued += 1;
    }
    if (this.mailboxHitSrc && textureMissing("paperRouteMailboxHitAsset")) {
      scene.load.image("paperRouteMailboxHitAsset", this.assetSrc(this.mailboxHitSrc, this.mailboxHitWebpSrc));
      queued += 1;
    }
    if (this.doorstepHitSrc && textureMissing("paperRouteDoorstepHitAsset")) {
      scene.load.image("paperRouteDoorstepHitAsset", this.assetSrc(this.doorstepHitSrc, this.doorstepHitWebpSrc));
      queued += 1;
    }
    if (this.windowHitSrc && textureMissing("paperRouteWindowHitAsset")) {
      scene.load.image("paperRouteWindowHitAsset", this.assetSrc(this.windowHitSrc, this.windowHitWebpSrc));
      queued += 1;
    }
    if (this.propsAtlasSrc && this.propsAtlasJsonSrc && textureMissing("paperRouteProps")) {
      scene.load.atlas("paperRouteProps", this.assetSrc(this.propsAtlasSrc, this.propsAtlasWebpSrc), this.propsAtlasJsonSrc);
      queued += 1;
    }
    if (this.lotsAtlasSrc && this.lotsAtlasJsonSrc && textureMissing("paperBobLots")) {
      scene.load.atlas("paperBobLots", this.assetSrc(this.lotsAtlasSrc, this.lotsAtlasWebpSrc), this.lotsAtlasJsonSrc);
      queued += 1;
    }
    if (this.trackAtlasSrc && this.trackAtlasJsonSrc && textureMissing("paperBobTrack")) {
      scene.load.atlas("paperBobTrack", this.assetSrc(this.trackAtlasSrc, this.trackAtlasWebpSrc), this.trackAtlasJsonSrc);
      queued += 1;
    }

    return queued;
  };

  PaperRouteGame.prototype.loadDeferredRouteAssets = function () {
    var self = this;
    var queued;

    if (!this.scene || this.routeAssetsStarted) {
      return;
    }

    this.routeAssetsStarted = true;
    this.routeAssetsReady = false;
    this.routeAssetsFailed = false;
    this.routeLoadProgress = 0;
    queued = this.queueDeferredRouteAssets();
    if (!queued) {
      this.finishDeferredRouteAssets();
      return;
    }

    this.scene.load.on("progress", this.handleDeferredRouteProgress, this);
    this.scene.load.once("complete", function () {
      self.scene.load.off("progress", self.handleDeferredRouteProgress, self);
      self.routeLoadProgress = 1;
      self.finishDeferredRouteAssets();
    });
    this.scene.load.once("loaderror", function () {
      self.routeAssetsFailed = true;
    });
    this.scene.load.start();
  };

  PaperRouteGame.prototype.handleDeferredRouteProgress = function (value) {
    this.routeLoadProgress = value || 0;
    this.updateIntroLoadProgress();
  };

  PaperRouteGame.prototype.finishDeferredRouteAssets = function () {
    var self = this;

    if (this.routeAssetsReady) {
      return;
    }
    this.routeAssetsReady = true;
    this.createRoadKitObjects(this.scene);
    this.createBobAnimations(this.scene);
    this.promotePlayerTexture();
    this.createObjectPools();
    self.introPrepComplete = true;
    self.setIntroReadyControls(true);
    self.updateIntroLoadProgress();
    if (self.introMode === "intro-loading" || self.reducedMotion || !self.hasIntroAtlas()) {
      self.completeIntro();
    }
  };

  PaperRouteGame.prototype.createIntroObjects = function () {
    var scene = this.scene;

    if (!scene || !this.hasIntroAtlas()) {
      return;
    }

    if (this.introLayer) {
      this.introLayer.destroy(true);
    }

    this.introLayer = scene.add.container(0, 0);
    this.introLayer.setDepth(40);
    this.introObjects = {
      bob: scene.add.sprite(this.width * .5, this.height * .56, "paperBobIntro", "intro_bob_ride_front_01"),
      spot: scene.add.sprite(this.width * .74, this.height * .66, "paperBobIntro", "spot_sit_paper_front"),
      logo: scene.add.image(this.width * .5, this.height * .18, "paperBobIntro", "intro_logo_paper_bob"),
      shade: scene.add.rectangle(this.width * .5, this.height * .5, this.width, this.height, 0x000000, 0)
    };
    this.introObjects.bob.setDepth(43);
    this.introObjects.spot.setDepth(44);
    this.introObjects.logo.setDepth(45);
    this.introObjects.logo.setVisible(true);
    this.introObjects.logo.setDisplaySize(Math.min(220, this.width * .48), Math.min(56, this.width * .12));
    this.introObjects.spot.setVisible(false);
    this.introObjects.spot.setScale(.52);
    this.introObjects.shade.setDepth(50);
    this.introObjects.shade.setVisible(false);
    this.introLayer.add([this.introObjects.bob, this.introObjects.spot, this.introObjects.logo, this.introObjects.shade]);
    this.introObjects.bob.anims.play("introBobRideFront", true);
  };

  PaperRouteGame.prototype.beginIntro = function () {
    this.introMode = "intro-prep";
    this.introElapsed = 0;
    this.introPrepComplete = false;
    this.introComplete = false;
    this.routeAssetsStarted = false;
    this.routeAssetsReady = false;
    this.routeAssetsFailed = false;
    this.routeLoadProgress = 0;
    this.setIntroPanel(true);
    this.setIntroProgress(0);
    this.setIntroReadyControls(false);
    this.setTouchPanel(false);
    if (this.startCard) {
      this.startCard.hidden = true;
    }
    if (this.pauseCard) {
      this.pauseCard.hidden = true;
    }
    if (this.summaryCard) {
      this.summaryCard.hidden = true;
    }
    this.clearFinalScore();
    this.clearSummaryMetrics();
    if (this.startButton) {
      this.startButton.disabled = true;
    }
    if (this.pauseButton) {
      this.pauseButton.disabled = true;
    }
    if (this.restartButton) {
      this.restartButton.disabled = true;
    }
    if (this.startButton) {
      this.startButton.disabled = !this.introComplete;
    }
    if (this.player) {
      this.player.setVisible(false);
    }
    this.syncHud("Rolling the morning edition...");
    this.createIntroObjects();
    this.introMode = this.hasIntroAtlas() && !this.reducedMotion ? "intro-cinematic" : "intro-loading";
    this.loadDeferredRouteAssets();
  };

  PaperRouteGame.prototype.skipIntro = function () {
    if (!this.introPrepComplete || this.introComplete) {
      return;
    }
    this.introElapsed = INTRO_DURATION;
    this.completeIntro();
  };

  PaperRouteGame.prototype.completeIntro = function () {
    var bob = this.introObjects.bob;
    var spot = this.introObjects.spot;
    var logo = this.introObjects.logo;
    var shade = this.introObjects.shade;

    this.introMode = "ready";
    this.introComplete = true;
    this.setIntroPanel(false);
    this.setIntroProgress(1);
    if (shade) {
      shade.setAlpha(0);
    }
    if (bob) {
      bob.anims.stop();
      bob.setTexture("paperBobIntro", "intro_bob_read_02");
      bob.setPosition(this.width * .42, this.height * .5);
      bob.setScale(.76);
      bob.setAngle(0);
      bob.setVisible(true);
    }
    if (spot) {
      spot.anims.stop();
      spot.setTexture("paperBobIntro", "spot_sit_paper_front");
      spot.setPosition(this.width * .64, this.height * .55);
      spot.setScale(.46);
      spot.setVisible(false);
    }
    if (logo) {
      logo.setVisible(true);
      logo.setPosition(this.width * .5, this.height * .17);
      logo.setAngle(0);
      logo.setAlpha(1);
    }
    if (this.stage) {
      this.stage.classList.add("paper-route-stage--intro-ready");
    }
    this.showStartCard();
    this.syncHud("Paper-Bob is loaded. Hit the street.");
  };

  PaperRouteGame.prototype.updateIntro = function (deltaSeconds) {
    var t;
    var progress;
    var bob = this.introObjects.bob;
    var logo = this.introObjects.logo;
    var shade = this.introObjects.shade;
    var centerX = this.width * .5;

    if (this.introComplete || this.introMode !== "intro-cinematic") {
      return;
    }

    this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + deltaSeconds);
    t = this.introElapsed;
    progress = t / INTRO_DURATION;
    if (this.introPrepComplete) {
      this.setIntroProgress(1);
    } else {
      this.updateIntroLoadProgress();
    }
    this.routeOffset += (120 + progress * 42) * deltaSeconds;
    this.redrawBackground();

    if (shade) {
      shade.setSize(this.width, this.height);
      shade.setPosition(this.width * .5, this.height * .5);
      shade.setAlpha(0);
      shade.setVisible(false);
    }

    if (bob) {
      bob.setVisible(true);
      if (t < 6.8) {
        bob.setTexture("paperBobIntro", INTRO_RIDE_FRAMES[Math.floor(t * 8) % INTRO_RIDE_FRAMES.length]);
        bob.setPosition(centerX + Math.sin(t * 2.4) * 20, this.height * (.48 + progress * .08));
        bob.setScale(.72 + Math.sin(t * 3.2) * .018);
        bob.setAngle(Math.sin(t * 2.4) * 3.5);
      } else {
        bob.setTexture("paperBobIntro", Math.floor(t * 3) % 2 ? "intro_bob_read_01" : "intro_bob_read_02");
        bob.setPosition(this.width * .42, this.height * .5);
        bob.setScale(.76);
        bob.setAngle(0);
      }
    }

    if (logo) {
      logo.setVisible(true);
      logo.setAlpha(1);
      logo.setPosition(this.width * .5 + Math.sin(t * 1.8) * 2, this.height * .17);
      logo.setAngle(Math.sin(t * 1.4) * .8);
    }

    if (t >= INTRO_DURATION && this.introPrepComplete) {
      this.completeIntro();
    }
  };

  PaperRouteGame.prototype.setPlayerDisplaySize = function (scale) {
    if (!this.player) {
      return;
    }

    this.player.setDisplaySize(TUNING.playerDisplay.width * scale, TUNING.playerDisplay.height * scale);
  };

  PaperRouteGame.prototype.setPlayerPose = function (pose) {
    var frame = null;
    var animation = null;

    if (!this.player || this.playerPose === pose) {
      return;
    }

    if (!this.hasBobSheet()) {
      this.playerPose = pose;
      return;
    }

    if (pose === "ride") {
      animation = "bobRide";
    } else if (pose === "lean-left") {
      frame = BOB_FRAME.leanLeft;
    } else if (pose === "lean-right") {
      frame = BOB_FRAME.leanRight;
    } else if (pose === "throw-left") {
      frame = BOB_FRAME.throwLeft;
    } else if (pose === "throw-right") {
      frame = BOB_FRAME.throwRight;
    } else if (pose === "air-throw-left") {
      frame = BOB_FRAME.airThrowLeft;
    } else if (pose === "air-throw-right") {
      frame = BOB_FRAME.airThrowRight;
    } else if (pose === "airborne") {
      animation = "bobAirborne";
    } else if (pose === "wheelie") {
      animation = "bobWheelieRise";
    } else if (pose === "puddle") {
      animation = "bobPuddleHit";
    } else if (pose === "run-end") {
      animation = "bobRunEnd";
    }

    if (animation && this.scene.anims.exists(animation)) {
      this.player.anims.play(animation, true);
    } else if (frame !== null) {
      this.player.anims.stop();
      this.player.setFrame(frame);
    }

    this.playerPose = pose;
  };

  PaperRouteGame.prototype.generateTextures = function (scene) {
    var graphics = scene.add.graphics();

    graphics.clear();
    graphics.fillStyle(0x111111, 1);
    graphics.fillCircle(20, 28, 13);
    graphics.fillCircle(56, 28, 13);
    graphics.lineStyle(4, 0xf8efdd, .9);
    graphics.strokeCircle(20, 28, 13);
    graphics.strokeCircle(56, 28, 13);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(24, 26, 38, 9));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(38, 9, 52, 26));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(31, 27, 56, 27));
    graphics.fillStyle(0xb9894d, 1);
    graphics.fillRoundedRect(6, 5, 28, 22, 3);
    graphics.fillStyle(0x2b2117, 1);
    graphics.fillRoundedRect(34, 0, 24, 28, 6);
    graphics.generateTexture("paperRouteCourierFallback", 78, 54);

    graphics.clear();
    graphics.fillStyle(0xf6dfb7, 1);
    graphics.fillRoundedRect(1, 1, 25, 16, 2);
    graphics.fillStyle(0xb9894d, .86);
    graphics.fillTriangle(18, 1, 26, 1, 26, 9);
    graphics.lineStyle(1, 0x557b82, .95);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(5, 5, 17, 5));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(5, 9, 21, 9));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(5, 13, 15, 13));
    graphics.generateTexture("paperRoutePaper", 28, 18);

    graphics.clear();
    graphics.fillStyle(0xffffff, 0);
    graphics.fillRect(0, 0, 4, 4);
    graphics.generateTexture("paperRouteTargetMarker", 4, 4);

    graphics.clear();
    graphics.fillStyle(0x2b2117, 1);
    graphics.fillRoundedRect(10, 10, 58, 64, 5);
    graphics.fillStyle(0x46331f, 1);
    graphics.fillTriangle(5, 14, 39, 0, 73, 14);
    graphics.fillStyle(0xf6dfb7, .86);
    graphics.fillRoundedRect(21, 26, 14, 16, 2);
    graphics.fillRoundedRect(43, 26, 14, 16, 2);
    graphics.fillStyle(0x735c43, 1);
    graphics.fillRoundedRect(33, 50, 12, 24, 2);
    graphics.fillStyle(0x3d3327, .92);
    graphics.fillRoundedRect(48, 78, 74, 18, 3);
    graphics.fillStyle(0x5b4d3a, .86);
    graphics.fillRoundedRect(52, 84, 70, 7, 1);
    graphics.fillStyle(0x557b82, 1);
    graphics.fillRoundedRect(74, 51, 38, 26, 4);
    graphics.fillStyle(0xf6dfb7, .96);
    graphics.fillRoundedRect(82, 58, 18, 8, 2);
    graphics.fillStyle(0xb9894d, 1);
    graphics.fillTriangle(78, 51, 93, 39, 108, 51);
    graphics.fillRect(91, 77, 5, 21);
    graphics.fillStyle(0xb45b3c, 1);
    graphics.fillRect(106, 48, 10, 5);
    graphics.lineStyle(2, 0xf8efdd, .82);
    graphics.strokeRoundedRect(10, 10, 58, 64, 5);
    graphics.strokeRoundedRect(74, 51, 38, 26, 4);
    graphics.generateTexture("paperRouteMailbox", 132, 108);

    graphics.clear();
    graphics.fillStyle(0x2b2117, 1);
    graphics.fillRoundedRect(10, 10, 76, 68, 5);
    graphics.fillStyle(0x46331f, 1);
    graphics.fillTriangle(4, 15, 48, 0, 92, 15);
    graphics.fillStyle(0xf6dfb7, .88);
    graphics.fillRoundedRect(25, 24, 18, 16, 2);
    graphics.fillRoundedRect(54, 24, 18, 16, 2);
    graphics.fillStyle(0x557b82, .88);
    graphics.fillRoundedRect(35, 48, 28, 30, 2);
    graphics.fillStyle(0x3d3327, .92);
    graphics.fillRoundedRect(54, 80, 66, 18, 3);
    graphics.fillStyle(0x735c43, 1);
    graphics.fillRoundedRect(57, 65, 58, 27, 5);
    graphics.fillStyle(0xb9894d, .75);
    graphics.fillRect(63, 73, 46, 7);
    graphics.fillStyle(0x557b82, 1);
    graphics.fillRoundedRect(94, 48, 24, 18, 4);
    graphics.fillStyle(0xf6dfb7, .9);
    graphics.fillRoundedRect(99, 54, 11, 5, 1);
    graphics.lineStyle(2, 0xf8efdd, .76);
    graphics.strokeRoundedRect(10, 10, 76, 68, 5);
    graphics.strokeRoundedRect(57, 65, 58, 27, 5);
    graphics.generateTexture("paperRouteDoorstep", 132, 108);

    graphics.clear();
    graphics.fillStyle(0x2b2117, 1);
    graphics.fillRoundedRect(8, 10, 86, 72, 5);
    graphics.fillStyle(0x46331f, 1);
    graphics.fillTriangle(1, 16, 51, 0, 101, 16);
    graphics.fillStyle(0xf6dfb7, .84);
    graphics.fillRoundedRect(25, 27, 20, 18, 2);
    graphics.fillRoundedRect(57, 27, 20, 18, 2);
    graphics.fillRoundedRect(38, 50, 28, 22, 2);
    graphics.lineStyle(2, 0x557b82, .92);
    graphics.strokeRoundedRect(38, 50, 28, 22, 2);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(52, 50, 52, 72));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(38, 61, 66, 61));
    graphics.fillStyle(0x3d3327, .92);
    graphics.fillRoundedRect(55, 80, 68, 18, 3);
    graphics.fillStyle(0x5b4d3a, .82);
    graphics.fillRoundedRect(60, 86, 63, 6, 1);
    graphics.fillStyle(0x557b82, 1);
    graphics.fillRoundedRect(96, 49, 24, 18, 4);
    graphics.fillStyle(0xb9894d, 1);
    graphics.fillRect(107, 67, 4, 24);
    graphics.lineStyle(2, 0xf8efdd, .8);
    graphics.strokeRoundedRect(8, 10, 86, 72, 5);
    graphics.generateTexture("paperRouteWindow", 134, 108);

    graphics.clear();
    graphics.fillStyle(0x3d3327, 1);
    graphics.fillRoundedRect(9, 19, 74, 45, 4);
    graphics.fillStyle(0xb9894d, 1);
    graphics.fillTriangle(13, 19, 46, 2, 79, 19);
    graphics.fillStyle(0xa9773c, 1);
    graphics.fillTriangle(16, 25, 46, 11, 76, 25);
    graphics.fillStyle(0xf6dfb7, .9);
    graphics.fillRoundedRect(21, 29, 50, 10, 2);
    graphics.fillStyle(0x557b82, .55);
    graphics.fillRoundedRect(25, 43, 42, 10, 2);
    graphics.lineStyle(3, 0xf6dfb7, .82);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(46, 3, 46, 62));
    graphics.lineStyle(2, 0xf8efdd, .82);
    graphics.strokeTriangle(13, 19, 46, 2, 79, 19);
    graphics.strokeRoundedRect(9, 19, 74, 45, 4);
    graphics.generateTexture("paperRouteRamp", 92, 72);

    graphics.clear();
    graphics.fillStyle(0x557b82, .9);
    graphics.fillEllipse(48, 28, 82, 34);
    graphics.fillStyle(0x9fb8bd, .72);
    graphics.fillEllipse(39, 22, 32, 10);
    graphics.fillEllipse(59, 34, 24, 8);
    graphics.lineStyle(2, 0xf6dfb7, .45);
    graphics.strokeEllipse(48, 28, 82, 34);
    graphics.generateTexture("paperRoutePuddle", 96, 58);

    graphics.destroy();
  };

  PaperRouteGame.prototype.palette = function () {
    var light = document.documentElement.getAttribute("data-theme") === "light";

    return light ? {
      paper: 0xf3e6d3,
      paperAlt: 0xe5d2b6,
      ink: 0x2b2117,
      inkSoft: 0x735c43,
      road: 0x6d675c,
      roadDark: 0x565047,
      lane: 0xf6dfb7,
      route: 0xb45b3c,
      curb: 0xd4bd98,
      porch: 0xf8efdd
    } : {
      paper: 0xeadbc4,
      paperAlt: 0xd7c09e,
      ink: 0x2b2117,
      inkSoft: 0x735c43,
      road: 0x625d53,
      roadDark: 0x4d463b,
      lane: 0xf3ddb4,
      route: 0xb45b3c,
      curb: 0xcbb38b,
      porch: 0xf1e3cd
    };
  };

  PaperRouteGame.prototype.layoutScene = function () {
    if (!this.scene) {
      return;
    }

    this.width = this.scene.scale.width || 480;
    this.height = this.scene.scale.height || 853;
    this.roadLeft = this.width * .31;
    this.roadRight = this.width * .69;
    this.basePlayerX = this.width * .5;
    this.basePlayerY = this.height * .76;
    if (this.player) {
      this.player.setPosition(this.basePlayerX, this.basePlayerY);
    }
    this.redrawBackground();
  };

  PaperRouteGame.prototype.redrawBackground = function () {
    var g = this.background;
    var width = this.width;
    var height = this.height;
    var palette = this.palette();
    var roadWidth = this.roadRight - this.roadLeft;
    var stripeOffset = this.routeOffset % 86;
    var assetBackedRoute = this.hasRoutePropsFrame("road_surface") || this.hasIntegratedTrackAtlas() || this.hasLotsAtlas();
    var i;
    var y;

    function line(x1, y1, x2, y2) {
      g.strokeLineShape(new window.Phaser.Geom.Line(x1, y1, x2, y2));
    }

    if (!g) {
      return;
    }

    g.clear();
    g.fillStyle(palette.paper, 1);
    g.fillRect(0, 0, width, height);

    if (assetBackedRoute) {
      g.fillStyle(palette.porch, .18);
      g.fillRect(0, 0, this.roadLeft - 10, height);
      g.fillRect(this.roadRight + 10, 0, width - this.roadRight - 10, height);
      g.lineStyle(1, palette.inkSoft, .08);
      for (i = -2; i < 14; i += 1) {
        y = i * 96 + (this.routeOffset * .18) % 96;
        line(20, y, this.roadLeft - 26, y - 18);
        line(this.roadRight + 26, y - 18, width - 20, y);
      }
    } else {
      g.lineStyle(1, palette.inkSoft, .16);
      for (i = -2; i < 14; i += 1) {
        y = i * 74 + (this.routeOffset * .22) % 74;
        line(0, y, this.roadLeft - 12, y - 42);
        line(this.roadRight + 12, y - 42, width, y);
      }

      g.fillStyle(palette.porch, .75);
      for (i = -2; i < 12; i += 1) {
        y = i * 108 + (this.routeOffset * .75) % 108;
        g.fillRoundedRect(16, y, this.roadLeft - 48, 42, 4);
        g.fillRoundedRect(this.roadRight + 32, y + 52, width - this.roadRight - 48, 42, 4);
        g.lineStyle(1, palette.inkSoft, .22);
        line(32, y + 16, this.roadLeft - 48, y + 16);
        line(this.roadRight + 48, y + 68, width - 30, y + 68);
      }
    }

    g.fillStyle(palette.curb, 1);
    g.fillRect(this.roadLeft - 8, 0, 8, height);
    g.fillRect(this.roadRight, 0, 8, height);
    g.fillStyle(palette.road, 1);
    g.fillRect(this.roadLeft, 0, roadWidth, height);
    if (!assetBackedRoute) {
      g.fillStyle(palette.roadDark, .52);
      g.fillRect(this.roadLeft + roadWidth * .42, 0, roadWidth * .16, height);
      g.lineStyle(2, palette.lane, .5);
      for (i = -1; i < 13; i += 1) {
        y = i * 86 + stripeOffset;
        line(width * .5, y, width * .5, y + 38);
      }
      g.lineStyle(3, palette.route, .55);
      line(30, height * .17, this.roadLeft - 26, height * .13);
      line(this.roadRight + 26, height * .26, width - 32, height * .21);
      line(26, height * .68, this.roadLeft - 22, height * .62);
      line(this.roadRight + 28, height * .76, width - 30, height * .72);
    }
    this.updateRoadKitObjects();
  };

  PaperRouteGame.prototype.showStartCard = function () {
    var self = this;

    if (this.startCard) {
      this.startCard.hidden = false;
    }
    if (this.summaryCard) {
      this.summaryCard.hidden = true;
    }
    this.clearFinalScore();
    this.clearSummaryMetrics();
    if (this.pauseCard) {
      this.pauseCard.hidden = true;
    }
    if (this.stage) {
      this.stage.classList.remove("paper-route-stage--paused");
    }
    this.setTouchPanel(false);
    if (this.pauseButton) {
      this.pauseButton.textContent = "Pause";
      this.pauseButton.disabled = true;
    }
    if (this.restartButton) {
      this.restartButton.disabled = true;
    }
    if (this.startButton) {
      this.startButton.disabled = !this.introComplete;
    }
    if (this.scene && this.startButton && this.startButton.focus) {
      this.scene.time.delayedCall(20, function () {
        if (self.startButton && !self.startButton.closest("[hidden]")) {
          self.startButton.focus({ preventScroll: true });
        }
      });
    }
  };

  PaperRouteGame.prototype.start = function () {
    if (!this.scene || !this.player || !this.player.body) {
      this.syncHud("Paper-Bob is still at the loading dock.");
      return;
    }
    if (!this.introComplete) {
      this.syncHud("The route is still loading.");
      return;
    }

    this.clearObjects();
    this.clearFinalScore();
    this.clearSummaryMetrics();
    this.applyEffects(this.rules.start(this.highScore));
    this.throwCooldown = 0;
    this.targetTimer = TUNING.firstTargetDelay / 1000;
    this.puddleTimer = TUNING.firstPuddleDelay / 1000;
    this.spotTimer = TUNING.spotFirstDelay / 1000;
    this.rampTimer = TUNING.firstRampDelay / 1000;
    this.roadDecalTimer = .85;
    this.targetSpawnCount = 0;
    this.rampSpawnCount = 0;
    this.rampFrameOffset = Math.floor(Math.random() * RAMP_FRAMES.length);
    this.trackSegmentFrameOffset = {
      left: Math.floor(Math.random() * TRACK_SEGMENT_FRAMES.left.length),
      right: Math.floor(Math.random() * TRACK_SEGMENT_FRAMES.right.length)
    };
    this.resetTrackSegmentQueues();
    this.heldLeft = false;
    this.heldRight = false;
    this.heldUp = false;
    this.heldDown = false;
    this.trickHeld = false;
    this.routeOffset = 0;
    this.updateRoadKitObjects();
    this.seedTrackSegments();
    this.poseHoldUntil = 0;
    this.heldPose = "";
    this.finishSequenceId += 1;
    this.basePlayerX = this.width * .5;
    this.basePlayerY = this.height * .76;
    if (this.introLayer) {
      this.introLayer.setVisible(false);
    }
    if (this.stage) {
      this.stage.classList.remove("paper-route-stage--intro-ready");
    }
    this.player.setVisible(true);
    this.player.clearTint();
    this.player.setAngle(0);
    this.player.setAlpha(1);
    this.setPlayerDisplaySize(1);
    this.playerPose = "";
    this.setPlayerPose("ride");
    this.player.setPosition(this.basePlayerX, this.basePlayerY);
    this.scene.physics.resume();

    if (this.startCard) {
      this.startCard.hidden = true;
    }
    if (this.summaryCard) {
      this.summaryCard.hidden = true;
    }
    if (this.pauseCard) {
      this.pauseCard.hidden = true;
    }
    if (this.stage) {
      this.stage.classList.remove("paper-route-stage--paused");
    }

    this.setTouchPanel(true);
    if (this.pauseButton) {
      this.pauseButton.textContent = "Pause";
      this.pauseButton.disabled = false;
    }
    if (this.restartButton) {
      this.restartButton.disabled = false;
    }

    this.playSound("start");
    this.syncHud("Bag packed. Toss clean, hop ramps, dodge puddles.");
    if (this.container && this.container.focus) {
      this.container.focus({ preventScroll: true });
    }
  };

  PaperRouteGame.prototype.clearObjects = function () {
    var self = this;

    if (this.targets) {
      this.targets.children.each(function (child) {
        self.releasePooledObject(child);
      });
    }
    if (this.trackSegments) {
      this.trackSegments.children.each(function (child) {
        self.releaseTrackSegment(child);
      });
    }
    if (this.ramps) {
      this.ramps.children.each(function (child) {
        self.releasePooledObject(child);
      });
    }
    if (this.puddles) {
      this.puddles.children.each(function (child) {
        self.releasePooledObject(child);
      });
    }
    if (this.spots) {
      this.spots.children.each(function (child) {
        self.releasePooledObject(child);
      });
    }
    if (this.papers) {
      this.papers.children.each(function (child) {
        self.releasePooledObject(child);
      });
    }
    if (this.roadDecals) {
      this.roadDecals.children.each(function (child) {
        self.releasePooledObject(child);
      });
    }
  };

  PaperRouteGame.prototype.syncHud = function (message) {
    var state = this.rules.state;

    setText(this.scoreNode, state.score);
    setText(this.papersNode, state.papers);
    setText(this.timeNode, Math.max(0, Math.ceil(state.timeRemaining)));
    setText(this.highNode, this.highScore);

    if (message) {
      setText(this.status, message);
    }
  };

  PaperRouteGame.prototype.currentSpeed = function () {
    var state = this.rules.state;
    var speed = TUNING.baseSpeed + Math.min(TUNING.speedCapBonus, state.elapsed * TUNING.speedRamp);

    return this.rules.isSlowed() ? speed * TUNING.slowMultiplier : speed;
  };

  PaperRouteGame.prototype.nextTargetInterval = function () {
    return (Math.max(TUNING.targetMinInterval, TUNING.targetBaseInterval - this.rules.state.elapsed * TUNING.targetRamp) + Math.random() * TUNING.targetJitter) / 1000;
  };

  PaperRouteGame.prototype.nextPuddleInterval = function () {
    return (Math.max(TUNING.puddleMinInterval, TUNING.puddleBaseInterval - this.rules.state.elapsed * TUNING.puddleRamp) + Math.random() * TUNING.puddleJitter) / 1000;
  };

  PaperRouteGame.prototype.nextRampInterval = function () {
    return (Math.max(TUNING.rampMinInterval, TUNING.rampBaseInterval - this.rules.state.elapsed * TUNING.rampRamp) + Math.random() * TUNING.rampJitter) / 1000;
  };

  PaperRouteGame.prototype.nextRoadDecalInterval = function () {
    return (Math.max(TUNING.roadDecalMinInterval, TUNING.roadDecalBaseInterval - this.rules.state.elapsed * 3) + Math.random() * TUNING.roadDecalJitter) / 1000;
  };

  PaperRouteGame.prototype.spawnRoadDecal = function (planned) {
    var config;
    var frame;
    var displayWidth;
    var displayHeight;
    var decal;

    if (!this.roadDecals || !this.hasRoutePropsAtlas()) {
      return;
    }

    config = planned || ROAD_DECAL_CONFIGS[Math.floor(Math.random() * ROAD_DECAL_CONFIGS.length)];
    frame = this.scene.textures.getFrame("paperRouteProps", config.frame);
    if (!frame) {
      return;
    }

    displayWidth = config.width || 56;
    displayHeight = displayWidth * frame.height / frame.width;
    decal = this.getPooledObject("roadDecals") || this.scene.add.image(-999, -999, "paperRouteProps", config.frame);
    decal.setTexture("paperRouteProps", config.frame);
    decal.setPosition(
      clamp(this.width * (config.xRatio || (.38 + Math.random() * .24)), this.roadLeft + 32, this.roadRight - 32),
      -displayHeight - 20,
    );
    decal.setDepth(4);
    decal.setAlpha(config.alpha || .5);
    decal.setAngle(config.angle !== undefined ? config.angle : (Math.random() - .5) * 14);
    decal.setDisplaySize(displayWidth, displayHeight);
    decal.setData("frame", config.frame);
    if (!this.roadDecals.contains(decal)) {
      this.roadDecals.add(decal);
    }
  };

  PaperRouteGame.prototype.spawnFallbackTarget = function () {
    var types = ["mailbox", "doorstep", "window"];
    var type = this.targetSpawnCount === 0 ? "mailbox" : types[Math.floor(Math.random() * types.length)];
    var side = this.targetSpawnCount % 2 === 0 ? "left" : "right";
    var jitter = (Math.random() - .5) * 22;
    var x = side === "left" ? this.roadLeft * .5 + jitter : this.roadRight + (this.width - this.roadRight) * .5 + jitter;
    var texture = type === "mailbox" ? "paperRouteMailbox" : (type === "doorstep" ? "paperRouteDoorstep" : "paperRouteWindow");
    var target = this.scene.physics.add.sprite(x, -62, texture);
    var body = type === "doorstep" ? { width: 70, height: 28 } : (type === "window" ? { width: 58, height: 48 } : { width: 44, height: 42 });

    target.setDepth(9);
    target.body.setSize(body.width, body.height, true);
    target.setVelocity(0, this.currentSpeed() * .92);
    target.setData("type", type);
    target.setData("side", side);
    target.setData("hit", false);
    this.targets.add(target);
    this.targetSpawnCount += 1;
  };

  PaperRouteGame.prototype.spawnTarget = function (planned) {
    if (this.hasIntegratedTrackAtlas()) {
      return;
    }

    this.spawnFallbackTarget(planned);
  };

  PaperRouteGame.prototype.spawnRamp = function (planned) {
    var texture = "paperRouteRamp";
    var frame = null;
    var y = -58;
    var body = { width: 70, height: 32 };
    var ramp = this.getPooledObject("ramps") || this.scene.physics.add.sprite(-999, -999, texture);

    if (this.hasRoutePropsAtlas()) {
      frame = planned && planned.frame ? planned.frame : RAMP_FRAMES[(this.rampSpawnCount + this.rampFrameOffset) % RAMP_FRAMES.length];
      texture = "paperRouteProps";
      ramp.setTexture(texture, frame);
      ramp.setDisplaySize(TUNING.rampDisplay.width, TUNING.rampDisplay.height);
      ramp.y = -TUNING.rampDisplay.height / 2 - 8;
      body = TUNING.rampBody;
      this.rampSpawnCount += 1;
    } else {
      ramp.setTexture(texture);
      ramp.setPosition(clamp(this.width * ((planned && planned.xRatio) || (.42 + Math.random() * .16)), this.roadLeft + 32, this.roadRight - 32), y);
    }

    ramp.x = clamp(this.width * ((planned && planned.xRatio) || (.42 + Math.random() * .16)), this.roadLeft + 32, this.roadRight - 32);
    ramp.setDepth(8);
    ramp.body.setSize(body.width, body.height, true);
    ramp.setVelocityY(this.currentSpeed());
    ramp.setData("used", false);
    ramp.setData("frame", frame || "paperRouteRamp");
    if (!this.ramps.contains(ramp)) {
      this.ramps.add(ramp);
    }
  };

  PaperRouteGame.prototype.spawnPuddle = function (planned) {
    var texture = this.scene.textures.exists("paperRoutePuddleAsset") ? "paperRoutePuddleAsset" : "paperRoutePuddle";
    var puddle = this.getPooledObject("puddles") || this.scene.physics.add.sprite(-999, -999, texture);

    puddle.setTexture(texture);
    puddle.setPosition(clamp(this.width * ((planned && planned.xRatio) || (.38 + Math.random() * .24)), this.roadLeft + 28, this.roadRight - 28), -58);
    puddle.setDepth(7);
    puddle.setDisplaySize(TUNING.puddleDisplay.width, TUNING.puddleDisplay.height);
    puddle.body.setSize(72, 28, true);
    puddle.setVelocityY(this.currentSpeed() * .98);
    puddle.setData("used", false);
    if (!this.puddles.contains(puddle)) {
      this.puddles.add(puddle);
    }
  };

  PaperRouteGame.prototype.spawnSpot = function () {
    var spot;
    var direction;
    var y;

    if (!this.scene || !this.hasIntroAtlas() || !this.spots) {
      return;
    }
    if (this.spots.countActive(true) >= POOL_SIZES.spots) {
      return;
    }

    spot = this.getPooledObject("spots");
    if (!spot) {
      return;
    }

    direction = Math.random() < .5 ? 1 : -1;
    y = clamp(
      (this.player ? this.player.y - 10 : this.height * .72) + (Math.random() * 2 - 1) * TUNING.spotVerticalJitter,
      this.height * .44,
      this.height - 104
    );

    spot.setTexture("paperBobIntro", SPOT_SIDE_FRAMES[0]);
    spot.setOrigin(.5, .72);
    spot.setPosition(direction > 0 ? -TUNING.spotOffscreenRelease : this.width + TUNING.spotOffscreenRelease, y);
    spot.setDepth(19);
    spot.setFlipX(direction < 0);
    spot.setDisplaySize(TUNING.spotDisplay.width, TUNING.spotDisplay.height);
    spot.body.setSize(TUNING.spotBody.width, TUNING.spotBody.height, true);
    spot.setVelocity(direction * TUNING.spotSpeed, 0);
    spot.setData("type", "spot");
    spot.setData("direction", direction);
    spot.setData("speed", TUNING.spotSpeed);
    spot.setData("used", false);
    spot.setData("carryingPaper", false);
    spot.setData("bouncing", false);
    spot.setData("frame", SPOT_SIDE_FRAMES[0]);
    if (this.scene.anims.exists("spotRunSide")) {
      spot.anims.play("spotRunSide", true);
    }
    if (!this.spots.contains(spot)) {
      this.spots.add(spot);
    }
  };

  PaperRouteGame.prototype.throwPaper = function (direction, fromTouch) {
    var result;
    var paper;
    var sign = direction === "left" ? -1 : 1;

    if (!this.rules.state.running || this.rules.state.paused || this.throwCooldown > 0) {
      return;
    }
    if (this.papers && this.papers.countActive(true) >= TUNING.maxActivePapers) {
      this.syncHud("Too many papers in the air.");
      return;
    }

    result = direction === "left" ? this.rules.throwLeft() : this.rules.throwRight();
    this.applyEffects(result.effects);
    if (!result.ok) {
      return;
    }

    paper = this.getPooledObject("papers") || this.scene.physics.add.sprite(-999, -999, this.scene.textures.exists("paperRoutePaperAsset") ? "paperRoutePaperAsset" : "paperRoutePaper");
    paper.setTexture(this.scene.textures.exists("paperRoutePaperAsset") ? "paperRoutePaperAsset" : "paperRoutePaper");
    paper.setPosition(this.player.x + sign * 24, this.player.y - 28);
    paper.setDepth(16);
    paper.setDisplaySize(TUNING.paperDisplay.width, TUNING.paperDisplay.height);
    paper.setVelocity(sign * TUNING.paperSpeed, TUNING.paperLift);
    paper.setAngularVelocity(sign * 460);
    paper.setAngle(sign * -12);
    paper.body.setSize(TUNING.paperBody.width, TUNING.paperBody.height, true);
    paper.setData("direction", direction);
    paper.setData("velocityX", sign * TUNING.paperSpeed);
    paper.setData("velocityY", TUNING.paperLift);
    paper.setData("spin", sign * 460);
    paper.setData("airborneThrow", result.airborne);
    if (!this.papers.contains(paper)) {
      this.papers.add(paper);
    }
    this.throwCooldown = (fromTouch ? TUNING.touchPaperCooldown : TUNING.paperCooldown) / 1000;
    this.heldPose = result.airborne ? "air-throw-" + direction : "throw-" + direction;
    this.poseHoldUntil = this.rules.state.elapsed + .24;
    this.playerPose = "";
    this.setPlayerPose(this.heldPose);
    this.paperTrail(paper.x - sign * 10, paper.y + 4, sign);
    this.playSound("throw");
    this.syncHud(result.airborne ? "Air delivery." : (direction === "left" ? "Left toss." : "Right toss."));
  };

  PaperRouteGame.prototype.startHop = function () {
    var effects = this.rules.startHop();

    if (effects.length) {
      this.playSound("jump");
      this.applyEffects(effects);
    }
  };

  PaperRouteGame.prototype.startWheelie = function () {
    var effects = this.rules.startWheelie();

    if (effects.length) {
      this.trickHeld = true;
      this.heldPose = "";
      this.poseHoldUntil = 0;
      this.playerPose = "";
      if (this.player) {
        this.player.setAngle(this.heldRight ? 13 : -13);
        this.player.setTint(0xf6dfb7);
        this.setPlayerPose("wheelie");
      }
      this.applyEffects(effects);
    }
  };

  PaperRouteGame.prototype.stopWheelie = function () {
    var nextPose;

    this.trickHeld = false;
    this.applyEffects(this.rules.stopWheelie());
    if (this.player) {
      nextPose = this.heldLeft ? "lean-left" : (this.heldRight ? "lean-right" : "ride");
      this.heldPose = "";
      this.poseHoldUntil = 0;
      if (this.rules.isSlowed()) {
        this.player.setTint(0x557b82);
      } else {
        this.player.clearTint();
      }
      this.player.setAngle((this.heldLeft ? -1 : this.heldRight ? 1 : 0) * 4);
      this.playerPose = "";
      this.setPlayerPose(nextPose);
    }
  };

  PaperRouteGame.prototype.scoreDelivery = function (paper, target) {
    var type;
    var effects;

    if (!this.rules.state.running || target.getData("hit")) {
      return;
    }

    type = target.getData("type") || "mailbox";
    target.setData("hit", true);
    if (type === "doorstep") {
      effects = this.rules.hitDoorstep(!!paper.getData("airborneThrow"));
    } else if (type === "window") {
      effects = this.rules.hitWindow(!!paper.getData("airborneThrow"));
    } else {
      effects = this.rules.hitMailbox(!!paper.getData("airborneThrow"));
    }
    this.targetBurst(target.x, target.y, type);
    this.floatText("+" + (effects[0] ? effects[0].points : 0), target.x, target.y - 30, "#f6dfb7");
    this.releasePooledObject(paper);
    this.releasePooledObject(target);
    this.playSound(type);
    this.applyEffects(effects);
  };

  PaperRouteGame.prototype.takeRamp = function (ramp) {
    var effects;

    if (!this.rules.state.running || ramp.getData("used")) {
      return;
    }

    ramp.setData("used", true);
    effects = this.rules.takeRamp();
    this.floatText("+100", ramp.x, ramp.y - 30, "#f6dfb7");
    this.rampBurst(ramp.x, ramp.y);
    this.releasePooledObject(ramp);
    this.playSound("ramp");
    this.applyEffects(effects);
  };

  PaperRouteGame.prototype.applyPuddleContact = function (x, y) {
    var effects;

    effects = this.rules.hitPuddle();
    this.puddleBurst(x, y, this.rules.state.airborne);
    if (effects[0] && effects[0].type === "puddle-clear") {
      this.floatText("+75", x, y - 24, "#557b82");
      this.playSound("clear");
    } else {
      this.floatText("-1 paper", x, y - 24, "#b9894d");
      this.player.setTint(0x557b82);
      this.heldPose = "puddle";
      this.poseHoldUntil = this.rules.state.elapsed + .72;
      this.playerPose = "";
      this.setPlayerPose("puddle");
      this.playSound("puddle");
    }

    return effects;
  };

  PaperRouteGame.prototype.hitPuddle = function (puddle) {
    var effects;

    if (!this.rules.state.running || puddle.getData("used")) {
      return;
    }

    puddle.setData("used", true);
    effects = this.applyPuddleContact(puddle.x, puddle.y);
    this.releasePooledObject(puddle);
    this.applyEffects(effects);
  };

  PaperRouteGame.prototype.hitSpot = function (spot) {
    var effects;

    if (!spot || !this.rules.state.running || spot.getData("used")) {
      return;
    }
    if (this.rules.state.airborne) {
      return;
    }

    spot.setData("used", true);
    spot.setData("carryingPaper", true);
    spot.setData("speed", TUNING.spotPaperSpeed);
    spot.setData("frame", SPOT_RUN_PAPER_SIDE_FRAMES[0]);
    spot.setDepth(20);
    spot.setTexture("paperBobIntro", SPOT_RUN_PAPER_SIDE_FRAMES[0]);
    spot.setDisplaySize(TUNING.spotDisplay.width, TUNING.spotDisplay.height);
    spot.body.setSize(TUNING.spotBody.width, TUNING.spotBody.height, true);
    if (this.scene.anims.exists("spotRunPaperSide")) {
      spot.anims.play("spotRunPaperSide", true);
    }

    effects = this.applyPuddleContact(spot.x, spot.y);
    this.bounceSpotAfterHit(spot);
    this.applyEffects(effects);
  };

  PaperRouteGame.prototype.bounceSpotAfterHit = function (spot) {
    var direction;
    var resumeY;
    var self = this;

    if (!spot || !this.scene) {
      return;
    }

    direction = spot.getData("direction") || 1;
    resumeY = spot.y;
    spot.setData("bouncing", true);
    spot.setVelocity(0, 0);
    this.scene.tweens.add({
      targets: spot,
      x: spot.x - direction * TUNING.spotBounceDistance,
      y: resumeY - TUNING.spotBounceLift,
      duration: TUNING.spotBounceDuration,
      ease: "Quad.easeOut",
      onComplete: function () {
        if (!spot.active) {
          return;
        }
        spot.y = resumeY;
        spot.setData("bouncing", false);
        spot.setVelocity(direction * (spot.getData("speed") || TUNING.spotPaperSpeed), 0);
        if (spot.body && spot.body.updateFromGameObject) {
          spot.body.updateFromGameObject();
        }
        if (self.scene.anims.exists("spotRunPaperSide")) {
          spot.anims.play("spotRunPaperSide", true);
        }
      }
    });
  };

  PaperRouteGame.prototype.floatText = function (copy, x, y, color) {
    var label;
    var self = this;

    if (!this.scene) {
      return;
    }

    label = this.getPooledObject("floatTexts") || this.scene.add.text(-999, -999, "", {
      color: color || "#f6dfb7",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: "20px",
      fontStyle: "bold",
      stroke: "#2b2117",
      strokeThickness: 4
    });
    label.setText(copy);
    label.setPosition(x, y);
    label.setStyle({ color: color || "#f6dfb7" });
    label.setOrigin(.5);
    label.setDepth(30);

    if (this.reducedMotion) {
      this.scene.time.delayedCall(520, function () {
        self.releasePooledObject(label);
      });
      return;
    }

    this.scene.tweens.add({
      targets: label,
      alpha: 0,
      y: y - 24,
      duration: 560,
      ease: "Cubic.easeOut",
      onComplete: function () {
        self.releasePooledObject(label);
      }
    });
  };

  PaperRouteGame.prototype.paperTrail = function (x, y, sign) {
    var mark;

    if (!this.scene || this.reducedMotion) {
      return;
    }

    mark = this.scene.add.graphics({ x: x, y: y });
    mark.lineStyle(2, 0xf6dfb7, .38);
    mark.strokeLineShape(new window.Phaser.Geom.Line(-sign * 18, 0, -sign * 5, 0));
    mark.strokeLineShape(new window.Phaser.Geom.Line(-sign * 14, 6, -sign * 3, 5));
    mark.strokeLineShape(new window.Phaser.Geom.Line(-sign * 14, -6, -sign * 3, -5));
    mark.setDepth(15);
    this.scene.tweens.add({
      targets: mark,
      alpha: 0,
      duration: 220,
      onComplete: function () {
        mark.destroy();
      }
    });
  };

  PaperRouteGame.prototype.targetBurst = function (x, y, type) {
    var color = type === "window" ? 0x557b82 : (type === "doorstep" ? 0xb9894d : 0xf6dfb7);
    var texture = type === "window" ? "paperRouteWindowHitAsset" : (type === "doorstep" ? "paperRouteDoorstepHitAsset" : "paperRouteMailboxHitAsset");
    var burst;
    var burstScaleX;
    var burstScaleY;
    var self = this;

    if (!this.scene || this.reducedMotion) {
      return;
    }

    if (this.scene.textures.exists(texture)) {
      burst = this.getPooledObject("hitFlashes") || this.scene.add.image(-999, -999, texture);
      burst.setTexture(texture);
      burst.setPosition(x, y);
      burst.setDepth(24);
      burst.setDisplaySize(type === "doorstep" ? 82 : TUNING.hitFlashDisplay.width, type === "doorstep" ? 64 : TUNING.hitFlashDisplay.height);
      burst.setAlpha(.82);
      burstScaleX = burst.scaleX;
      burstScaleY = burst.scaleY;
      this.scene.tweens.add({
        targets: burst,
        alpha: 0,
        scaleX: burstScaleX * 1.06,
        scaleY: burstScaleY * 1.06,
        duration: 260,
        onComplete: function () {
          self.releasePooledObject(burst);
        }
      });
      return;
    }

    burst = this.scene.add.graphics({ x: x, y: y });
    burst.lineStyle(3, color, .72);
    burst.strokeCircle(0, 0, 18);
    burst.strokeLineShape(new window.Phaser.Geom.Line(-22, 0, 22, 0));
    burst.strokeLineShape(new window.Phaser.Geom.Line(0, -22, 0, 22));
    burst.setDepth(24);
    this.scene.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 1.5,
      duration: 260,
      onComplete: function () {
        burst.destroy();
      }
    });
  };

  PaperRouteGame.prototype.rampBurst = function (x, y) {
    var arc;

    if (!this.scene || this.reducedMotion) {
      return;
    }

    arc = this.scene.add.graphics({ x: x, y: y });
    arc.lineStyle(3, 0xb9894d, .8);
    arc.beginPath();
    arc.arc(0, -10, 34, Math.PI, Math.PI * 1.95);
    arc.strokePath();
    arc.setDepth(24);
    this.scene.tweens.add({
      targets: arc,
      alpha: 0,
      y: y - 22,
      duration: 420,
      onComplete: function () {
        arc.destroy();
      }
    });
  };

  PaperRouteGame.prototype.puddleBurst = function (x, y, cleared) {
    var splash;
    var splashScaleX;
    var splashScaleY;
    var self = this;

    if (!this.scene || this.reducedMotion) {
      return;
    }

    if (this.scene.textures.exists("paperRoutePuddleSplashAsset")) {
      splash = this.getPooledObject("puddleSplashes") || this.scene.add.image(-999, -999, "paperRoutePuddleSplashAsset");
      splash.setTexture("paperRoutePuddleSplashAsset");
      splash.setPosition(x, y);
      splash.setDepth(23);
      splash.setDisplaySize(84, 44);
      splash.setAlpha(.82);
      splash.setTint(cleared ? 0xffffff : 0xb9894d);
      splashScaleX = splash.scaleX;
      splashScaleY = splash.scaleY;
      this.scene.tweens.add({
        targets: splash,
        alpha: 0,
        scaleX: splashScaleX * 1.08,
        scaleY: splashScaleY * 1.08,
        duration: 240,
        onComplete: function () {
          self.releasePooledObject(splash);
        }
      });
      return;
    }

    splash = this.scene.add.graphics({ x: x, y: y });
    splash.lineStyle(2, cleared ? 0x557b82 : 0xf6dfb7, .72);
    splash.strokeEllipse(0, 0, 84, 30);
    splash.strokeLineShape(new window.Phaser.Geom.Line(-28, -6, -42, -18));
    splash.strokeLineShape(new window.Phaser.Geom.Line(28, -6, 42, -18));
    splash.setDepth(23);
    this.scene.tweens.add({
      targets: splash,
      alpha: 0,
      scale: 1.22,
      duration: 300,
      onComplete: function () {
        splash.destroy();
      }
    });
  };

  PaperRouteGame.prototype.applyEffects = function (effects) {
    var self = this;

    (effects || []).forEach(function (effect) {
      if (!effect) {
        return;
      }
      if (effect.type === "finish") {
        self.finish(effect);
      } else if (effect.type === "wheelie-score") {
        self.floatText("+" + effect.points, self.player.x, self.player.y - 62, "#b9894d");
        self.playSound("wheelie");
      } else if (effect.type === "land") {
        self.player.clearTint();
      }
      if (effect.message && effect.type !== "finish") {
        self.syncHud(effect.message);
      }
    });
    this.syncHud();
  };

  PaperRouteGame.prototype.handleKeyboard = function (deltaSeconds) {
    var steer = TUNING.steerSpeed * deltaSeconds;
    var vertical = TUNING.verticalSteerSpeed * deltaSeconds;

    if (!this.rules.state.running || this.rules.state.paused) {
      return;
    }
    if (this.keys.left.isDown || this.keys.a.isDown || this.heldLeft) {
      this.basePlayerX -= steer;
    }
    if (this.keys.right.isDown || this.keys.d.isDown || this.heldRight) {
      this.basePlayerX += steer;
    }
    if (this.keys.up.isDown || this.keys.w.isDown || this.heldUp) {
      this.basePlayerY -= vertical;
    }
    if (this.keys.down.isDown || this.keys.s.isDown || this.heldDown) {
      this.basePlayerY += vertical;
    }
    this.basePlayerX = clamp(this.basePlayerX, this.roadLeft + 34, this.roadRight - 34);
    this.basePlayerY = clamp(this.basePlayerY, this.height * .61, this.height * .84);

    if ((this.keys.q.isDown || this.keys.j.isDown) && this.throwCooldown <= 0) {
      this.throwPaper("left", false);
    }
    if ((this.keys.e.isDown || this.keys.l.isDown) && this.throwCooldown <= 0) {
      this.throwPaper("right", false);
    }
    if ((this.keys.space.isDown) && !this.rules.state.airborne) {
      this.startHop();
    }
    if ((this.keys.shift.isDown || this.keys.k.isDown) && !this.rules.state.wheelie) {
      this.startWheelie();
    }
    if (!this.keys.shift.isDown && !this.keys.k.isDown && !this.trickHeld && this.rules.state.wheelie) {
      this.stopWheelie();
    }
  };

  PaperRouteGame.prototype.updatePlayerPose = function () {
    var state = this.rules.state;
    var lift = 0;
    var progress;
    var pose = "ride";
    var displayScale = 1;

    if (!this.player) {
      return;
    }

    if (state.airborne && state.airborneUntil > state.airborneStartedAt) {
      progress = clamp((state.elapsed - state.airborneStartedAt) / (state.airborneUntil - state.airborneStartedAt), 0, 1);
      lift = Math.sin(progress * Math.PI) * 48;
      displayScale = 1 + Math.sin(progress * Math.PI) * .12;
      this.player.setAngle((this.heldLeft ? -1 : this.heldRight ? 1 : 0) * 8);
      this.player.setTint(0xb9894d);
      pose = state.elapsed < this.poseHoldUntil && this.heldPose ? this.heldPose : "airborne";
    } else if (state.wheelie) {
      displayScale = 1;
      this.player.setAngle(this.heldRight ? 13 : -13);
      this.player.setTint(0xf6dfb7);
      pose = "wheelie";
    } else if (state.elapsed < this.poseHoldUntil && this.heldPose) {
      this.player.setAngle((this.heldLeft ? -1 : this.heldRight ? 1 : 0) * 4);
      pose = this.heldPose;
    } else {
      this.heldPose = "";
      displayScale = 1;
      this.player.setAngle((this.heldLeft ? -1 : this.heldRight ? 1 : 0) * 4);
      pose = this.heldLeft ? "lean-left" : (this.heldRight ? "lean-right" : "ride");
      if (!this.rules.isSlowed()) {
        this.player.clearTint();
      }
    }

    this.setPlayerDisplaySize(displayScale);
    this.setPlayerPose(pose);
    this.player.setPosition(this.basePlayerX, this.basePlayerY - lift);
  };

  PaperRouteGame.prototype.updateScene = function (time, delta) {
    var deltaSeconds = Math.min(delta / 1000, .05);
    var speed;
    var scrollDelta;
    var self = this;
    var effects;

    if (!this.scene) {
      return;
    }
    if (this.introMode === "intro-cinematic") {
      this.updateIntro(deltaSeconds);
      return;
    }
    if (!this.rules.state.running || this.rules.state.paused) {
      return;
    }

    this.throwCooldown = Math.max(0, this.throwCooldown - deltaSeconds);
    this.targetTimer -= deltaSeconds;
    this.puddleTimer -= deltaSeconds;
    this.spotTimer -= deltaSeconds;
    this.rampTimer -= deltaSeconds;
    this.roadDecalTimer -= deltaSeconds;
    this.handleKeyboard(deltaSeconds);
    speed = this.currentSpeed();
    scrollDelta = speed * deltaSeconds;
    this.routeOffset += scrollDelta;
    this.redrawBackground();
    this.updateTrackSegments(scrollDelta);
    this.targets.children.each(function (target) {
      var segment;

      if (!target.active) {
        return;
      }
      if (target.getData("targetConfig")) {
        segment = target.getData("segment");
        if (!segment || !segment.active) {
          self.releasePooledObject(target);
          return;
        }
        self.positionTrackSegmentHitbox(segment, target);
        target.setVelocity(0, 0);
        return;
      }
      if (target.getData("propertyFrame") && !self.targetWithinRouteBounds(target)) {
        self.releasePooledObject(target);
        return;
      }
      target.setVelocity(0, speed * .92);
      if (target.y > self.height + 90) {
        self.releasePooledObject(target);
      }
    });
    this.ramps.children.each(function (ramp) {
      if (!ramp.active) {
        return;
      }
      ramp.setVelocityY(speed);
      if (ramp.y > self.height + 90) {
        self.releasePooledObject(ramp);
      }
    });
    this.puddles.children.each(function (puddle) {
      if (!puddle.active) {
        return;
      }
      puddle.setVelocityY(speed * .98);
      if (puddle.y > self.height + 90) {
        self.releasePooledObject(puddle);
      }
    });
    if (this.spots) {
      this.spots.children.each(function (spot) {
        var direction;
        var spotSpeed;

        if (!spot.active) {
          return;
        }

        direction = spot.getData("direction") || 1;
        spotSpeed = spot.getData("speed") || TUNING.spotSpeed;
        if (!spot.getData("bouncing")) {
          spot.setVelocity(direction * spotSpeed, 0);
        }
        if (spot.x < -TUNING.spotOffscreenRelease || spot.x > self.width + TUNING.spotOffscreenRelease) {
          self.releasePooledObject(spot);
        }
      });
    }
    if (this.roadDecals) {
      this.roadDecals.children.each(function (decal) {
        if (!decal.active) {
          return;
        }
        decal.y += speed * .88 * deltaSeconds;
        if (decal.y > self.height + 100) {
          self.releasePooledObject(decal);
        }
      });
    }
    this.papers.children.each(function (paper) {
      if (!paper.active) {
        return;
      }
      paper.x += (paper.getData("velocityX") || 0) * deltaSeconds;
      paper.y += (paper.getData("velocityY") || 0) * deltaSeconds;
      paper.angle += (paper.getData("spin") || 0) * deltaSeconds;
      if (paper.body && paper.body.updateFromGameObject) {
        paper.body.updateFromGameObject();
      }
      if (paper.x < -80 || paper.x > self.width + 80 || paper.y < -90 || paper.y > self.height + 80) {
        self.applyEffects(self.rules.missPaper());
        self.playSound("miss");
        self.releasePooledObject(paper);
      }
    });

    if (!this.hasIntegratedTrackAtlas() && this.targetTimer <= 0) {
      this.spawnTarget();
      this.targetTimer = this.nextTargetInterval();
    }
    if (this.puddleTimer <= 0) {
      this.spawnPuddle();
      this.puddleTimer = this.nextPuddleInterval();
    }
    if (this.spotTimer <= 0) {
      this.spawnSpot();
      this.spotTimer = TUNING.spotInterval / 1000;
    }
    if (this.rampTimer <= 0) {
      this.spawnRamp();
      this.rampTimer = this.nextRampInterval();
    }
    if (this.roadDecalTimer <= 0) {
      this.spawnRoadDecal();
      this.roadDecalTimer = this.nextRoadDecalInterval();
    }

    effects = this.rules.tick(deltaSeconds, this.papers.countActive(true));
    this.updatePlayerPose();
    this.applyEffects(effects);
  };

  PaperRouteGame.prototype.finish = function (effect) {
    var state = this.rules.state;
    var title;
    var copy;
    var self = this;
    var sequenceId = this.finishSequenceId + 1;
    var showDelay = this.reducedMotion ? 80 : 1800;

    this.finishSequenceId = sequenceId;
    this.scene.physics.pause();
    this.clearObjects();
    this.setTouchPanel(false);
    this.player.clearTint();
    this.player.setAngle(0);
    this.setPlayerDisplaySize(1.08);
    this.playerPose = "";
    this.setPlayerPose("run-end");

    if (effect && effect.newBest) {
      this.highScore = state.highScore;
      writeHighScore(this.highScore);
    }

    if (this.pauseCard) {
      this.pauseCard.hidden = true;
    }
    if (this.summaryCard) {
      this.summaryCard.hidden = true;
    }
    this.clearFinalScore();
    this.clearSummaryMetrics();
    if (this.stage) {
      this.stage.classList.remove("paper-route-stage--paused");
    }

    title = effect && effect.newBest ? "New Paper-Bob record" : "Edition delivered";
    copy = "Final score " + state.score + ".";
    if (state.finishReason === "papers") {
      copy += " The bag ran dry.";
    }

    if (this.pauseButton) {
      this.pauseButton.textContent = "Pause";
      this.pauseButton.disabled = true;
    }
    if (this.restartButton) {
      this.restartButton.disabled = false;
    }

    this.playSound(effect && effect.newBest ? "record" : "end");
    this.syncHud("Run filed. Bob checks the final edition.");

    window.setTimeout(function () {
      if (self.finishSequenceId !== sequenceId) {
        return;
      }

      if (self.summaryTitle) {
        self.summaryTitle.textContent = title;
      }
      if (self.summaryCopy) {
        self.summaryCopy.textContent = copy;
      }
      self.renderSummaryMetrics(state);
      self.showFinalScore(state.score);
      if (self.summaryCard) {
        self.summaryCard.hidden = false;
      }
      self.syncHud(effect && effect.newBest ? "New record saved in this browser." : "Final edition filed.");

      if (self.summaryRestart) {
        window.setTimeout(function () {
          if (self.finishSequenceId === sequenceId) {
            self.summaryRestart.focus({ preventScroll: true });
          }
        }, 20);
      }
    }, showDelay);
  };

  PaperRouteGame.prototype.togglePause = function () {
    if (!this.rules.state.running) {
      return;
    }

    if (!this.rules.state.paused) {
      this.rules.setPaused(true);
      this.scene.physics.pause();
      if (this.pauseButton) {
        this.pauseButton.textContent = "Resume";
      }
      if (this.pauseCard) {
        this.pauseCard.hidden = false;
      }
      if (this.stage) {
        this.stage.classList.add("paper-route-stage--paused");
      }
      this.setTouchPanel(false);
      this.syncHud("Deadline hold.");
    } else {
      this.rules.setPaused(false);
      this.scene.physics.resume();
      if (this.pauseButton) {
        this.pauseButton.textContent = "Pause";
      }
      if (this.pauseCard) {
        this.pauseCard.hidden = true;
      }
      if (this.stage) {
        this.stage.classList.remove("paper-route-stage--paused");
      }
      this.setTouchPanel(true);
      this.syncHud("Back on the route.");
    }
  };

  PaperRouteGame.prototype.advanceTime = function (milliseconds) {
    var remaining = Math.max(0, Math.min(120000, Number(milliseconds) || 0));
    var stepMs;

    while (remaining > 0 && this.rules.state.running && !this.rules.state.paused) {
      stepMs = Math.min(50, remaining);
      this.updateScene(0, stepMs);
      remaining -= stepMs;
    }

    return this.renderStateText();
  };

  PaperRouteGame.prototype.renderStateText = function () {
    var self = this;

    function snapshot(group) {
      var items = [];

      if (!group) {
        return items;
      }

      group.children.each(function (child) {
        var owner = child.getData ? child.getData("property") : null;
        var targetConfig = child.getData ? child.getData("targetConfig") : null;

        if (child.active && items.length < 8) {
          items.push({
            x: Math.round(child.x),
            y: Math.round(child.y),
            displayWidth: Math.round(child.displayWidth || child.width || 0),
            displayHeight: Math.round(child.displayHeight || child.height || 0),
            type: child.getData ? child.getData("type") || child.texture.key : null,
            side: child.getData ? child.getData("side") : null,
            direction: child.getData ? child.getData("direction") : null,
            used: child.getData ? !!child.getData("used") : null,
            carryingPaper: child.getData ? !!child.getData("carryingPaper") : null,
            frame: child.getData ? child.getData("frame") || child.getData("propertyFrame") || (child.frame ? child.frame.name : null) : null,
            propertyTop: child.getData && child.getData("propertyTop") !== undefined ? Math.round(child.getData("propertyTop")) : null,
            propertyBottom: child.getData && child.getData("propertyBottom") !== undefined ? Math.round(child.getData("propertyBottom")) : null,
            segmentTop: child.getData && child.getData("segmentTop") !== undefined ? Math.round(child.getData("segmentTop")) : null,
            segmentBottom: child.getData && child.getData("segmentBottom") !== undefined ? Math.round(child.getData("segmentBottom")) : null,
            ownerActive: owner ? !!owner.active : null,
            ownerX: owner ? Math.round(owner.x) : null,
            ownerY: owner ? Math.round(owner.y) : null,
            ownerFrame: owner && owner.getData ? owner.getData("frame") : null,
            targetConfigX: targetConfig ? targetConfig.x : null,
            targetConfigY: targetConfig ? targetConfig.y : null,
            targetGroupIndex: child.getData ? child.getData("targetGroupIndex") : null
          });
        }
      });

      return items;
    }

    return JSON.stringify({
      coordinateSystem: "origin top-left; x right; y down; route scrolls downward toward Paper Bob",
      mode: !this.introComplete ? "intro" : (this.rules.state.running ? (this.rules.state.paused ? "paused" : "running") : (this.summaryCard && !this.summaryCard.hidden ? "complete" : (this.rules.state.finishReason ? "run-end" : "ready"))),
      introMode: this.introMode,
      introProgress: Math.round((this.introComplete ? 1 : Math.min(.98, this.routeLoadProgress)) * 1000) / 1000,
      webpSupported: this.webpSupported,
      routeAssetsStarted: this.routeAssetsStarted,
      routeAssetsReady: this.routeAssetsReady,
      routeAssetsFailed: this.routeAssetsFailed,
      routeLoadProgress: Math.round(this.routeLoadProgress * 1000) / 1000,
      poolCounts: this.poolStats,
      score: this.rules.state.score,
      highScore: this.highScore,
      papers: this.rules.state.papers,
      timeRemaining: Math.ceil(this.rules.state.timeRemaining),
      streak: this.rules.state.streak,
      airborne: this.rules.state.airborne,
      wheelie: this.rules.state.wheelie,
      slowed: this.rules.isSlowed(),
      deliveries: this.rules.state.deliveries,
      missed: this.rules.state.missed,
      puddleHits: this.rules.state.puddleHits,
      puddlesCleared: this.rules.state.puddlesCleared,
      rampsTaken: this.rules.state.rampsTaken,
      spotNextIn: Math.max(0, Math.round(this.spotTimer * 100) / 100),
      speed: Math.round(this.currentSpeed()),
      bobPose: this.playerPose,
      bobSpriteSheetLoaded: this.hasBobSheet(),
      routePropsAtlasLoaded: this.hasRoutePropsAtlas(),
      lotsAtlasLoaded: this.hasLotsAtlas(),
      trackAtlasLoaded: this.hasTrackAtlas(),
      roadKitLoaded: !!this.roadSurface,
      trackSegmentsLoaded: this.hasIntegratedTrackAtlas(),
      player: {
        x: this.player ? Math.round(this.player.x) : 0,
        y: this.player ? Math.round(this.player.y) : 0,
        roadLeft: Math.round(self.roadLeft),
        roadRight: Math.round(self.roadRight)
      },
      overlayLayout: {
        startCardVisible: !!(this.startCard && !this.startCard.hidden),
        summaryVisible: !!(this.summaryCard && !this.summaryCard.hidden),
        resultTileCount: this.lastSummaryMetrics.length,
        summaryRestartVisible: !!(this.summaryRestart && this.summaryCard && !this.summaryCard.hidden),
        touchVisible: !!(this.touchPanel && !this.touchPanel.hidden)
      },
      summaryMetrics: this.lastSummaryMetrics,
      finalScore: {
        visible: !!(this.finalScoreText && this.finalScoreText.visible),
        text: this.finalScoreText ? this.finalScoreText.text : "",
        x: this.finalScoreText && this.finalScoreText.visible ? Math.round(this.finalScoreText.x) : null,
        y: this.finalScoreText && this.finalScoreText.visible ? Math.round(this.finalScoreText.y) : null
      },
      routeLayering: {
        roadSurfaceLeft: Math.round(self.roadSurface ? self.roadSurface.x : self.roadLeft),
        roadSurfaceRight: Math.round(self.roadSurface ? self.roadSurface.x + self.roadSurface.displayWidth : self.roadRight),
        trackLeftRightEdge: Math.round(self.trackSegmentX("left") + self.trackSegmentDisplayWidth("left")),
        trackRightLeftEdge: Math.round(self.trackSegmentX("right")),
        leftCurbVisible: !!(self.roadLeftCurb && self.roadLeftCurb.visible),
        rightCurbVisible: !!(self.roadRightCurb && self.roadRightCurb.visible)
      },
      visibleTargets: snapshot(this.targets),
      visibleTrackSegments: snapshot(this.trackSegments),
      visibleRamps: snapshot(this.ramps),
      visiblePuddles: snapshot(this.puddles),
      visibleSpots: snapshot(this.spots),
      visibleRoadDecals: snapshot(this.roadDecals),
      visiblePapers: snapshot(this.papers)
    });
  };

  PaperRouteGame.prototype.observeTheme = function () {
    var self = this;

    if (!window.MutationObserver) {
      return;
    }

    this.themeObserver = new window.MutationObserver(function () {
      self.redrawBackground();
    });
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  };

  PaperRouteGame.prototype.destroy = function () {
    while (this.cleanup.length) {
      this.cleanup.pop()();
    }
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    if (this.container) {
      this.container.innerHTML = "";
    }
    if (ACTIVE_GAME === this) {
      ACTIVE_GAME = null;
    }
  };

  window.OipPaperRouteGame = {
    mount: function (options) {
      if (ACTIVE_GAME) {
        ACTIVE_GAME.destroy();
      }
      ACTIVE_GAME = new PaperRouteGame(options || {});
      return ACTIVE_GAME;
    }
  };

  window.render_game_to_text = function () {
    return ACTIVE_GAME ? ACTIVE_GAME.renderStateText() : JSON.stringify({ mode: "unmounted" });
  };

  window.advanceTime = function (milliseconds) {
    return ACTIVE_GAME ? ACTIVE_GAME.advanceTime(milliseconds) : JSON.stringify({ mode: "unmounted" });
  };
}());
