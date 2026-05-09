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
    rampApproach: 10,
    rampMount: 11,
    rampLift: 12,
    airbornePeak: 13,
    airborneLeftPeak: 14,
    airborneHold: 15,
    rampLand: 16,
    rampRecover: 17,
    wheelieStart: 18,
    wheelieRise1: 19,
    wheelieRise2: 20,
    wheeliePeak: 21,
    wheeliePeakAlt: 22,
    wheelieHold: 23,
    wheelieLand: 24,
    wheelieRecover: 25,
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
  var INTRO_DURATION = 10.2;
  var INTRO_BEAT_SEQUENCE = [
    { key: "sketch-draw", start: 0, end: 2 },
    { key: "bob-ride", start: 2, end: 4.3 },
    { key: "spot-cross", start: 4.3, end: 6 },
    { key: "finale", start: 6, end: 8.4 },
    { key: "hold", start: 8.4, end: 10.2 }
  ];
  var INTRO_OIP_SETTING_FRAME = "intro_oip_setting_plate";
  var INTRO_RIDE_FRAMES = ["intro_bob_ride_front_01", "intro_bob_ride_front_02", "intro_bob_ride_front_03", "intro_bob_ride_front_04", "intro_bob_ride_front_05", "intro_bob_ride_front_06"];
  var INTRO_RIDE_PERSONALITY_FRAMES = ["intro_bob_ride_bubble_gum", "intro_bob_ride_peace"];
  var INTRO_BOB_SPOT_FINALE_FRAMES = ["intro_bob_spot_finale_01", "intro_bob_spot_finale_02", "intro_bob_spot_finale_03", "intro_bob_spot_finale_04", "intro_bob_spot_finale_05", "intro_bob_spot_finale_06"];
  var INTRO_OIP_BOB_RIDE_FRAMES = ["intro_oip_bob_ride_01", "intro_oip_bob_ride_02", "intro_oip_bob_ride_03", "intro_oip_bob_ride_04", "intro_oip_bob_ride_05", "intro_oip_bob_ride_06"];
  var INTRO_OIP_BOB_PERSONALITY_FRAMES = ["intro_oip_bob_ride_bubble_gum", "intro_oip_bob_ride_peace"];
  var INTRO_OIP_SPOT_PAPER_SIDE_FRAMES = ["intro_oip_spot_paper_side_01", "intro_oip_spot_paper_side_02", "intro_oip_spot_paper_side_03", "intro_oip_spot_paper_side_04", "intro_oip_spot_paper_side_05", "intro_oip_spot_paper_side_06"];
  var INTRO_OIP_BOB_SPOT_FINALE_FRAMES = ["intro_oip_bob_spot_finale_01", "intro_oip_bob_spot_finale_02", "intro_oip_bob_spot_finale_03", "intro_oip_bob_spot_finale_04", "intro_oip_bob_spot_finale_05", "intro_oip_bob_spot_finale_06"];
  var INTRO_SKETCH_BOB_RIDE_FRAMES = ["intro_sketch_bob_ride_01", "intro_sketch_bob_ride_02", "intro_sketch_bob_ride_03", "intro_sketch_bob_ride_04", "intro_sketch_bob_ride_05", "intro_sketch_bob_ride_06"];
  var INTRO_SKETCH_SPOT_PAPER_SIDE_FRAMES = ["intro_sketch_spot_paper_side_01", "intro_sketch_spot_paper_side_02", "intro_sketch_spot_paper_side_03", "intro_sketch_spot_paper_side_04", "intro_sketch_spot_paper_side_05", "intro_sketch_spot_paper_side_06"];
  var INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES = ["intro_sketch_bob_spot_finale_01", "intro_sketch_bob_spot_finale_02", "intro_sketch_bob_spot_finale_03", "intro_sketch_bob_spot_finale_04", "intro_sketch_bob_spot_finale_05", "intro_sketch_bob_spot_finale_06"];
  var END_RUN_PAPER_DOORSTEP_FRAMES = ["end_run_paper_doorstep_skid_01", "end_run_paper_doorstep_skid_02", "end_run_paper_doorstep_skid_03", "end_run_paper_doorstep_skid_04", "end_run_paper_doorstep_skid_05", "end_run_paper_doorstep_skid_06", "end_run_paper_doorstep_skid_07", "end_run_paper_doorstep_skid_08", "end_run_paper_doorstep_skid_09", "end_run_paper_doorstep_skid_10", "end_run_paper_doorstep_skid_11", "end_run_paper_doorstep_skid_12", "end_run_paper_doorstep_skid_13"];
  var END_RUN_DOORSTEP_PLATE_FRAME = "end_run_doorstep_plate";
  var END_RUN_SCORE_REVEAL_AT = 4.08;
  var END_RUN_SUMMARY_REVEAL_AT = 4.5;
  var END_RUN_EXTRA_REVEAL_AT = 3.86;
  var END_RUN_ROWS_REVEAL_AT = 4.18;
  var END_RUN_TOTAL_FRAMES = 38;
  var END_RUN_BEAT_SEQUENCE = [
    { key: "run-end", start: 0, end: .27 },
    { key: "spot-dodge", start: .27, end: .72 },
    { key: "puddle-wheelie", start: .72, end: 1.35 },
    { key: "paper-throw", start: 1.35, end: 2.47 },
    { key: "paper-follow", start: 2.47, end: 3.08 },
    { key: "porch-skid", start: 3.08, end: 3.84 },
    { key: "stamp-ink", start: 3.84, end: 4.5 },
    { key: "results", start: 4.5, end: 4.7 }
  ];
  var END_RUN_FRAME_TIMINGS = [
    .09, .09, .09, .09, .09, .09, .09, .09, .09, .09, .09, .09, .09, .09, .09,
    .16, .16, .16, .16, .16, .16, .16,
    .105, .105, .105, .105, .105, .105, .105, .105, .105, .105, .105, .105, .105,
    .22, .22, .24
  ];
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

  function easeOutCubic(value) {
    var t = clamp(value, 0, 1);

    return 1 - Math.pow(1 - t, 3);
  }

  function blendRgbTint(from, to, amount) {
    var t = clamp(amount, 0, 1);
    var fromRed = (from >> 16) & 255;
    var fromGreen = (from >> 8) & 255;
    var fromBlue = from & 255;
    var toRed = (to >> 16) & 255;
    var toGreen = (to >> 8) & 255;
    var toBlue = to & 255;
    var red = Math.round(fromRed + (toRed - fromRed) * t);
    var green = Math.round(fromGreen + (toGreen - fromGreen) * t);
    var blue = Math.round(fromBlue + (toBlue - fromBlue) * t);

    return (red << 16) + (green << 8) + blue;
  }

  function introBeatAt(time) {
    var index;
    var beat;

    for (index = 0; index < INTRO_BEAT_SEQUENCE.length; index += 1) {
      beat = INTRO_BEAT_SEQUENCE[index];
      if (time >= beat.start && time < beat.end) {
        return beat;
      }
    }

    return INTRO_BEAT_SEQUENCE[INTRO_BEAT_SEQUENCE.length - 1];
  }

  function endRunBeatAt(time) {
    var index;
    var beat;

    for (index = 0; index < END_RUN_BEAT_SEQUENCE.length; index += 1) {
      beat = END_RUN_BEAT_SEQUENCE[index];
      if (time >= beat.start && time < beat.end) {
        return beat;
      }
    }

    return END_RUN_BEAT_SEQUENCE[END_RUN_BEAT_SEQUENCE.length - 1];
  }

  function introColorBlendAt(time) {
    if (time < 7.6) {
      return 0;
    }
    if (time < 9.4) {
      return easeOutCubic((time - 7.6) / 1.8);
    }

    return 1;
  }

  function endRunColorBlendAt(time) {
    return 1;
  }

  function introOipBlendAt(time) {
    if (time < 2) {
      return 0;
    }
    if (time < 4.3) {
      return easeOutCubic((time - 2) / 2.3);
    }

    return 1;
  }

  function endRunOipBlendAt(time) {
    return 0;
  }

  function endRunFrameAt(time) {
    var elapsed = 0;
    var index;

    for (index = 0; index < END_RUN_FRAME_TIMINGS.length; index += 1) {
      elapsed += END_RUN_FRAME_TIMINGS[index];
      if (time < elapsed) {
        return index + 1;
      }
    }

    return END_RUN_TOTAL_FRAMES;
  }

  function introRideFrameAt(frames, personalityFrames, beat, time, frameRate) {
    var progress = clamp((time - beat.start) / Math.max(.01, beat.end - beat.start), 0, 1);

    if (personalityFrames && personalityFrames.length) {
      if (progress >= .82) {
        return personalityFrames[Math.min(personalityFrames.length - 1, 1)];
      }
      if (progress >= .68) {
        return personalityFrames[0];
      }
    }

    return frameFromTime(frames, time - beat.start, frameRate, false);
  }

  function frameFromTime(frames, elapsed, frameRate, clampToEnd) {
    var index;

    if (!frames.length) {
      return "";
    }
    index = Math.floor(Math.max(0, elapsed) * frameRate);
    if (clampToEnd) {
      index = Math.min(frames.length - 1, index);
    } else {
      index = index % frames.length;
    }

    return frames[index];
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
    this.dpadSurface = this.touchPanel && this.touchPanel.querySelector ? this.touchPanel.querySelector("[data-paper-route-dpad]") : null;
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
    this.introSketchLayer = null;
    this.endRunLayer = null;
    this.introObjects = {};
    this.introSketchObjects = {};
    this.endRunObjects = {};
    this.keys = {};
    this.heldLeft = false;
    this.heldRight = false;
    this.heldUp = false;
    this.heldDown = false;
    this.touchSteerActive = false;
    this.touchSteerTargetX = null;
    this.touchSteerPointerId = null;
    this.touchSteerDirection = 0;
    this.dpadActive = false;
    this.dpadPointerId = null;
    this.dpadDirection = "";
    this.lastTouchZone = "";
    this.touchControlMode = "gameboy-dock";
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
    this.introBeat = "idle";
    this.introBobFrame = "";
    this.introSpotFrame = "";
    this.introFinaleFrame = "";
    this.introSketchReveal = 0;
    this.introColorBlend = 0;
    this.introOipBlend = 0;
    this.introSketchFrame = "";
    this.introSettingFrame = "";
    this.endRunActive = false;
    this.endRunElapsed = 0;
    this.endRunBeat = "idle";
    this.endRunOipBlend = 0;
    this.endRunColorBlend = 1;
    this.endRunSpotVisible = false;
    this.endRunFinaleVisible = false;
    this.endRunFinaleFrame = "";
    this.endRunBobVisible = false;
    this.endRunBobFrame = "";
    this.endRunEditionVisible = false;
    this.endRunEditionFrame = "";
    this.endRunFrontPageVisible = false;
    this.endRunPaperVisible = false;
    this.endRunPaperFrame = "";
    this.endRunPorchVisible = false;
    this.endRunExtraStampVisible = false;
    this.endRunSummaryRowsVisible = false;
    this.endRunSidePanelsVisible = false;
    this.endRunOipTreatmentActive = false;
    this.endRunSkipped = false;
    this.endRunFrame = 0;
    this.endRunScoreStamped = false;
    this.endRunCameraZoom = 1;
    this.endRunScoreShown = false;
    this.endRunSummaryShown = false;
    this.endRunSummaryState = null;
    this.endRunTitle = "";
    this.endRunCopy = "";
    this.endRunNewBest = false;
    this.endRunSequenceId = 0;
    this.playerPose = "";
    this.poseHoldUntil = 0;
    this.heldPose = "";
    this.wheelieVisualStartedAt = 0;
    this.wheelieRecoverUntil = 0;
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
        if (button.setPointerCapture) {
          try {
            button.setPointerCapture(event.pointerId);
          } catch (error) {
            // Synthetic smoke-test pointer events may not have an active capture target.
          }
        }
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

    this.bindDpadSurface();

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

    if (key === "Enter" && !buttonTarget && this.endRunActive) {
      handled = this.skipEndRunCinematic();
    } else if (key === "Enter" && !buttonTarget && !this.introComplete) {
      if (this.introPrepComplete) {
        this.skipIntro();
        handled = true;
      }
    } else if (key === "ArrowLeft" || key === "a" || key === "A") {
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

  PaperRouteGame.prototype.bindDpadSurface = function () {
    var self = this;

    if (!this.dpadSurface) {
      return;
    }

    this.bind(this.dpadSurface, "pointerdown", function (event) {
      event.preventDefault();
      self.dpadActive = true;
      self.dpadPointerId = event.pointerId !== undefined ? event.pointerId : null;
      if (self.dpadSurface.setPointerCapture && event.pointerId !== undefined) {
        try {
          self.dpadSurface.setPointerCapture(event.pointerId);
        } catch (error) {
          // Synthetic smoke-test pointer events may not have an active capture target.
        }
      }
      self.updateDpadFromPointerEvent(event);
    });
    this.bind(this.dpadSurface, "pointermove", function (event) {
      if (!self.dpadActive) {
        return;
      }
      if (self.dpadPointerId !== null && event.pointerId !== undefined && event.pointerId !== self.dpadPointerId) {
        return;
      }
      event.preventDefault();
      self.updateDpadFromPointerEvent(event);
    });
    this.bind(this.dpadSurface, "pointerup", function (event) {
      if (self.dpadPointerId === null || event.pointerId === undefined || event.pointerId === self.dpadPointerId) {
        event.preventDefault();
        self.releaseDpad();
      }
    });
    this.bind(this.dpadSurface, "pointercancel", function () {
      self.releaseDpad();
    });
    this.bind(this.dpadSurface, "lostpointercapture", function () {
      self.releaseDpad();
    });
  };

  PaperRouteGame.prototype.updateDpadFromPointerEvent = function (event) {
    var rect;
    var x;
    var y;
    var dx;
    var dy;
    var deadZone;
    var direction = "";

    if (!this.dpadSurface || !this.dpadSurface.getBoundingClientRect) {
      return;
    }

    rect = this.dpadSurface.getBoundingClientRect();
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
    dx = x - rect.width / 2;
    dy = y - rect.height / 2;
    deadZone = Math.min(rect.width, rect.height) * .16;

    if (Math.sqrt(dx * dx + dy * dy) >= deadZone) {
      direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
    }

    this.applyDpadDirection(direction);
  };

  PaperRouteGame.prototype.applyDpadDirection = function (direction) {
    this.heldLeft = direction === "left";
    this.heldRight = direction === "right";
    this.heldUp = direction === "up";
    this.heldDown = direction === "down";
    this.dpadDirection = direction;
    this.lastTouchZone = direction ? "dpad-" + direction : "dpad-center";
  };

  PaperRouteGame.prototype.releaseDpad = function () {
    this.dpadActive = false;
    this.dpadPointerId = null;
    this.applyDpadDirection("");
  };

  PaperRouteGame.prototype.pointerIsTouchLike = function (pointer) {
    var event = pointer && pointer.event;
    var pointerType = event && event.pointerType;

    if (pointerType === "touch" || pointerType === "pen") {
      return true;
    }
    if (window.innerWidth <= 720) {
      return true;
    }

    return !!(window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches);
  };

  PaperRouteGame.prototype.stagePointerId = function (pointer) {
    if (!pointer) {
      return null;
    }
    if (pointer.event && pointer.event.pointerId !== undefined) {
      return pointer.event.pointerId;
    }
    if (pointer.id !== undefined) {
      return pointer.id;
    }
    return pointer.pointerId !== undefined ? pointer.pointerId : null;
  };

  PaperRouteGame.prototype.stageTouchZone = function (x) {
    if (x < this.roadLeft) {
      return "left-panel";
    }
    if (x > this.roadRight) {
      return "right-panel";
    }
    return "road";
  };

  PaperRouteGame.prototype.clearStageTouchState = function () {
    this.touchSteerActive = false;
    this.touchSteerTargetX = null;
    this.touchSteerPointerId = null;
    this.touchSteerDirection = 0;
  };

  PaperRouteGame.prototype.bindStagePointerInput = function (scene) {
    var self = this;

    scene.input.on("pointerdown", function (pointer) {
      self.handleStagePointerDown(pointer);
    });
    scene.input.on("pointermove", function (pointer) {
      self.handleStagePointerMove(pointer);
    });
    scene.input.on("pointerup", function (pointer) {
      self.handleStagePointerUp(pointer);
    });
    scene.input.on("pointerupoutside", function (pointer) {
      self.handleStagePointerUp(pointer);
    });
  };

  PaperRouteGame.prototype.handleStagePointerDown = function (pointer) {
    var x;

    if (this.endRunActive) {
      this.lastTouchZone = "end-run-skip";
      this.skipEndRunCinematic();
      return;
    }

    if (!this.pointerIsTouchLike(pointer)) {
      return;
    }

    x = clamp(pointer.x || 0, 0, this.width);
    this.lastTouchZone = this.stageTouchZone(x);

    if (!this.introComplete) {
      if (this.introPrepComplete) {
        this.lastTouchZone = "intro-skip";
        this.skipIntro();
      } else {
        this.lastTouchZone = "intro-loading";
      }
      return;
    }

    this.lastTouchZone = "gamepad-only";
    this.clearStageTouchState();
  };

  PaperRouteGame.prototype.handleStagePointerMove = function (pointer) {
    if (!this.pointerIsTouchLike(pointer)) {
      return;
    }

    this.clearStageTouchState();
  };

  PaperRouteGame.prototype.handleStagePointerUp = function (pointer) {
    if (this.pointerIsTouchLike(pointer)) {
      this.clearStageTouchState();
    }
  };

  PaperRouteGame.prototype.handleAction = function (action, pressed) {
    if (pressed) {
      this.lastTouchZone = "gamepad-" + action;
    }
    if (action === "steer-left") {
      this.heldLeft = pressed;
    } else if (action === "steer-right") {
      this.heldRight = pressed;
    } else if (action === "steer-up") {
      this.heldUp = pressed;
    } else if (action === "steer-down") {
      this.heldDown = pressed;
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
      var label = document.createElement("span");
      var leader = document.createElement("span");
      var value = document.createElement("strong");

      tile.className = "paper-route-result-tile paper-route-result-tile--" + item.key;
      tile.setAttribute("role", "listitem");
      tile.setAttribute("aria-label", item.aria || (item.label + ": " + item.value));
      icon.className = "paper-route-result-icon";
      icon.setAttribute("aria-hidden", "true");
      label.className = "paper-route-result-label";
      label.textContent = item.label;
      leader.className = "paper-route-result-leader";
      leader.setAttribute("aria-hidden", "true");
      value.textContent = item.value;
      tile.appendChild(icon);
      tile.appendChild(label);
      tile.appendChild(leader);
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
    this.finalScoreText.setColor("#fff8e8");
    if (this.finalScoreText.setStroke) {
      this.finalScoreText.setStroke("#2b2117", 7);
    }
  };

  PaperRouteGame.prototype.showFinalScore = function (score, newBest) {
    var frontPage;
    var finale;
    var scoreText;
    var x;
    var y;

    if (!this.finalScoreText) {
      return;
    }

    scoreText = this.finalScoreText;
    frontPage = this.endRunObjects ? this.endRunObjects.frontPage : null;
    finale = this.endRunObjects ? (this.endRunObjects.bobJump || this.endRunObjects.colorFinale || this.endRunObjects.oipFinale) : null;
    if (frontPage && (frontPage.visible || this.endRunFrontPageVisible)) {
      scoreText.setVisible(false);
      this.endRunScoreStamped = true;
      return;
    } else if (finale && (finale.visible || this.endRunFinaleVisible)) {
      x = finale.x;
      y = finale.y - Math.max(118, (finale.displayHeight || 0) * .46);
      scoreText.setColor(newBest ? "#ffe0a3" : "#fff8e8");
      if (scoreText.setStroke) {
        scoreText.setStroke("#2b2117", 7);
      }
    } else {
      x = this.player ? this.player.x : this.width * .5;
      y = this.player ? this.player.y - 116 : this.height * .62;
      scoreText.setColor(newBest ? "#ffe0a3" : "#fff8e8");
      if (scoreText.setStroke) {
        scoreText.setStroke("#2b2117", 7);
      }
    }
    this.finalScoreText.setText(String(Math.max(0, Math.round(score || 0))));
    this.finalScoreText.setPosition(x, y);
    this.finalScoreText.setVisible(true);
    this.endRunScoreStamped = true;

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
    if (newBest) {
      this.scene.tweens.add({
        targets: this.finalScoreText,
        scale: 1.08,
        duration: 220,
        ease: "Sine.InOut",
        yoyo: true,
        repeat: 1,
        delay: 120,
        onComplete: function () {
          scoreText.setScale(1);
        }
      });
    }
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
    this.bindStagePointerInput(scene);

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
    create("bobWheelieRise", [BOB_FRAME.wheelieStart, BOB_FRAME.wheelieRise2, BOB_FRAME.wheeliePeak, BOB_FRAME.wheeliePeakAlt, BOB_FRAME.wheelieHold, BOB_FRAME.wheeliePeakAlt], 12, 0);
    create("bobWheelieHold", [BOB_FRAME.wheeliePeakAlt, BOB_FRAME.wheeliePeakAlt, BOB_FRAME.wheelieHold, BOB_FRAME.wheeliePeakAlt], 6, -1);
    create("bobWheelieRecover", [BOB_FRAME.wheelieLand, BOB_FRAME.wheelieRecover, BOB_FRAME.rideStraight], 9, 0);
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
    create("introBobSpotFinale", INTRO_BOB_SPOT_FINALE_FRAMES, 4, 0);
    create("introOipBobRide", INTRO_OIP_BOB_RIDE_FRAMES, 7, -1);
    create("introOipSpotPaperSide", INTRO_OIP_SPOT_PAPER_SIDE_FRAMES, 8, -1);
    create("introOipBobSpotFinale", INTRO_OIP_BOB_SPOT_FINALE_FRAMES, 4, 0);
    create("introSketchBobRide", INTRO_SKETCH_BOB_RIDE_FRAMES, 7, -1);
    create("introSketchSpotPaperSide", INTRO_SKETCH_SPOT_PAPER_SIDE_FRAMES, 8, -1);
    create("introSketchBobSpotFinale", INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES, 4, 0);
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

  PaperRouteGame.prototype.hasIntroFrame = function (frameName) {
    return !!(this.hasIntroAtlas() && this.scene.textures.getFrame("paperBobIntro", frameName));
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

  PaperRouteGame.prototype.createIntroSketchObjects = function (scene) {
    this.introSketchLayer = scene.add.container(0, 0);
    this.introSketchLayer.setDepth(39);
    this.introSketchObjects = {
      paperWash: scene.add.rectangle(this.width * .5, this.height * .5, this.width, this.height, 0xf5ecd7, .82),
      decor: scene.add.graphics(),
      setting: scene.add.image(this.width * .5, this.height * .5, "paperBobIntro", INTRO_OIP_SETTING_FRAME),
      oipBob: scene.add.sprite(this.width * .5, this.height * .56, "paperBobIntro", INTRO_OIP_BOB_RIDE_FRAMES[0]),
      oipSpot: scene.add.sprite(this.width * .74, this.height * .66, "paperBobIntro", INTRO_OIP_SPOT_PAPER_SIDE_FRAMES[0]),
      oipFinale: scene.add.sprite(this.width * .46, this.height * .63, "paperBobIntro", INTRO_OIP_BOB_SPOT_FINALE_FRAMES[0]),
      bob: scene.add.sprite(this.width * .5, this.height * .56, "paperBobIntro", INTRO_SKETCH_BOB_RIDE_FRAMES[0]),
      spot: scene.add.sprite(this.width * .74, this.height * .66, "paperBobIntro", INTRO_SKETCH_SPOT_PAPER_SIDE_FRAMES[0]),
      finale: scene.add.sprite(this.width * .46, this.height * .63, "paperBobIntro", INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES[0]),
      logo: scene.add.image(this.width * .5, this.height * .17, "paperBobIntro", "intro_sketch_logo_bw")
    };
    this.introSketchObjects.paperWash.setVisible(true);
    this.introSketchObjects.setting.setDisplaySize(this.width, this.height);
    this.introSketchObjects.setting.setAlpha(0);
    this.introSketchObjects.setting.setVisible(false);
    this.introSketchObjects.oipBob.setVisible(false);
    this.introSketchObjects.oipSpot.setVisible(false);
    this.introSketchObjects.oipSpot.setScale(.52);
    this.introSketchObjects.oipFinale.setVisible(false);
    this.introSketchObjects.oipFinale.setScale(.82);
    this.introSketchObjects.bob.setVisible(false);
    this.introSketchObjects.spot.setVisible(false);
    this.introSketchObjects.spot.setScale(.52);
    this.introSketchObjects.finale.setVisible(false);
    this.introSketchObjects.finale.setScale(.82);
    this.introSketchObjects.logo.setDisplaySize(Math.min(220, this.width * .48), Math.min(56, this.width * .12));
    this.introSketchLayer.add([
      this.introSketchObjects.paperWash,
      this.introSketchObjects.decor,
      this.introSketchObjects.setting,
      this.introSketchObjects.oipBob,
      this.introSketchObjects.oipSpot,
      this.introSketchObjects.oipFinale,
      this.introSketchObjects.bob,
      this.introSketchObjects.spot,
      this.introSketchObjects.finale,
      this.introSketchObjects.logo
    ]);
    this.drawIntroSketchDecor(0, 0, "sketch-draw", 0, 0);
  };

  PaperRouteGame.prototype.drawIntroSketchDecor = function (reveal, colorBlend, beatKey, beatProgress, oipBlend) {
    var objects = this.introSketchObjects || {};
    var g = objects.decor;
    var wash = objects.paperWash;
    var setting = objects.setting;
    var width = this.width;
    var height = this.height;
    var roadLeft = this.roadLeft;
    var roadRight = this.roadRight;
    var routeOffset = this.routeOffset || 0;
    var ink = 0x251f1a;
    var softInk = 0x6b5a45;
    var lineAlpha;
    var panelOffset;
    var i;

    reveal = clamp(reveal, 0, 1);
    colorBlend = clamp(colorBlend, 0, 1);
    oipBlend = clamp(oipBlend === undefined ? colorBlend : oipBlend, 0, 1);
    this.introSketchReveal = Math.round(reveal * 1000) / 1000;
    this.introColorBlend = Math.round(colorBlend * 1000) / 1000;
    this.introOipBlend = Math.round(oipBlend * 1000) / 1000;

    if (!g) {
      return;
    }

    if (this.introSketchLayer) {
      this.introSketchLayer.setVisible(!this.reducedMotion);
    }
    if (wash) {
      wash.setPosition(width * .5, height * .5);
      wash.setSize(width, height);
      wash.setAlpha(this.reducedMotion ? 0 : .82 * (1 - oipBlend));
      wash.setVisible(!this.reducedMotion);
    }
    if (setting) {
      setting.setPosition(width * .5, height * .5);
      setting.setDisplaySize(width, height);
      setting.setAlpha(this.reducedMotion ? 1 : oipBlend);
      setting.setVisible(oipBlend > .01 || this.reducedMotion);
      this.introSettingFrame = setting.visible ? INTRO_OIP_SETTING_FRAME : "";
    } else {
      this.introSettingFrame = "";
    }

    g.clear();
    if (this.reducedMotion || oipBlend >= .995) {
      return;
    }

    lineAlpha = .88 - oipBlend * .56;

    function line(x1, y1, x2, y2, start, end, alpha, widthOverride, color) {
      var amount;

      start = start === undefined ? 0 : start;
      end = end === undefined ? 1 : end;
      if (reveal <= start) {
        return;
      }
      amount = clamp((reveal - start) / Math.max(.01, end - start), 0, 1);
      g.lineStyle(widthOverride || 2, color || ink, alpha === undefined ? lineAlpha : alpha);
      g.strokeLineShape(new window.Phaser.Geom.Line(
        x1,
        y1,
        x1 + (x2 - x1) * amount,
        y1 + (y2 - y1) * amount
      ));
    }

    function rect(x, y, w, h, start, end, alpha) {
      line(x, y, x + w, y, start, end, alpha);
      line(x + w, y, x + w, y + h, start + .03, end + .03, alpha);
      line(x + w, y + h, x, y + h, start + .06, end + .06, alpha);
      line(x, y + h, x, y, start + .09, end + .09, alpha);
    }

    line(roadLeft, -8, roadLeft, height + 12, .02, .34, lineAlpha, 3);
    line(roadRight, -8, roadRight, height + 12, .08, .42, lineAlpha, 3);
    line(roadLeft + 10, -8, roadLeft + 10, height + 12, .18, .56, lineAlpha * .72, 1, softInk);
    line(roadRight - 10, -8, roadRight - 10, height + 12, .2, .58, lineAlpha * .72, 1, softInk);

    for (i = -1; i < 10; i += 1) {
      line(width * .5, i * 104 + (routeOffset * .32) % 104, width * .5, i * 104 + 44 + (routeOffset * .32) % 104, .28 + i * .018, .68 + i * .018, lineAlpha * .72, 2, softInk);
    }

    panelOffset = (routeOffset * .12) % 188;
    for (i = -1; i < 7; i += 1) {
      var y = i * 188 + panelOffset - 80;
      var leftX = 28 + (i % 2) * 10;
      var rightX = roadRight + 42 + (i % 2) * 8;
      rect(leftX, y, Math.max(54, roadLeft - leftX - 32), 74, .22 + i * .025, .68 + i * .025, lineAlpha * .68);
      rect(leftX + 12, y + 14, 26, 22, .34 + i * .025, .74 + i * .025, lineAlpha * .58);
      line(leftX + 4, y + 72, roadLeft - 18, y + 104, .42 + i * .02, .76 + i * .02, lineAlpha * .5, 1, softInk);
      rect(rightX, y + 62, Math.max(52, width - rightX - 30), 74, .24 + i * .025, .7 + i * .025, lineAlpha * .68);
      rect(rightX + 18, y + 78, 26, 22, .36 + i * .025, .76 + i * .025, lineAlpha * .58);
      line(roadRight + 18, y + 144, rightX + 16, y + 118, .42 + i * .02, .76 + i * .02, lineAlpha * .5, 1, softInk);
    }

    if (beatKey === "bob-ride" || beatKey === "spot-cross") {
      for (i = 0; i < 6; i += 1) {
        line(roadLeft + 20 + i * 8, height * (.38 + i * .055), roadLeft + 62 + i * 7, height * (.36 + i * .055), .55, 1, lineAlpha * .45, 1, softInk);
        line(roadRight - 60 - i * 7, height * (.43 + i * .052), roadRight - 18 - i * 8, height * (.41 + i * .052), .55, 1, lineAlpha * .45, 1, softInk);
      }
    }

    if (beatKey === "spot-cross") {
      g.lineStyle(2, softInk, lineAlpha * .55);
      for (i = 0; i < 3; i += 1) {
        g.strokeCircle(width * (.66 + i * .035), height * .64 + i * 3, 6 + i * 3 + (beatProgress || 0) * 5);
      }
    }
  };

  PaperRouteGame.prototype.holdIntroSketchFinale = function () {
    var sketch = this.introSketchObjects || {};
    var finale = sketch.finale;
    var oipFinale = sketch.oipFinale;
    var logo = sketch.logo;

    if (this.reducedMotion) {
      this.drawIntroSketchDecor(1, 1, "hold", 1, 1);
      if (this.introSketchLayer) {
        this.introSketchLayer.setVisible(true);
      }
      if (sketch.bob) {
        sketch.bob.setVisible(false);
      }
      if (sketch.spot) {
        sketch.spot.setVisible(false);
      }
      if (sketch.finale) {
        sketch.finale.setVisible(false);
      }
      if (sketch.oipBob) {
        sketch.oipBob.setVisible(false);
      }
      if (sketch.oipSpot) {
        sketch.oipSpot.setVisible(false);
      }
      if (sketch.oipFinale) {
        sketch.oipFinale.setVisible(false);
      }
      this.introSketchFrame = "";
      this.introSketchReveal = 1;
      this.introColorBlend = 1;
      this.introOipBlend = 1;
      return;
    }

    this.drawIntroSketchDecor(1, 1, "hold", 1, 1);
    if (this.introSketchLayer) {
      this.introSketchLayer.setVisible(true);
    }
    if (finale) {
      finale.setTexture("paperBobIntro", INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES[INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES.length - 1]);
      finale.setPosition(this.width * .46, this.height * .63);
      finale.setScale(.82);
      finale.setAngle(0);
      finale.setAlpha(.16);
      finale.setVisible(true);
      this.introSketchFrame = INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES[INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES.length - 1];
    }
    if (oipFinale) {
      oipFinale.setTexture("paperBobIntro", INTRO_OIP_BOB_SPOT_FINALE_FRAMES[INTRO_OIP_BOB_SPOT_FINALE_FRAMES.length - 1]);
      oipFinale.setPosition(this.width * .46, this.height * .63);
      oipFinale.setScale(.82);
      oipFinale.setAngle(0);
      oipFinale.setAlpha(.12);
      oipFinale.setVisible(true);
    }
    if (sketch.bob) {
      sketch.bob.setVisible(false);
    }
    if (sketch.spot) {
      sketch.spot.setVisible(false);
    }
    if (sketch.oipBob) {
      sketch.oipBob.setVisible(false);
    }
    if (sketch.oipSpot) {
      sketch.oipSpot.setVisible(false);
    }
    if (logo) {
      logo.setPosition(this.width * .5, this.height * .17);
      logo.setDisplaySize(Math.min(220, this.width * .48), Math.min(56, this.width * .12));
      logo.setAlpha(.14);
      logo.setVisible(true);
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
    if (this.introSketchLayer) {
      this.introSketchLayer.destroy(true);
    }

    this.createIntroSketchObjects(scene);
    this.introLayer = scene.add.container(0, 0);
    this.introLayer.setDepth(40);
    this.introObjects = {
      bob: scene.add.sprite(this.width * .5, this.height * .56, "paperBobIntro", "intro_bob_ride_front_01"),
      spot: scene.add.sprite(this.width * .74, this.height * .66, "paperBobIntro", "spot_sit_paper_front"),
      finale: scene.add.sprite(this.width * .46, this.height * .62, "paperBobIntro", INTRO_BOB_SPOT_FINALE_FRAMES[0]),
      logo: scene.add.image(this.width * .5, this.height * .18, "paperBobIntro", "intro_logo_paper_bob"),
      shade: scene.add.rectangle(this.width * .5, this.height * .5, this.width, this.height, 0x000000, 0)
    };
    this.introObjects.bob.setDepth(43);
    this.introObjects.spot.setDepth(44);
    this.introObjects.finale.setDepth(44);
    this.introObjects.logo.setDepth(45);
    this.introObjects.logo.setVisible(true);
    this.introObjects.logo.setAlpha(0);
    this.introObjects.logo.setDisplaySize(Math.min(220, this.width * .48), Math.min(56, this.width * .12));
    this.introObjects.bob.setAlpha(0);
    this.introObjects.spot.setVisible(false);
    this.introObjects.spot.setScale(.52);
    this.introObjects.spot.setAlpha(0);
    this.introObjects.finale.setVisible(false);
    this.introObjects.finale.setScale(.82);
    this.introObjects.finale.setAlpha(0);
    this.introObjects.shade.setDepth(50);
    this.introObjects.shade.setVisible(false);
    this.introLayer.add([this.introObjects.bob, this.introObjects.spot, this.introObjects.finale, this.introObjects.logo, this.introObjects.shade]);
    this.introObjects.bob.anims.play("introBobRideFront", true);
    this.introBeat = "logo";
    this.introBobFrame = "intro_bob_ride_front_01";
    this.introSpotFrame = "";
    this.introFinaleFrame = "";
    this.introSketchReveal = 0;
    this.introColorBlend = 0;
    this.introOipBlend = 0;
    this.introSketchFrame = "intro_sketch_logo_bw";
    this.introSettingFrame = "";
  };

  PaperRouteGame.prototype.positionIntroFinale = function (frameName) {
    var finale = this.introObjects.finale;
    var frame = frameName || INTRO_BOB_SPOT_FINALE_FRAMES[INTRO_BOB_SPOT_FINALE_FRAMES.length - 1];

    if (!finale) {
      return;
    }

    finale.setTexture("paperBobIntro", frame);
    finale.setPosition(this.width * .46, this.height * .63);
    finale.setScale(.82);
    finale.setAngle(0);
    finale.setAlpha(1);
    finale.setVisible(true);
    this.introFinaleFrame = frame;
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
    this.introBeat = "prep";
    this.introBobFrame = "";
    this.introSpotFrame = "";
    this.introFinaleFrame = "";
    this.introSketchReveal = 0;
    this.introColorBlend = 0;
    this.introOipBlend = 0;
    this.introSketchFrame = "";
    this.introSettingFrame = "";
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
    var finale = this.introObjects.finale;
    var logo = this.introObjects.logo;
    var shade = this.introObjects.shade;

    this.introMode = "ready";
    this.introComplete = true;
    this.introBeat = "hold";
    this.setIntroPanel(false);
    this.setIntroProgress(1);
    if (shade) {
      shade.setAlpha(0);
    }
    if (bob) {
      bob.anims.stop();
      bob.setVisible(false);
      this.introBobFrame = "";
    }
    if (spot) {
      spot.anims.stop();
      spot.setVisible(false);
      this.introSpotFrame = "";
    }
    if (finale) {
      finale.anims.stop();
      this.positionIntroFinale(INTRO_BOB_SPOT_FINALE_FRAMES[INTRO_BOB_SPOT_FINALE_FRAMES.length - 1]);
      finale.setAlpha(1);
    }
    if (logo) {
      logo.setVisible(true);
      logo.setPosition(this.width * .5, this.height * .17);
      logo.setAngle(0);
      logo.setAlpha(1);
    }
    this.holdIntroSketchFinale();
    if (this.stage) {
      this.stage.classList.add("paper-route-stage--intro-ready");
    }
    this.showStartCard();
    this.syncHud("Paper-Bob is loaded. Hit the street.");
  };

  PaperRouteGame.prototype.updateIntro = function (deltaSeconds) {
    var t;
    var progress;
    var beat;
    var beatProgress;
    var frame;
    var sketchFrame;
    var sketchReveal;
    var colorBlend;
    var oipBlend;
    var colorAlpha;
    var sketchAlpha;
    var oipAlpha;
    var bob = this.introObjects.bob;
    var spot = this.introObjects.spot;
    var finale = this.introObjects.finale;
    var logo = this.introObjects.logo;
    var shade = this.introObjects.shade;
    var sketch = this.introSketchObjects || {};
    var sketchBob = sketch.bob;
    var sketchSpot = sketch.spot;
    var sketchFinale = sketch.finale;
    var sketchLogo = sketch.logo;
    var oipBob = sketch.oipBob;
    var oipSpot = sketch.oipSpot;
    var oipFinale = sketch.oipFinale;
    var centerX = this.width * .5;
    var logoWidth = Math.min(220, this.width * .48);
    var logoHeight = Math.min(56, this.width * .12);

    if (this.introComplete || this.introMode !== "intro-cinematic") {
      return;
    }

    this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + deltaSeconds);
    t = this.introElapsed;
    beat = introBeatAt(t);
    beatProgress = clamp((t - beat.start) / Math.max(.01, beat.end - beat.start), 0, 1);
    progress = t / INTRO_DURATION;
    colorBlend = introColorBlendAt(t);
    oipBlend = introOipBlendAt(t);
    colorAlpha = colorBlend;
    oipAlpha = oipBlend * (1 - colorBlend * .88);
    sketchAlpha = Math.max(0, (1 - oipBlend) * (1 - colorBlend * .5));
    sketchReveal = beat.key === "sketch-draw" ? easeOutCubic(beatProgress) : 1;
    this.introBeat = beat.key;
    if (this.introPrepComplete) {
      this.setIntroProgress(1);
    } else {
      this.updateIntroLoadProgress();
    }
    this.routeOffset += (120 + progress * 42) * deltaSeconds;
    this.redrawBackground();
    this.drawIntroSketchDecor(sketchReveal, colorBlend, beat.key, beatProgress, oipBlend);

    if (shade) {
      shade.setSize(this.width, this.height);
      shade.setPosition(this.width * .5, this.height * .5);
      shade.setAlpha(0);
      shade.setVisible(false);
    }

    if (bob) {
      if (beat.key === "sketch-draw") {
        bob.setVisible(false);
        this.introBobFrame = "";
        if (sketchBob) {
          sketchBob.setVisible(false);
        }
        if (oipBob) {
          oipBob.setVisible(false);
        }
      } else if (beat.key === "bob-ride") {
        frame = introRideFrameAt(INTRO_RIDE_FRAMES, INTRO_RIDE_PERSONALITY_FRAMES, beat, t, 8);
        sketchFrame = frameFromTime(INTRO_SKETCH_BOB_RIDE_FRAMES, t - beat.start, 8, false);
        bob.setTexture("paperBobIntro", frame);
        bob.setPosition(centerX + Math.sin(t * 2.4) * 18, this.height * (.38 + easeOutCubic(beatProgress) * .18));
        bob.setScale(.52 + easeOutCubic(beatProgress) * .24 + Math.sin(t * 3.2) * .012);
        bob.setAngle(Math.sin(t * 2.6) * 3.2);
        bob.setAlpha(colorAlpha);
        bob.setVisible(true);
        this.introBobFrame = frame;
        if (oipBob) {
          oipBob.setTexture("paperBobIntro", introRideFrameAt(INTRO_OIP_BOB_RIDE_FRAMES, INTRO_OIP_BOB_PERSONALITY_FRAMES, beat, t, 8));
          oipBob.setPosition(bob.x, bob.y);
          oipBob.setScale(bob.scaleX, bob.scaleY);
          oipBob.setAngle(bob.angle);
          oipBob.setAlpha(oipAlpha);
          oipBob.setVisible(oipAlpha > .01);
        }
        if (sketchBob) {
          sketchBob.setTexture("paperBobIntro", sketchFrame);
          sketchBob.setPosition(bob.x, bob.y);
          sketchBob.setScale(bob.scaleX, bob.scaleY);
          sketchBob.setAngle(bob.angle);
          sketchBob.setAlpha(sketchAlpha);
          sketchBob.setVisible(sketchAlpha > .01);
          this.introSketchFrame = sketchFrame;
        }
      } else if (beat.key === "spot-cross") {
        frame = INTRO_RIDE_FRAMES[Math.min(INTRO_RIDE_FRAMES.length - 1, 3)];
        sketchFrame = INTRO_SKETCH_BOB_RIDE_FRAMES[Math.min(INTRO_SKETCH_BOB_RIDE_FRAMES.length - 1, 3)];
        bob.setTexture("paperBobIntro", frame);
        bob.setPosition(this.width * .42, this.height * .56);
        bob.setScale(.76);
        bob.setAngle(Math.sin(t * 5) * 1.1);
        bob.setAlpha(colorAlpha);
        bob.setVisible(true);
        this.introBobFrame = frame;
        if (oipBob) {
          oipBob.setTexture("paperBobIntro", INTRO_OIP_BOB_RIDE_FRAMES[Math.min(INTRO_OIP_BOB_RIDE_FRAMES.length - 1, 3)]);
          oipBob.setPosition(bob.x, bob.y);
          oipBob.setScale(bob.scaleX, bob.scaleY);
          oipBob.setAngle(bob.angle);
          oipBob.setAlpha(oipAlpha);
          oipBob.setVisible(oipAlpha > .01);
        }
        if (sketchBob) {
          sketchBob.setTexture("paperBobIntro", sketchFrame);
          sketchBob.setPosition(bob.x, bob.y);
          sketchBob.setScale(bob.scaleX, bob.scaleY);
          sketchBob.setAngle(bob.angle);
          sketchBob.setAlpha(sketchAlpha);
          sketchBob.setVisible(sketchAlpha > .01);
          this.introSketchFrame = sketchFrame;
        }
      } else {
        bob.setVisible(false);
        this.introBobFrame = "";
        if (sketchBob) {
          sketchBob.setVisible(false);
        }
        if (oipBob) {
          oipBob.setVisible(false);
        }
      }
    }

    if (spot) {
      if (beat.key === "spot-cross") {
        frame = frameFromTime(SPOT_RUN_PAPER_SIDE_FRAMES, t - beat.start, 8, false);
        sketchFrame = frameFromTime(INTRO_SKETCH_SPOT_PAPER_SIDE_FRAMES, t - beat.start, 8, false);
        spot.setTexture("paperBobIntro", frame);
        spot.setPosition(
          this.width + 80 - easeOutCubic(beatProgress) * (this.width * .36 + 80),
          this.height * .63 - Math.sin(beatProgress * Math.PI) * 8
        );
        spot.setScale(.5 + beatProgress * .04);
        spot.setFlipX(true);
        spot.setAngle(Math.sin(t * 10) * 1.8);
        spot.setAlpha(colorAlpha);
        spot.setVisible(true);
        this.introSpotFrame = frame;
        if (oipSpot) {
          oipSpot.setTexture("paperBobIntro", frameFromTime(INTRO_OIP_SPOT_PAPER_SIDE_FRAMES, t - beat.start, 8, false));
          oipSpot.setPosition(spot.x, spot.y);
          oipSpot.setScale(spot.scaleX, spot.scaleY);
          oipSpot.setFlipX(true);
          oipSpot.setAngle(spot.angle);
          oipSpot.setAlpha(oipAlpha);
          oipSpot.setVisible(oipAlpha > .01);
        }
        if (sketchSpot) {
          sketchSpot.setTexture("paperBobIntro", sketchFrame);
          sketchSpot.setPosition(spot.x, spot.y);
          sketchSpot.setScale(spot.scaleX, spot.scaleY);
          sketchSpot.setFlipX(true);
          sketchSpot.setAngle(spot.angle);
          sketchSpot.setAlpha(sketchAlpha);
          sketchSpot.setVisible(sketchAlpha > .01);
          this.introSketchFrame = sketchFrame;
        }
      } else {
        spot.setVisible(false);
        this.introSpotFrame = "";
        if (sketchSpot) {
          sketchSpot.setVisible(false);
        }
        if (oipSpot) {
          oipSpot.setVisible(false);
        }
      }
    }

    if (finale) {
      if (beat.key === "finale" || beat.key === "hold") {
        frame = beat.key === "finale"
          ? frameFromTime(INTRO_BOB_SPOT_FINALE_FRAMES, t - beat.start, 3.4, true)
          : INTRO_BOB_SPOT_FINALE_FRAMES[INTRO_BOB_SPOT_FINALE_FRAMES.length - 1];
        sketchFrame = beat.key === "finale"
          ? frameFromTime(INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES, t - beat.start, 3.4, true)
          : INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES[INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES.length - 1];
        this.positionIntroFinale(frame);
        finale.setAlpha(colorAlpha);
        if (oipFinale) {
          oipFinale.setTexture(
            "paperBobIntro",
            beat.key === "finale"
              ? frameFromTime(INTRO_OIP_BOB_SPOT_FINALE_FRAMES, t - beat.start, 3.4, true)
              : INTRO_OIP_BOB_SPOT_FINALE_FRAMES[INTRO_OIP_BOB_SPOT_FINALE_FRAMES.length - 1]
          );
          oipFinale.setPosition(finale.x, finale.y);
          oipFinale.setScale(finale.scaleX, finale.scaleY);
          oipFinale.setAngle(finale.angle);
          oipFinale.setAlpha(beat.key === "hold" ? Math.max(.12, oipAlpha) : oipAlpha);
          oipFinale.setVisible(oipBlend > .01);
        }
        if (sketchFinale) {
          sketchFinale.setTexture("paperBobIntro", sketchFrame);
          sketchFinale.setPosition(finale.x, finale.y);
          sketchFinale.setScale(finale.scaleX, finale.scaleY);
          sketchFinale.setAngle(finale.angle);
          sketchFinale.setAlpha(beat.key === "hold" ? .16 : sketchAlpha);
          sketchFinale.setVisible(beat.key === "hold" || sketchAlpha > .01);
          this.introSketchFrame = sketchFrame;
        }
      } else {
        finale.setVisible(false);
        this.introFinaleFrame = "";
        if (sketchFinale) {
          sketchFinale.setVisible(false);
        }
        if (oipFinale) {
          oipFinale.setVisible(false);
        }
      }
    }

    if (logo) {
      logo.setVisible(true);
      logo.setAlpha(colorAlpha);
      logo.setDisplaySize(
        logoWidth * (.78 + easeOutCubic(Math.min(t / .8, 1)) * .22),
        logoHeight * (.78 + easeOutCubic(Math.min(t / .8, 1)) * .22)
      );
      logo.setPosition(this.width * .5 + Math.sin(t * 1.8) * 2, this.height * .17);
      logo.setAngle((1 - easeOutCubic(Math.min(t / .8, 1))) * -3 + Math.sin(t * 1.4) * .45);
    }
    if (sketchLogo) {
      sketchLogo.setVisible(true);
      sketchLogo.setAlpha(Math.max(.14, 1 - Math.max(oipBlend, colorBlend) * .86));
      sketchLogo.setDisplaySize(
        logoWidth * (.78 + easeOutCubic(Math.min(t / .8, 1)) * .22),
        logoHeight * (.78 + easeOutCubic(Math.min(t / .8, 1)) * .22)
      );
      sketchLogo.setPosition(this.width * .5 + Math.sin(t * 1.8) * 2, this.height * .17);
      sketchLogo.setAngle((1 - easeOutCubic(Math.min(t / .8, 1))) * -3 + Math.sin(t * 1.4) * .45);
      if (beat.key === "sketch-draw") {
        this.introSketchFrame = "intro_sketch_logo_bw";
      }
    }

    if (t >= INTRO_DURATION && this.introPrepComplete) {
      this.completeIntro();
    }
  };

  PaperRouteGame.prototype.clearEndRunCinematic = function () {
    var objects = this.endRunObjects || {};

    if (objects.sidePanelLeftMask) {
      objects.sidePanelLeftMask.destroy();
    }
    if (objects.sidePanelRightMask) {
      objects.sidePanelRightMask.destroy();
    }
    if (objects.sidePanelLeftMaskGraphic) {
      objects.sidePanelLeftMaskGraphic.destroy();
    }
    if (objects.sidePanelRightMaskGraphic) {
      objects.sidePanelRightMaskGraphic.destroy();
    }
    if (this.endRunLayer) {
      this.endRunLayer.destroy(true);
      this.endRunLayer = null;
    }
    this.endRunObjects = {};
    this.endRunActive = false;
    this.endRunElapsed = 0;
    this.endRunBeat = "idle";
    this.endRunOipBlend = 0;
    this.endRunColorBlend = 1;
    this.endRunSpotVisible = false;
    this.endRunFinaleVisible = false;
    this.endRunFinaleFrame = "";
    this.endRunBobVisible = false;
    this.endRunBobFrame = "";
    this.endRunEditionVisible = false;
    this.endRunEditionFrame = "";
    this.endRunFrontPageVisible = false;
    this.endRunPaperVisible = false;
    this.endRunPaperFrame = "";
    this.endRunPorchVisible = false;
    this.endRunExtraStampVisible = false;
    this.endRunSummaryRowsVisible = false;
    this.endRunSidePanelsVisible = false;
    this.endRunOipTreatmentActive = false;
    this.endRunSkipped = false;
    this.endRunFrame = 0;
    this.endRunScoreStamped = false;
    this.endRunCameraZoom = 1;
    this.endRunScoreShown = false;
    this.endRunSummaryShown = false;
    this.endRunSummaryState = null;
    this.endRunTitle = "";
    this.endRunCopy = "";
    this.endRunNewBest = false;
    this.endRunSequenceId = 0;
  };

  PaperRouteGame.prototype.hideIntroCinematicLayers = function () {
    var key;
    var object;

    if (this.introLayer) {
      this.introLayer.setVisible(false);
    }
    if (this.introSketchLayer) {
      this.introSketchLayer.setVisible(false);
    }
    for (key in this.introObjects) {
      if (Object.prototype.hasOwnProperty.call(this.introObjects, key)) {
        object = this.introObjects[key];
        if (object && object.setVisible) {
          object.setVisible(false);
        }
      }
    }
    for (key in this.introSketchObjects) {
      if (Object.prototype.hasOwnProperty.call(this.introSketchObjects, key)) {
        object = this.introSketchObjects[key];
        if (object && object.setVisible) {
          object.setVisible(false);
        }
      }
    }
    this.introBeat = "idle";
    this.introBobFrame = "";
    this.introSpotFrame = "";
    this.introFinaleFrame = "";
    this.introSketchReveal = 0;
    this.introColorBlend = 0;
    this.introOipBlend = 0;
    this.introSketchFrame = "";
    this.introSettingFrame = "";
  };

  PaperRouteGame.prototype.createEndRunObjects = function () {
    var scene = this.scene;
    var objects;
    var paperTexture;
    var puddleTexture;
    var rowTexts = [];
    var rowParts;
    var rowIndex;

    this.clearEndRunCinematic();
    if (!scene || !this.hasIntroAtlas() || !this.hasBobSheet() || !this.hasIntroFrame(INTRO_OIP_SETTING_FRAME) || !this.hasIntroFrame(END_RUN_DOORSTEP_PLATE_FRAME) || !this.hasIntroFrame(END_RUN_PAPER_DOORSTEP_FRAMES[0]) || !this.hasIntroFrame(END_RUN_PAPER_DOORSTEP_FRAMES[END_RUN_PAPER_DOORSTEP_FRAMES.length - 1]) || !this.hasIntroFrame(SPOT_SIDE_FRAMES[0])) {
      return false;
    }

    paperTexture = scene.textures.exists("paperRoutePaperAsset") ? "paperRoutePaperAsset" : "paperRoutePaper";
    puddleTexture = scene.textures.exists("paperRoutePuddleAsset") ? "paperRoutePuddleAsset" : "paperRoutePuddle";
    this.endRunLayer = scene.add.container(0, 0);
    this.endRunLayer.setDepth(47);
    for (rowIndex = 0; rowIndex < 6; rowIndex += 1) {
      rowParts = {
        icon: scene.add.text(0, 0, "", {
          color: "#2f2419",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "9px",
          fontStyle: "bold",
          stroke: "#f4e7cc",
          strokeThickness: 2
        }),
        label: scene.add.text(0, 0, "", {
          color: "#2f2419",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "10px",
          fontStyle: "bold"
        }),
        value: scene.add.text(0, 0, "", {
        color: "#2f2419",
        fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "11px",
        fontStyle: "bold"
        })
      };
      rowParts.icon.setOrigin(.5);
      rowParts.label.setOrigin(0, .5);
      rowParts.value.setOrigin(1, .5);
      rowParts.icon.setAlpha(0);
      rowParts.label.setAlpha(0);
      rowParts.value.setAlpha(0);
      rowParts.icon.setVisible(false);
      rowParts.label.setVisible(false);
      rowParts.value.setVisible(false);
      rowTexts.push(rowParts);
    }
    objects = {
      oipWash: scene.add.rectangle(this.width * .5, this.height * .5, this.width, this.height, 0xf3e6d3, 0),
      oipInk: scene.add.graphics(),
      doorstep: scene.add.image(this.width * .5, this.height * .5, "paperBobIntro", END_RUN_DOORSTEP_PLATE_FRAME),
      sidePanels: scene.add.container(0, 0),
      sidePanelLeft: scene.add.image(this.width * .5, this.height * .5, "paperBobIntro", INTRO_OIP_SETTING_FRAME),
      sidePanelRight: scene.add.image(this.width * .5, this.height * .5, "paperBobIntro", INTRO_OIP_SETTING_FRAME),
      sidePanelLeftMaskGraphic: scene.make.graphics({ x: 0, y: 0, add: false }),
      sidePanelRightMaskGraphic: scene.make.graphics({ x: 0, y: 0, add: false }),
      fxBack: scene.add.graphics(),
      puddle: scene.add.image(this.width * .55, this.height * .76, puddleTexture),
      spot: scene.add.sprite(this.width + 80, this.height * .68, "paperBobIntro", SPOT_SIDE_FRAMES[0]),
      bob: scene.add.sprite(this.width * .5, this.height * .76, "paperBobSheet", BOB_FRAME.rideStraight),
      paperThrow: scene.add.image(this.width * .55, this.height * .5, paperTexture),
      paperClose: scene.add.sprite(this.width * .5, this.height * .5, "paperBobIntro", END_RUN_PAPER_DOORSTEP_FRAMES[0]),
      fxFront: scene.add.graphics(),
      resultRules: scene.add.graphics(),
      extraStamp: scene.add.text(0, 0, "EXTRA EXTRA!", {
        color: "#9d3328",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "24px",
        fontStyle: "bold",
        stroke: "#f4e7cc",
        strokeThickness: 3
      }),
      resultRows: rowTexts,
      recordStamp: scene.add.text(0, 0, "NEW RECORD", {
        color: "#8f3b21",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "20px",
        fontStyle: "bold",
        stroke: "#f2e6cf",
        strokeThickness: 3
      })
    };

    objects.oipWash.setVisible(false);
    objects.oipInk.setVisible(false);
    objects.doorstep.setDisplaySize(this.width, this.height);
    objects.doorstep.setAlpha(0);
    objects.doorstep.setVisible(false);
    objects.sidePanelLeftMask = objects.sidePanelLeftMaskGraphic.createGeometryMask();
    objects.sidePanelRightMask = objects.sidePanelRightMaskGraphic.createGeometryMask();
    objects.sidePanelLeft.setDisplaySize(this.width, this.height);
    objects.sidePanelRight.setDisplaySize(this.width, this.height);
    objects.sidePanelLeft.setMask(objects.sidePanelLeftMask);
    objects.sidePanelRight.setMask(objects.sidePanelRightMask);
    objects.sidePanelLeft.setAlpha(0);
    objects.sidePanelRight.setAlpha(0);
    objects.sidePanelLeft.setVisible(false);
    objects.sidePanelRight.setVisible(false);
    objects.sidePanels.add([objects.sidePanelLeft, objects.sidePanelRight]);
    objects.sidePanels.setVisible(false);
    objects.fxBack.setVisible(false);
    objects.puddle.setDisplaySize(TUNING.puddleDisplay.width, TUNING.puddleDisplay.height);
    objects.puddle.setAlpha(0);
    objects.puddle.setVisible(false);
    objects.spot.setDisplaySize(TUNING.spotDisplay.width, TUNING.spotDisplay.height);
    objects.spot.setAlpha(0);
    objects.spot.setVisible(false);
    objects.bob.setDisplaySize(TUNING.playerDisplay.width, TUNING.playerDisplay.height);
    objects.bob.setAlpha(0);
    objects.bob.setVisible(false);
    objects.paperThrow.setDisplaySize(32, 20);
    objects.paperThrow.setAlpha(0);
    objects.paperThrow.setVisible(false);
    objects.paperClose.setDisplaySize(150, 188);
    objects.paperClose.setAlpha(0);
    objects.paperClose.setVisible(false);
    objects.fxFront.setVisible(false);
    objects.resultRules.setVisible(false);
    objects.extraStamp.setOrigin(.5);
    objects.extraStamp.setAngle(-7);
    objects.extraStamp.setAlpha(0);
    objects.extraStamp.setVisible(false);
    objects.recordStamp.setOrigin(.5);
    objects.recordStamp.setAngle(-8);
    objects.recordStamp.setAlpha(0);
    objects.recordStamp.setVisible(false);
    objects.frontPage = objects.paperClose;
    objects.bobJump = objects.bob;
    this.endRunLayer.add([
      objects.oipWash,
      objects.doorstep,
      objects.sidePanels,
      objects.oipInk,
      objects.fxBack,
      objects.puddle,
      objects.spot,
      objects.bob,
      objects.paperThrow,
      objects.paperClose,
      objects.fxFront,
      objects.resultRules,
      objects.extraStamp,
      objects.recordStamp
    ]);
    for (rowIndex = 0; rowIndex < rowTexts.length; rowIndex += 1) {
      this.endRunLayer.add([rowTexts[rowIndex].icon, rowTexts[rowIndex].label, rowTexts[rowIndex].value]);
    }
    this.endRunObjects = objects;
    this.updateEndRunVisuals(0);

    return true;
  };

  PaperRouteGame.prototype.applyEndRunOipTreatment = function (active) {
    var objects = this.endRunObjects || {};
    var width = this.width;
    var height = this.height;
    var alpha = active ? .34 : 0;
    var inkAlpha = active ? .1 : 0;
    var treated = [objects.bob, objects.spot, objects.paperThrow, objects.puddle];
    var index;

    this.endRunOipTreatmentActive = !!active;

    if (objects.oipWash) {
      objects.oipWash.setPosition(width * .5, height * .5);
      objects.oipWash.setSize(width, height);
      objects.oipWash.setAlpha(alpha);
      objects.oipWash.setVisible(alpha > .01);
    }
    if (objects.oipInk) {
      objects.oipInk.clear();
      objects.oipInk.setVisible(inkAlpha > .01);
      if (inkAlpha > .01) {
        objects.oipInk.fillStyle(0x2b2117, inkAlpha * .42);
        objects.oipInk.fillRect(0, 0, width, height);
        objects.oipInk.lineStyle(1, 0x6b5a45, inkAlpha * 1.6);
        objects.oipInk.strokeLineShape(new window.Phaser.Geom.Line(this.roadLeft, 0, this.roadLeft, height));
        objects.oipInk.strokeLineShape(new window.Phaser.Geom.Line(this.roadRight, 0, this.roadRight, height));
        objects.oipInk.lineStyle(1, 0x6b5a45, inkAlpha * .7);
        objects.oipInk.strokeLineShape(new window.Phaser.Geom.Line(width * .5, 0, width * .5, height));
      }
    }

    for (index = 0; index < treated.length; index += 1) {
      if (!treated[index]) {
        continue;
      }
      if (active) {
        treated[index].setTint(0xf2dfbd);
      } else if (treated[index].clearTint) {
        treated[index].clearTint();
      }
    }
  };

  PaperRouteGame.prototype.drawEndRunSidePanels = function (progress, alpha) {
    var objects = this.endRunObjects || {};
    var panels = objects.sidePanels;
    var left = objects.sidePanelLeft;
    var right = objects.sidePanelRight;
    var leftMask = objects.sidePanelLeftMaskGraphic;
    var rightMask = objects.sidePanelRightMaskGraphic;
    var width = this.width;
    var height = this.height;
    var leftEdge = Math.max(4, this.roadLeft - 8);
    var rightEdge = Math.min(width - 4, this.roadRight + 8);
    var panelAlpha = clamp(alpha === undefined ? 1 : alpha, 0, 1);
    var reveal = easeOutCubic(clamp(progress, 0, 1));
    var visible = panelAlpha > .01 && reveal > .01;

    if (!panels || !left || !right || !leftMask || !rightMask) {
      return;
    }

    leftMask.clear();
    rightMask.clear();
    panels.setVisible(visible);
    left.setVisible(visible);
    right.setVisible(visible);
    if (!visible) {
      return;
    }

    left.setTexture("paperBobIntro", INTRO_OIP_SETTING_FRAME);
    right.setTexture("paperBobIntro", INTRO_OIP_SETTING_FRAME);
    left.setPosition(width * .5, height * .5);
    right.setPosition(width * .5, height * .5);
    left.setDisplaySize(width, height);
    right.setDisplaySize(width, height);
    left.setAlpha(panelAlpha * reveal);
    right.setAlpha(panelAlpha * reveal);
    leftMask.fillStyle(0xffffff, 1);
    leftMask.fillRect(0, 0, leftEdge, height);
    rightMask.fillStyle(0xffffff, 1);
    rightMask.fillRect(rightEdge, 0, Math.max(0, width - rightEdge), height);
  };

  PaperRouteGame.prototype.updateEndRunResultText = function (pageX, pageY, pageW, pageH, stampProgress, rowsProgress) {
    var objects = this.endRunObjects || {};
    var rows = objects.resultRows || [];
    var state = this.endRunSummaryState || this.rules.state;
    var items = this.summaryMetricItems(state);
    var rowStartY = pageY + pageH * .07;
    var rowGap = Math.max(14, pageH * .052);
    var iconX = pageX - pageW * .32;
    var labelX = pageX - pageW * .25;
    var valueX = pageX + pageW * .32;
    var leaderStartX = pageX - pageW * .03;
    var leaderEndX = pageX + pageW * .22;
    var labelText;
    var rowKey;
    var rowText;
    var rowY;
    var index;

    if (objects.extraStamp) {
      objects.extraStamp.setPosition(pageX - pageW * .06, pageY - pageH * .38);
      objects.extraStamp.setAlpha(stampProgress);
      objects.extraStamp.setScale(.88 + stampProgress * .12);
      objects.extraStamp.setVisible(stampProgress > .01);
    }
    if (objects.resultRules) {
      objects.resultRules.clear();
      objects.resultRules.setVisible(rowsProgress > .01);
    }
    for (index = 0; index < rows.length; index += 1) {
      rowText = rows[index];
      if (!rowText) {
        continue;
      }
      if (items[index]) {
        rowKey = items[index].key;
        if (rowKey === "mailbox") {
          labelText = "MAIL";
        } else if (rowKey === "doorstep") {
          labelText = "DOOR";
        } else if (rowKey === "window") {
          labelText = "WINDOW";
        } else if (rowKey === "ramp") {
          labelText = "RAMPS";
        } else if (rowKey === "puddle") {
          labelText = "PUDDLES";
        } else {
          labelText = "PAPERS";
        }
        rowY = rowStartY + index * rowGap;
        rowText.label.setText(labelText);
        rowText.value.setText(String(items[index].value));
        rowText.label.setPosition(labelX, rowY);
        rowText.value.setPosition(valueX, rowY);
        rowText.label.setAlpha(rowsProgress);
        rowText.value.setAlpha(rowsProgress);
        rowText.icon.setVisible(false);
        rowText.label.setVisible(rowsProgress > .01);
        rowText.value.setVisible(rowsProgress > .01);
        if (objects.resultRules && rowsProgress > .01) {
          objects.resultRules.lineStyle(1, 0x7f6d51, .52 * rowsProgress);
          objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(leaderStartX, rowY, leaderEndX, rowY));
          objects.resultRules.lineStyle(1, 0x2f2419, .72 * rowsProgress);
          objects.resultRules.fillStyle(0x2f2419, .12 * rowsProgress);
          if (rowKey === "mailbox") {
            objects.resultRules.strokeRect(iconX - 5, rowY - 4, 9, 7);
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX + 4, rowY - 4, iconX + 7, rowY - 8));
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX + 7, rowY - 8, iconX + 10, rowY - 6));
          } else if (rowKey === "doorstep") {
            objects.resultRules.strokeRect(iconX - 6, rowY - 3, 12, 6);
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX - 3, rowY - 5, iconX + 3, rowY - 5));
          } else if (rowKey === "window") {
            objects.resultRules.strokeRect(iconX - 5, rowY - 5, 10, 10);
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX, rowY - 5, iconX, rowY + 5));
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX - 5, rowY, iconX + 5, rowY));
          } else if (rowKey === "ramp") {
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX - 6, rowY + 5, iconX + 7, rowY + 5));
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX + 7, rowY + 5, iconX + 7, rowY - 4));
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX + 7, rowY - 4, iconX - 6, rowY + 5));
          } else if (rowKey === "puddle") {
            objects.resultRules.strokeEllipse(iconX, rowY, 15, 6);
          } else {
            objects.resultRules.strokeRect(iconX - 5, rowY - 6, 10, 12);
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX - 2, rowY - 2, iconX + 3, rowY - 2));
            objects.resultRules.strokeLineShape(new window.Phaser.Geom.Line(iconX - 2, rowY + 2, iconX + 3, rowY + 2));
          }
        }
      } else {
        rowText.icon.setVisible(false);
        rowText.label.setVisible(false);
        rowText.value.setVisible(false);
      }
    }
    if (objects.recordStamp) {
      objects.recordStamp.setVisible(!!(this.endRunNewBest && rowsProgress > .01));
      objects.recordStamp.setAlpha(objects.recordStamp.visible ? rowsProgress : 0);
      objects.recordStamp.setPosition(pageX + pageW * .23, pageY - pageH * .02);
      objects.recordStamp.setScale(.76 + rowsProgress * .12);
    }
  };

  PaperRouteGame.prototype.updateEndRunVisuals = function (time) {
    var objects = this.endRunObjects || {};
    var t = clamp(time, 0, END_RUN_SUMMARY_REVEAL_AT);
    var beat = endRunBeatAt(t);
    var frameNumber = endRunFrameAt(t);
    var oipBlend = endRunOipBlendAt(t);
    var colorBlend = endRunColorBlendAt(t);
    var spotProgress = clamp((t - .27) / .45, 0, 1);
    var wheelieProgress = clamp((t - .72) / .63, 0, 1);
    var throwProgress = clamp((t - 1.35) / 1.12, 0, 1);
    var followProgress = clamp((t - 2.47) / .61, 0, 1);
    var porchProgress = clamp((t - 2.47) / 1.37, 0, 1);
    var paperCloseIndex = clamp(frameNumber - 23, 0, END_RUN_PAPER_DOORSTEP_FRAMES.length - 1);
    var paperCloseFrame = END_RUN_PAPER_DOORSTEP_FRAMES[paperCloseIndex];
    var stampProgress = 0;
    var rowsProgress = 0;
    var pageProgress = easeOutCubic(clamp((t - 3.3) / .54, 0, 1));
    var pageW = Math.min(264, this.width * .6);
    var pageH = pageW * 1.25;
    var bobFrame = BOB_FRAME.rideStraight;
    var bobX = this.width * .5;
    var bobY = this.height * .76;
    var bobScale = 1;
    var bobVisible = frameNumber <= 22;
    var paperThrowVisible = frameNumber >= 16 && frameNumber <= 22;
    var paperCloseVisible = frameNumber >= 23;
    var porchVisible = frameNumber >= 23;
    var sidePanelsVisible = frameNumber <= 22;
    var oipTreatmentActive = frameNumber <= 22;
    var line;
    var index;

    if (!this.endRunLayer) {
      this.endRunBeat = "idle";
      this.endRunOipBlend = 0;
      this.endRunColorBlend = 1;
      this.endRunSpotVisible = false;
      this.endRunFinaleVisible = false;
      this.endRunFinaleFrame = "";
      this.endRunBobVisible = false;
      this.endRunBobFrame = "";
      this.endRunEditionVisible = false;
      this.endRunEditionFrame = "";
      this.endRunFrontPageVisible = false;
      this.endRunPaperVisible = false;
      this.endRunPaperFrame = "";
      this.endRunPorchVisible = false;
      this.endRunExtraStampVisible = false;
      this.endRunSummaryRowsVisible = false;
      this.endRunSidePanelsVisible = false;
      this.endRunOipTreatmentActive = false;
      this.endRunScoreStamped = false;
      this.endRunCameraZoom = 1;
      this.endRunFrame = 0;
      return;
    }

    this.endRunBeat = beat.key;
    this.endRunFrame = frameNumber;
    this.endRunOipBlend = Math.round(oipBlend * 1000) / 1000;
    this.endRunColorBlend = Math.round(colorBlend * 1000) / 1000;
    this.endRunCameraZoom = Math.round((1 + porchProgress * .12) * 1000) / 1000;
    this.endRunLayer.setVisible(true);

    if (objects.doorstep) {
      objects.doorstep.setDisplaySize(this.width, this.height);
      objects.doorstep.setPosition(this.width * .5, this.height * .5);
      objects.doorstep.setAlpha(porchVisible ? (frameNumber === 23 ? .72 : 1) : 0);
      objects.doorstep.setVisible(objects.doorstep.alpha > .01);
    }
    this.drawEndRunSidePanels(sidePanelsVisible ? 1 : 0, sidePanelsVisible ? .86 : 0);
    if (frameNumber <= 3) {
      bobFrame = BOB_FRAME.rideStraight;
      bobX = this.width * .5;
      bobY = this.height * (.76 - (frameNumber - 1) * .015);
    } else if (frameNumber <= 8) {
      bobFrame = frameNumber < 6 ? BOB_FRAME.leanLeft : BOB_FRAME.leanRight;
      bobX = this.width * (.5 - Math.sin(spotProgress * Math.PI) * .08);
      bobY = this.height * (.74 - spotProgress * .035);
      bobScale = 1 + Math.sin(spotProgress * Math.PI) * .04;
    } else if (frameNumber <= 12) {
      bobFrame = frameNumber < 11 ? BOB_FRAME.wheeliePeakAlt : BOB_FRAME.wheelieHold;
      bobX = this.width * (.43 + wheelieProgress * .12);
      bobY = this.height * (.73 - wheelieProgress * .11);
      bobScale = 1.08 + Math.sin(wheelieProgress * Math.PI) * .15;
    } else if (frameNumber <= 15) {
      bobFrame = frameNumber === 15 ? BOB_FRAME.wheelieHold : BOB_FRAME.wheeliePeakAlt;
      bobX = this.width * (.5 + Math.sin((frameNumber - 13) / 2 * Math.PI) * .018);
      bobY = this.height * (.62 - (frameNumber - 13) * .035);
      bobScale = 1.18;
    } else if (frameNumber <= 18) {
      bobFrame = frameNumber === 16 ? BOB_FRAME.throwRightLean : BOB_FRAME.throwRight;
      bobX = this.width * (.5 + throwProgress * .045);
      bobY = this.height * (.52 - throwProgress * .12);
      bobScale = .98 - throwProgress * .08;
    } else {
      bobFrame = BOB_FRAME.rideStraight;
      bobX = this.width * (.55 - followProgress * .04);
      bobY = this.height * (.4 - followProgress * .09);
      bobScale = .72 - followProgress * .36;
    }
    if (objects.bob) {
      objects.bob.setTexture("paperBobSheet");
      objects.bob.setFrame(bobFrame);
      objects.bob.setPosition(bobX, bobY);
      objects.bob.setDisplaySize(TUNING.playerDisplay.width * bobScale, TUNING.playerDisplay.height * bobScale);
      objects.bob.setAngle(frameNumber >= 9 && frameNumber <= 12 ? -4 + wheelieProgress * 8 : 0);
      objects.bob.setAlpha(bobVisible ? Math.max(.18, 1 - followProgress * .75) : 0);
      objects.bob.setVisible(objects.bob.alpha > .01);
    }
    if (objects.spot) {
      objects.spot.setTexture("paperBobIntro", frameFromTime(SPOT_SIDE_FRAMES, Math.max(0, t - .27), 12, false));
      objects.spot.setPosition(this.width + 78 - spotProgress * (this.width + 170), this.height * (.67 + Math.sin(spotProgress * Math.PI) * .025));
      objects.spot.setDisplaySize(TUNING.spotDisplay.width, TUNING.spotDisplay.height);
      objects.spot.setAlpha(frameNumber >= 4 && frameNumber <= 8 ? 1 : 0);
      objects.spot.setVisible(objects.spot.alpha > .01);
    }
    if (objects.puddle) {
      objects.puddle.setPosition(this.width * .54, this.height * .76);
      objects.puddle.setAlpha(frameNumber >= 9 && frameNumber <= 12 ? .9 : 0);
      objects.puddle.setVisible(objects.puddle.alpha > .01);
    }
    if (objects.paperThrow) {
      objects.paperThrow.setPosition(
        this.width * (.55 + throwProgress * .24 - followProgress * .06),
        this.height * (.51 - throwProgress * .06 + followProgress * .05)
      );
      objects.paperThrow.setDisplaySize(32 + (throwProgress + followProgress) * 80, 20 + (throwProgress + followProgress) * 52);
      objects.paperThrow.setAngle(throwProgress * 42 + followProgress * 70);
      objects.paperThrow.setAlpha(paperThrowVisible ? 1 : 0);
      objects.paperThrow.setVisible(objects.paperThrow.alpha > .01);
    }
    if (objects.paperClose) {
      objects.paperClose.setTexture("paperBobIntro", paperCloseFrame);
      objects.paperClose.setPosition(this.width * .5, this.height * (.5 + porchProgress * .06));
      objects.paperClose.setDisplaySize(pageW * (.72 + pageProgress * .28), pageH * (.72 + pageProgress * .28));
      objects.paperClose.setAlpha(paperCloseVisible ? easeOutCubic(clamp((t - 2.47) / .22, 0, 1)) : 0);
      objects.paperClose.setVisible(objects.paperClose.alpha > .01);
    }
    if (objects.fxBack) {
      objects.fxBack.clear();
      objects.fxBack.setVisible(true);
      if (frameNumber >= 4 && frameNumber <= 22) {
        objects.fxBack.lineStyle(2, oipTreatmentActive ? 0x6b5a45 : 0xf4e0b9, oipTreatmentActive ? .32 : .36);
        for (index = 0; index < 5; index += 1) {
          line = new window.Phaser.Geom.Line(this.width * (.2 + index * .13), this.height * (.78 - index * .035), this.width * (.04 + index * .1), this.height * (.79 - index * .035));
          objects.fxBack.strokeLineShape(line);
        }
      }
    }
    if (objects.fxFront) {
      objects.fxFront.clear();
      objects.fxFront.setVisible(true);
      if (frameNumber >= 10 && frameNumber <= 12) {
        objects.fxFront.fillStyle(oipTreatmentActive ? 0x6f776d : 0xc5e5ed, oipTreatmentActive ? .5 : .72);
        for (index = 0; index < 7; index += 1) {
          objects.fxFront.fillCircle(this.width * (.52 + index * .015), this.height * (.75 - (index % 3) * .012), 2 + index % 3);
        }
      }
      if (stampProgress > .01 && objects.paperClose) {
        objects.fxFront.lineStyle(2, 0x9d3328, .42 * (1 - stampProgress));
        objects.fxFront.strokeCircle(objects.paperClose.x - pageW * .06, objects.paperClose.y - pageH * .38, 22 + stampProgress * 24);
      }
    }

    this.applyEndRunOipTreatment(oipTreatmentActive);
    this.updateEndRunResultText(this.width * .5, this.height * (.5 + porchProgress * .06), pageW, pageH, stampProgress, rowsProgress);
    this.endRunSpotVisible = !!(objects.spot && objects.spot.visible);
    this.endRunBobVisible = !!(objects.bob && objects.bob.visible);
    this.endRunBobFrame = this.endRunBobVisible ? String(bobFrame) : "";
    this.endRunEditionVisible = false;
    this.endRunEditionFrame = "";
    this.endRunPorchVisible = !!(objects.doorstep && objects.doorstep.visible);
    this.endRunSidePanelsVisible = !!(objects.sidePanels && objects.sidePanels.visible);
    this.endRunFrontPageVisible = frameNumber >= 35 && !!(objects.paperClose && objects.paperClose.visible);
    this.endRunPaperVisible = paperThrowVisible || !!(objects.paperClose && objects.paperClose.visible);
    this.endRunPaperFrame = objects.paperClose && objects.paperClose.visible ? paperCloseFrame : (paperThrowVisible ? "runtime_paper_throw_right" : "");
    this.endRunExtraStampVisible = !!(objects.extraStamp && objects.extraStamp.visible);
    this.endRunSummaryRowsVisible = rowsProgress > .01;
    this.endRunScoreStamped = this.endRunScoreShown || t >= END_RUN_SCORE_REVEAL_AT;
    if (this.player) {
      this.player.setVisible(!bobVisible);
    }

    this.endRunFinaleVisible = this.endRunBobVisible || this.endRunPaperVisible || this.endRunPorchVisible;
    this.endRunFinaleFrame = this.endRunPaperFrame || this.endRunBobFrame;
  };

  PaperRouteGame.prototype.revealEndRunResults = function (sequenceId) {
    var state = this.endRunSummaryState || this.rules.state;
    var self = this;

    if (sequenceId && this.finishSequenceId !== sequenceId) {
      return;
    }
    if (this.endRunSummaryShown) {
      return;
    }

    this.endRunActive = false;
    this.endRunElapsed = END_RUN_SUMMARY_REVEAL_AT;
    this.endRunBeat = "results";
    if (this.endRunLayer) {
      this.updateEndRunVisuals(END_RUN_SUMMARY_REVEAL_AT);
    } else {
      this.endRunOipBlend = 0;
      this.endRunColorBlend = 1;
    }
    this.endRunBeat = "results";
    if (!this.endRunScoreShown) {
      this.showFinalScore(state.score, this.endRunNewBest);
      this.endRunScoreShown = true;
    }
    if (this.summaryTitle) {
      this.summaryTitle.textContent = this.endRunTitle;
    }
    if (this.summaryCopy) {
      this.summaryCopy.textContent = this.endRunCopy;
    }
    this.renderSummaryMetrics(state);
    if (this.summaryCard) {
      this.summaryCard.hidden = false;
    }
    this.endRunSummaryShown = true;
    this.endRunExtraStampVisible = true;
    this.endRunSummaryRowsVisible = true;
    this.endRunScoreStamped = true;
    this.syncHud(this.endRunNewBest ? "New record saved in this browser." : "Final edition filed.");

    if (this.summaryRestart) {
      window.setTimeout(function () {
        if (self.finishSequenceId === sequenceId) {
          self.summaryRestart.focus({ preventScroll: true });
        }
      }, 20);
    }
  };

  PaperRouteGame.prototype.startEndRunCinematic = function (state, title, copy, effect, sequenceId) {
    var hasEndRunArt = this.createEndRunObjects();

    this.endRunSummaryState = state;
    this.endRunTitle = title;
    this.endRunCopy = copy;
    this.endRunNewBest = !!(effect && effect.newBest);
    this.endRunSequenceId = sequenceId;
    this.endRunElapsed = 0;
    this.endRunScoreShown = false;
    this.endRunSummaryShown = false;
    this.endRunSkipped = false;

    if (!hasEndRunArt) {
      this.endRunElapsed = END_RUN_SUMMARY_REVEAL_AT;
      this.endRunOipBlend = 0;
      this.endRunColorBlend = 1;
      this.revealEndRunResults(sequenceId);
      return;
    }

    if (this.reducedMotion) {
      this.endRunElapsed = END_RUN_SUMMARY_REVEAL_AT;
      this.updateEndRunVisuals(END_RUN_SUMMARY_REVEAL_AT);
      this.revealEndRunResults(sequenceId);
      return;
    }

    this.endRunActive = true;
    this.updateEndRunVisuals(0);
  };

  PaperRouteGame.prototype.skipEndRunCinematic = function () {
    if (!this.endRunActive) {
      return false;
    }

    this.endRunSkipped = true;
    this.endRunElapsed = END_RUN_SUMMARY_REVEAL_AT;
    this.updateEndRunVisuals(this.endRunElapsed);
    if (!this.endRunScoreShown) {
      this.showFinalScore((this.endRunSummaryState || this.rules.state).score, this.endRunNewBest);
      this.endRunScoreShown = true;
    }
    this.revealEndRunResults(this.endRunSequenceId);

    return true;
  };

  PaperRouteGame.prototype.updateEndRun = function (deltaSeconds) {
    if (!this.endRunActive) {
      return;
    }
    if (this.endRunSequenceId && this.finishSequenceId !== this.endRunSequenceId) {
      this.clearEndRunCinematic();
      return;
    }

    this.endRunElapsed = Math.min(END_RUN_SUMMARY_REVEAL_AT, this.endRunElapsed + deltaSeconds);
    this.updateEndRunVisuals(this.endRunElapsed);
    if (!this.endRunScoreShown && this.endRunElapsed >= END_RUN_SCORE_REVEAL_AT) {
      this.showFinalScore((this.endRunSummaryState || this.rules.state).score, this.endRunNewBest);
      this.endRunScoreShown = true;
    }
    if (this.endRunElapsed >= END_RUN_SUMMARY_REVEAL_AT) {
      this.revealEndRunResults(this.endRunSequenceId);
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
    } else if (pose === "wheelie-rise") {
      animation = "bobWheelieRise";
    } else if (pose === "wheelie-hold") {
      animation = "bobWheelieHold";
    } else if (pose === "wheelie-recover") {
      animation = "bobWheelieRecover";
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
    if (this.introComplete && this.introMode === "ready" && this.introObjects.finale) {
      this.positionIntroFinale(INTRO_BOB_SPOT_FINALE_FRAMES[INTRO_BOB_SPOT_FINALE_FRAMES.length - 1]);
      this.holdIntroSketchFinale();
    }
    if (this.endRunLayer) {
      this.updateEndRunVisuals(this.endRunElapsed);
    }
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
    this.clearEndRunCinematic();
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
    this.clearStageTouchState();
    this.releaseDpad();
    this.trickHeld = false;
    this.routeOffset = 0;
    this.updateRoadKitObjects();
    this.seedTrackSegments();
    this.poseHoldUntil = 0;
    this.heldPose = "";
    this.wheelieVisualStartedAt = 0;
    this.wheelieRecoverUntil = 0;
    this.finishSequenceId += 1;
    this.basePlayerX = this.width * .5;
    this.basePlayerY = this.height * .76;
    this.hideIntroCinematicLayers();
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
      this.wheelieVisualStartedAt = this.rules.state.elapsed;
      this.wheelieRecoverUntil = 0;
      this.playerPose = "";
      if (this.player) {
        this.player.setAngle(this.heldRight ? 13 : -13);
        this.player.setTint(0xf6dfb7);
        this.setPlayerPose("wheelie-rise");
      }
      this.applyEffects(effects);
    }
  };

  PaperRouteGame.prototype.stopWheelie = function () {
    var effects;

    this.trickHeld = false;
    effects = this.rules.stopWheelie();
    this.applyEffects(effects);
    if (effects.length && this.player) {
      this.heldPose = "";
      this.poseHoldUntil = 0;
      this.wheelieRecoverUntil = this.rules.state.elapsed + .34;
      if (this.rules.isSlowed()) {
        this.player.setTint(0x557b82);
      } else {
        this.player.clearTint();
      }
      this.player.setAngle((this.heldLeft ? -1 : this.heldRight ? 1 : 0) * 4);
      this.playerPose = "";
      this.setPlayerPose("wheelie-recover");
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
    this.touchSteerDirection = 0;
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
    var turn = this.heldLeft ? -1 : (this.heldRight ? 1 : this.touchSteerDirection);

    if (!this.player) {
      return;
    }

    if (state.airborne && state.airborneUntil > state.airborneStartedAt) {
      progress = clamp((state.elapsed - state.airborneStartedAt) / (state.airborneUntil - state.airborneStartedAt), 0, 1);
      lift = Math.sin(progress * Math.PI) * 48;
      displayScale = 1 + Math.sin(progress * Math.PI) * .12;
      this.player.setAngle(turn * 8);
      this.player.setTint(0xb9894d);
      pose = state.elapsed < this.poseHoldUntil && this.heldPose ? this.heldPose : "airborne";
    } else if (state.wheelie) {
      progress = clamp((state.elapsed - this.wheelieVisualStartedAt) / .52, 0, 1);
      lift = 24 + Math.sin(progress * Math.PI) * 20;
      displayScale = 1.22 + progress * .16;
      this.player.setAngle(turn * 10);
      this.player.setTint(0xf6dfb7);
      pose = state.elapsed - this.wheelieVisualStartedAt < .52 ? "wheelie-rise" : "wheelie-hold";
    } else if (state.elapsed < this.wheelieRecoverUntil) {
      displayScale = 1.1;
      this.player.setAngle(turn * 5);
      pose = "wheelie-recover";
    } else if (state.elapsed < this.poseHoldUntil && this.heldPose) {
      this.player.setAngle(turn * 4);
      pose = this.heldPose;
    } else {
      this.heldPose = "";
      displayScale = 1;
      this.player.setAngle(turn * 4);
      pose = turn < 0 ? "lean-left" : (turn > 0 ? "lean-right" : "ride");
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
    if (this.endRunActive) {
      this.updateEndRun(deltaSeconds);
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
    var sequenceId = this.finishSequenceId + 1;

    this.finishSequenceId = sequenceId;
    this.scene.physics.pause();
    this.clearObjects();
    this.clearStageTouchState();
    this.releaseDpad();
    this.setTouchPanel(false);
    this.hideIntroCinematicLayers();
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

    title = String(Math.max(0, Math.round(state.score || 0)));
    copy = effect && effect.newBest ? "New Paper-Bob record." : "Edition delivered.";
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
    this.startEndRunCinematic(state, title, copy, effect, sequenceId);
  };

  PaperRouteGame.prototype.togglePause = function () {
    if (!this.rules.state.running) {
      return;
    }

    if (!this.rules.state.paused) {
      this.rules.setPaused(true);
      this.scene.physics.pause();
      this.clearStageTouchState();
      this.releaseDpad();
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

    while (remaining > 0 && (this.introMode === "intro-cinematic" || this.endRunActive || (this.rules.state.running && !this.rules.state.paused))) {
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
      introBeat: this.introBeat,
      introBobFrame: this.introBobFrame,
      introSpotFrame: this.introSpotFrame,
      introFinaleFrame: this.introFinaleFrame,
      introSpotVisible: !!(this.introObjects.spot && this.introObjects.spot.visible),
      introFinaleVisible: !!(this.introObjects.finale && this.introObjects.finale.visible),
      introSketchVisible: !!(this.introSketchLayer && this.introSketchLayer.visible),
      introSketchReveal: this.introSketchReveal,
      introColorBlend: this.introColorBlend,
      introOipBlend: this.introOipBlend,
      introSketchFrame: this.introSketchFrame,
      introSettingVisible: !!(this.introSketchObjects.setting && this.introSketchObjects.setting.visible),
      introSettingFrame: this.introSettingFrame,
      endRunElapsed: Math.round(this.endRunElapsed * 1000) / 1000,
      endRunBeat: this.endRunBeat,
      endRunOipBlend: this.endRunOipBlend,
      endRunColorBlend: this.endRunColorBlend,
      endRunSpotVisible: this.endRunSpotVisible,
      endRunFinaleVisible: this.endRunFinaleVisible,
      endRunFinaleFrame: this.endRunFinaleFrame,
      endRunBobVisible: this.endRunBobVisible,
      endRunBobFrame: this.endRunBobFrame,
      endRunEditionVisible: this.endRunEditionVisible,
      endRunEditionFrame: this.endRunEditionFrame,
      endRunFrontPageVisible: this.endRunFrontPageVisible,
      endRunPaperVisible: this.endRunPaperVisible,
      endRunPaperFrame: this.endRunPaperFrame,
      endRunPorchVisible: this.endRunPorchVisible,
      endRunExtraStampVisible: this.endRunExtraStampVisible,
      endRunSummaryRowsVisible: this.endRunSummaryRowsVisible,
      endRunSidePanelsVisible: this.endRunSidePanelsVisible,
      endRunOipTreatmentActive: this.endRunOipTreatmentActive,
      endRunSkipped: this.endRunSkipped,
      endRunFrame: this.endRunFrame,
      endRunScoreStamped: this.endRunScoreStamped,
      endRunCameraZoom: this.endRunCameraZoom,
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
      bobFrame: this.player && this.player.frame ? this.player.frame.name : null,
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
      touchControlMode: this.touchControlMode,
      touchSteerActive: this.touchSteerActive,
      touchSteerTargetX: this.touchSteerTargetX === null ? null : Math.round(this.touchSteerTargetX),
      dpadActive: this.dpadActive,
      dpadDirection: this.dpadDirection,
      lastTouchZone: this.lastTouchZone,
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
