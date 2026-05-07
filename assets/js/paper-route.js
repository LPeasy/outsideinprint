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
    firstTargetDelay: 420,
    firstPuddleDelay: 2300,
    firstRampDelay: 3900,
    playerDisplay: { width: 96, height: 96 },
    playerBody: { width: 88, height: 104 },
    paperBody: { width: 24, height: 15 },
    paperDisplay: { width: 38, height: 24 },
    puddleDisplay: { width: 92, height: 42 },
    hitFlashDisplay: { width: 84, height: 84 }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
    this.paperSrc = this.options.paperSrc || "";
    this.puddleSrc = this.options.puddleSrc || "";
    this.puddleSplashSrc = this.options.puddleSplashSrc || "";
    this.mailboxHitSrc = this.options.mailboxHitSrc || "";
    this.doorstepHitSrc = this.options.doorstepHitSrc || "";
    this.windowHitSrc = this.options.windowHitSrc || "";
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
    this.startCard = this.options.startCard;
    this.pauseCard = this.options.pauseCard;
    this.summaryCard = this.options.summaryCard;
    this.summaryTitle = this.options.summaryTitle;
    this.summaryCopy = this.options.summaryCopy;
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
    this.targets = null;
    this.ramps = null;
    this.puddles = null;
    this.papers = null;
    this.player = null;
    this.keys = {};
    this.heldLeft = false;
    this.heldRight = false;
    this.heldUp = false;
    this.heldDown = false;
    this.trickHeld = false;
    this.throwCooldown = 0;
    this.targetTimer = 0;
    this.puddleTimer = 0;
    this.rampTimer = 0;
    this.targetSpawnCount = 0;
    this.routeOffset = 0;
    this.playerPose = "";
    this.poseHoldUntil = 0;
    this.heldPose = "";
    this.finishSequenceId = 0;
    this.basePlayerX = 0;
    this.basePlayerY = 0;
    this.width = 480;
    this.height = 853;
    this.roadLeft = 150;
    this.roadRight = 330;
    this.cleanup = [];
    this.reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    this.bindDom();
    this.setTouchPanel(false);
    this.createPhaserGame();
    this.observeTheme();
    this.syncAudioButton();
    this.syncHud("Press Start route when the bag is loaded.");
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

    this.muteButton.textContent = this.muted ? "Sound: Muted" : "Sound: On";
    this.muteButton.setAttribute("aria-label", this.muted ? "Turn Paper-Bob sound on" : "Mute Paper-Bob sound");
    this.muteButton.setAttribute("aria-pressed", this.muted ? "true" : "false");
  };

  PaperRouteGame.prototype.toggleMute = function () {
    this.muted = !this.muted;
    this.syncAudioButton();

    if (!this.muted) {
      this.playSound("mailbox");
    }

    this.syncHud(this.muted ? "Sound muted." : "Sound on.");
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

  PaperRouteGame.prototype.createPhaserGame = function () {
    var self = this;

    this.game = new window.Phaser.Game({
      type: window.Phaser.CANVAS,
      parent: this.container,
      width: 480,
      height: 853,
      backgroundColor: "#171512",
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

  PaperRouteGame.prototype.preloadScene = function (scene) {
    if (this.bobSheetSrc) {
      scene.load.spritesheet("paperBobSheet", this.bobSheetSrc, {
        frameWidth: 128,
        frameHeight: 128
      });
    }
    if (this.bobSrc) {
      scene.load.image("paperBobSprite", this.bobSrc);
    }
    if (this.paperSrc) {
      scene.load.image("paperRoutePaperAsset", this.paperSrc);
    }
    if (this.puddleSrc) {
      scene.load.image("paperRoutePuddleAsset", this.puddleSrc);
    }
    if (this.puddleSplashSrc) {
      scene.load.image("paperRoutePuddleSplashAsset", this.puddleSplashSrc);
    }
    if (this.mailboxHitSrc) {
      scene.load.image("paperRouteMailboxHitAsset", this.mailboxHitSrc);
    }
    if (this.doorstepHitSrc) {
      scene.load.image("paperRouteDoorstepHitAsset", this.doorstepHitSrc);
    }
    if (this.windowHitSrc) {
      scene.load.image("paperRouteWindowHitAsset", this.windowHitSrc);
    }
  };

  PaperRouteGame.prototype.createScene = function (scene) {
    var self = this;
    var playerTexture;

    this.scene = scene;
    this.background = scene.add.graphics();
    this.generateTextures(scene);
    this.createBobAnimations(scene);
    this.targets = scene.physics.add.group();
    this.ramps = scene.physics.add.group();
    this.puddles = scene.physics.add.group();
    this.papers = scene.physics.add.group();
    playerTexture = scene.textures.exists("paperBobSheet") ? "paperBobSheet" : (scene.textures.exists("paperBobSprite") ? "paperBobSprite" : "paperRouteCourierFallback");
    this.player = scene.physics.add.sprite(0, 0, playerTexture, 0);
    this.player.setDepth(18);
    this.player.setOrigin(.5, .72);
    this.setPlayerDisplaySize(1);
    this.setPlayerPose("ride");
    this.player.body.setSize(TUNING.playerBody.width, TUNING.playerBody.height, true);

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
    scene.scale.on("resize", function () {
      self.layoutScene();
    });

    this.layoutScene();
    this.showStartCard();
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
    create("bobWheelie", [BOB_FRAME.wheelieStart, BOB_FRAME.wheelieRise, BOB_FRAME.wheeliePeak, BOB_FRAME.wheelieHold], 8, -1);
    create("bobPuddleHit", [BOB_FRAME.puddleSplash, BOB_FRAME.puddleWobble, BOB_FRAME.puddleLoss, BOB_FRAME.puddleRecover], 7, 0);
    create("bobRunEnd", [34, 35, 36, 37, 38, 39, 40, 41], 4, 0);
  };

  PaperRouteGame.prototype.hasBobSheet = function () {
    return !!(this.scene && this.scene.textures.exists("paperBobSheet"));
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
      animation = "bobWheelie";
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
    graphics.lineStyle(4, 0xece7df, .9);
    graphics.strokeCircle(20, 28, 13);
    graphics.strokeCircle(56, 28, 13);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(24, 26, 38, 9));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(38, 9, 52, 26));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(31, 27, 56, 27));
    graphics.fillStyle(0xd5be96, 1);
    graphics.fillRoundedRect(6, 5, 28, 22, 3);
    graphics.fillStyle(0x171512, 1);
    graphics.fillRoundedRect(34, 0, 24, 28, 6);
    graphics.generateTexture("paperRouteCourierFallback", 78, 54);

    graphics.clear();
    graphics.fillStyle(0xfff5d6, 1);
    graphics.fillRoundedRect(1, 1, 25, 16, 2);
    graphics.fillStyle(0xd5be96, .86);
    graphics.fillTriangle(18, 1, 26, 1, 26, 9);
    graphics.lineStyle(1, 0x365263, .95);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(5, 5, 17, 5));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(5, 9, 21, 9));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(5, 13, 15, 13));
    graphics.generateTexture("paperRoutePaper", 28, 18);

    graphics.clear();
    graphics.fillStyle(0x1c1a16, 1);
    graphics.fillRoundedRect(10, 10, 58, 64, 5);
    graphics.fillStyle(0x2d2922, 1);
    graphics.fillTriangle(5, 14, 39, 0, 73, 14);
    graphics.fillStyle(0xfff5d6, .86);
    graphics.fillRoundedRect(21, 26, 14, 16, 2);
    graphics.fillRoundedRect(43, 26, 14, 16, 2);
    graphics.fillStyle(0x6f5a46, 1);
    graphics.fillRoundedRect(33, 50, 12, 24, 2);
    graphics.fillStyle(0x2f2c26, .92);
    graphics.fillRoundedRect(48, 78, 74, 18, 3);
    graphics.fillStyle(0x4a463b, .86);
    graphics.fillRoundedRect(52, 84, 70, 7, 1);
    graphics.fillStyle(0x365263, 1);
    graphics.fillRoundedRect(74, 51, 38, 26, 4);
    graphics.fillStyle(0xfff5d6, .96);
    graphics.fillRoundedRect(82, 58, 18, 8, 2);
    graphics.fillStyle(0xd5be96, 1);
    graphics.fillTriangle(78, 51, 93, 39, 108, 51);
    graphics.fillRect(91, 77, 5, 21);
    graphics.fillStyle(0xa84e35, 1);
    graphics.fillRect(106, 48, 10, 5);
    graphics.lineStyle(2, 0xece7df, .82);
    graphics.strokeRoundedRect(10, 10, 58, 64, 5);
    graphics.strokeRoundedRect(74, 51, 38, 26, 4);
    graphics.generateTexture("paperRouteMailbox", 132, 108);

    graphics.clear();
    graphics.fillStyle(0x1c1a16, 1);
    graphics.fillRoundedRect(10, 10, 76, 68, 5);
    graphics.fillStyle(0x2d2922, 1);
    graphics.fillTriangle(4, 15, 48, 0, 92, 15);
    graphics.fillStyle(0xfff5d6, .88);
    graphics.fillRoundedRect(25, 24, 18, 16, 2);
    graphics.fillRoundedRect(54, 24, 18, 16, 2);
    graphics.fillStyle(0x365263, .88);
    graphics.fillRoundedRect(35, 48, 28, 30, 2);
    graphics.fillStyle(0x2f2c26, .92);
    graphics.fillRoundedRect(54, 80, 66, 18, 3);
    graphics.fillStyle(0x6f5a46, 1);
    graphics.fillRoundedRect(57, 65, 58, 27, 5);
    graphics.fillStyle(0xd5be96, .75);
    graphics.fillRect(63, 73, 46, 7);
    graphics.fillStyle(0x365263, 1);
    graphics.fillRoundedRect(94, 48, 24, 18, 4);
    graphics.fillStyle(0xfff5d6, .9);
    graphics.fillRoundedRect(99, 54, 11, 5, 1);
    graphics.lineStyle(2, 0xece7df, .76);
    graphics.strokeRoundedRect(10, 10, 76, 68, 5);
    graphics.strokeRoundedRect(57, 65, 58, 27, 5);
    graphics.generateTexture("paperRouteDoorstep", 132, 108);

    graphics.clear();
    graphics.fillStyle(0x1c1a16, 1);
    graphics.fillRoundedRect(8, 10, 86, 72, 5);
    graphics.fillStyle(0x2d2922, 1);
    graphics.fillTriangle(1, 16, 51, 0, 101, 16);
    graphics.fillStyle(0xfff5d6, .84);
    graphics.fillRoundedRect(25, 27, 20, 18, 2);
    graphics.fillRoundedRect(57, 27, 20, 18, 2);
    graphics.fillRoundedRect(38, 50, 28, 22, 2);
    graphics.lineStyle(2, 0x365263, .92);
    graphics.strokeRoundedRect(38, 50, 28, 22, 2);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(52, 50, 52, 72));
    graphics.strokeLineShape(new window.Phaser.Geom.Line(38, 61, 66, 61));
    graphics.fillStyle(0x2f2c26, .92);
    graphics.fillRoundedRect(55, 80, 68, 18, 3);
    graphics.fillStyle(0x4a463b, .82);
    graphics.fillRoundedRect(60, 86, 63, 6, 1);
    graphics.fillStyle(0x365263, 1);
    graphics.fillRoundedRect(96, 49, 24, 18, 4);
    graphics.fillStyle(0xd5be96, 1);
    graphics.fillRect(107, 67, 4, 24);
    graphics.lineStyle(2, 0xece7df, .8);
    graphics.strokeRoundedRect(8, 10, 86, 72, 5);
    graphics.generateTexture("paperRouteWindow", 134, 108);

    graphics.clear();
    graphics.fillStyle(0x2f2c26, 1);
    graphics.fillRoundedRect(9, 19, 74, 45, 4);
    graphics.fillStyle(0xd5be96, 1);
    graphics.fillTriangle(13, 19, 46, 2, 79, 19);
    graphics.fillStyle(0x8f6e3d, 1);
    graphics.fillTriangle(16, 25, 46, 11, 76, 25);
    graphics.fillStyle(0xfff5d6, .9);
    graphics.fillRoundedRect(21, 29, 50, 10, 2);
    graphics.fillStyle(0x365263, .55);
    graphics.fillRoundedRect(25, 43, 42, 10, 2);
    graphics.lineStyle(3, 0xfff5d6, .82);
    graphics.strokeLineShape(new window.Phaser.Geom.Line(46, 3, 46, 62));
    graphics.lineStyle(2, 0xece7df, .82);
    graphics.strokeTriangle(13, 19, 46, 2, 79, 19);
    graphics.strokeRoundedRect(9, 19, 74, 45, 4);
    graphics.generateTexture("paperRouteRamp", 92, 72);

    graphics.clear();
    graphics.fillStyle(0x365263, .9);
    graphics.fillEllipse(48, 28, 82, 34);
    graphics.fillStyle(0x99adbf, .72);
    graphics.fillEllipse(39, 22, 32, 10);
    graphics.fillEllipse(59, 34, 24, 8);
    graphics.lineStyle(2, 0xfff5d6, .45);
    graphics.strokeEllipse(48, 28, 82, 34);
    graphics.generateTexture("paperRoutePuddle", 96, 58);

    graphics.destroy();
  };

  PaperRouteGame.prototype.palette = function () {
    var light = document.documentElement.getAttribute("data-theme") === "light";

    return light ? {
      paper: 0xefe2cf,
      paperAlt: 0xd8c6ac,
      ink: 0x211f1d,
      inkSoft: 0x6f5a46,
      road: 0x716a5e,
      roadDark: 0x5c554b,
      lane: 0xfff5d6,
      route: 0xa84e35,
      curb: 0xc8b798,
      porch: 0xf7efe3
    } : {
      paper: 0x171512,
      paperAlt: 0x24211c,
      ink: 0xece7df,
      inkSoft: 0x8e877d,
      road: 0x4c493f,
      roadDark: 0x38342d,
      lane: 0xfff5d6,
      route: 0xd5be96,
      curb: 0x2a2a27,
      porch: 0x24211c
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

    g.fillStyle(palette.curb, 1);
    g.fillRect(this.roadLeft - 8, 0, 8, height);
    g.fillRect(this.roadRight, 0, 8, height);
    g.fillStyle(palette.road, 1);
    g.fillRect(this.roadLeft, 0, roadWidth, height);
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
  };

  PaperRouteGame.prototype.showStartCard = function () {
    var self = this;

    if (this.startCard) {
      this.startCard.hidden = false;
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
    this.setTouchPanel(false);
    if (this.pauseButton) {
      this.pauseButton.textContent = "Pause";
      this.pauseButton.disabled = true;
    }
    if (this.restartButton) {
      this.restartButton.disabled = true;
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
    this.clearObjects();
    this.applyEffects(this.rules.start(this.highScore));
    this.throwCooldown = 0;
    this.targetTimer = TUNING.firstTargetDelay / 1000;
    this.puddleTimer = TUNING.firstPuddleDelay / 1000;
    this.rampTimer = TUNING.firstRampDelay / 1000;
    this.targetSpawnCount = 0;
    this.heldLeft = false;
    this.heldRight = false;
    this.heldUp = false;
    this.heldDown = false;
    this.trickHeld = false;
    this.routeOffset = 0;
    this.poseHoldUntil = 0;
    this.heldPose = "";
    this.finishSequenceId += 1;
    this.basePlayerX = this.width * .5;
    this.basePlayerY = this.height * .76;
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
    this.syncHud("Route open. Throw left or right; ramps turn tosses into bonus points.");
    if (this.container && this.container.focus) {
      this.container.focus({ preventScroll: true });
    }
  };

  PaperRouteGame.prototype.clearObjects = function () {
    if (this.targets) {
      this.targets.clear(true, true);
    }
    if (this.ramps) {
      this.ramps.clear(true, true);
    }
    if (this.puddles) {
      this.puddles.clear(true, true);
    }
    if (this.papers) {
      this.papers.clear(true, true);
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

  PaperRouteGame.prototype.spawnTarget = function () {
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
    target.setVelocityY(this.currentSpeed() * .92);
    target.setData("type", type);
    target.setData("side", side);
    target.setData("hit", false);
    this.targets.add(target);
    this.targetSpawnCount += 1;
  };

  PaperRouteGame.prototype.spawnRamp = function () {
    var ramp = this.scene.physics.add.sprite(
      clamp(this.width * (.42 + Math.random() * .16), this.roadLeft + 32, this.roadRight - 32),
      -58,
      "paperRouteRamp"
    );

    ramp.setDepth(8);
    ramp.body.setSize(70, 32, true);
    ramp.setVelocityY(this.currentSpeed());
    ramp.setData("used", false);
    this.ramps.add(ramp);
  };

  PaperRouteGame.prototype.spawnPuddle = function () {
    var texture = this.scene.textures.exists("paperRoutePuddleAsset") ? "paperRoutePuddleAsset" : "paperRoutePuddle";
    var puddle = this.scene.physics.add.sprite(
      clamp(this.width * (.38 + Math.random() * .24), this.roadLeft + 28, this.roadRight - 28),
      -58,
      texture
    );

    puddle.setDepth(7);
    puddle.setDisplaySize(TUNING.puddleDisplay.width, TUNING.puddleDisplay.height);
    puddle.body.setSize(72, 28, true);
    puddle.setVelocityY(this.currentSpeed() * .98);
    puddle.setData("used", false);
    this.puddles.add(puddle);
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

    paper = this.scene.physics.add.sprite(
      this.player.x + sign * 24,
      this.player.y - 28,
      this.scene.textures.exists("paperRoutePaperAsset") ? "paperRoutePaperAsset" : "paperRoutePaper"
    );
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
    this.papers.add(paper);
    this.throwCooldown = (fromTouch ? TUNING.touchPaperCooldown : TUNING.paperCooldown) / 1000;
    this.heldPose = result.airborne ? "air-throw-" + direction : "throw-" + direction;
    this.poseHoldUntil = this.rules.state.elapsed + .24;
    this.playerPose = "";
    this.setPlayerPose(this.heldPose);
    this.paperTrail(paper.x - sign * 10, paper.y + 4, sign);
    this.playSound("throw");
    this.syncHud(result.airborne ? "Airborne toss." : (direction === "left" ? "Left toss." : "Right toss."));
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
      this.applyEffects(effects);
    }
  };

  PaperRouteGame.prototype.stopWheelie = function () {
    this.trickHeld = false;
    this.applyEffects(this.rules.stopWheelie());
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
    this.floatText("+" + (effects[0] ? effects[0].points : 0), target.x, target.y - 30, "#fff5d6");
    paper.destroy();
    target.destroy();
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
    this.floatText("+100", ramp.x, ramp.y - 30, "#fff5d6");
    this.rampBurst(ramp.x, ramp.y);
    ramp.destroy();
    this.playSound("ramp");
    this.applyEffects(effects);
  };

  PaperRouteGame.prototype.hitPuddle = function (puddle) {
    var effects;

    if (!this.rules.state.running || puddle.getData("used")) {
      return;
    }

    puddle.setData("used", true);
    effects = this.rules.hitPuddle();
    this.puddleBurst(puddle.x, puddle.y, this.rules.state.airborne);
    if (effects[0] && effects[0].type === "puddle-clear") {
      this.floatText("+75", puddle.x, puddle.y - 24, "#99adbf");
      this.playSound("clear");
    } else {
      this.floatText("-1 paper", puddle.x, puddle.y - 24, "#d5be96");
      this.player.setTint(0x99adbf);
      this.heldPose = "puddle";
      this.poseHoldUntil = this.rules.state.elapsed + .72;
      this.playerPose = "";
      this.setPlayerPose("puddle");
      this.playSound("puddle");
    }
    puddle.destroy();
    this.applyEffects(effects);
  };

  PaperRouteGame.prototype.floatText = function (copy, x, y, color) {
    var label;

    if (!this.scene) {
      return;
    }

    label = this.scene.add.text(x, y, copy, {
      color: color || "#fff5d6",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: "20px",
      fontStyle: "bold",
      stroke: "#171512",
      strokeThickness: 4
    });
    label.setOrigin(.5);
    label.setDepth(30);

    if (this.reducedMotion) {
      this.scene.time.delayedCall(520, function () {
        label.destroy();
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
        label.destroy();
      }
    });
  };

  PaperRouteGame.prototype.paperTrail = function (x, y, sign) {
    var mark;

    if (!this.scene || this.reducedMotion) {
      return;
    }

    mark = this.scene.add.graphics({ x: x, y: y });
    mark.lineStyle(2, 0xfff5d6, .38);
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
    var color = type === "window" ? 0x99adbf : (type === "doorstep" ? 0xd5be96 : 0xfff5d6);
    var texture = type === "window" ? "paperRouteWindowHitAsset" : (type === "doorstep" ? "paperRouteDoorstepHitAsset" : "paperRouteMailboxHitAsset");
    var burst;
    var burstScaleX;
    var burstScaleY;

    if (!this.scene || this.reducedMotion) {
      return;
    }

    if (this.scene.textures.exists(texture)) {
      burst = this.scene.add.image(x, y, texture);
      burst.setDepth(24);
      burst.setDisplaySize(type === "doorstep" ? 104 : TUNING.hitFlashDisplay.width, type === "doorstep" ? 86 : TUNING.hitFlashDisplay.height);
      burstScaleX = burst.scaleX;
      burstScaleY = burst.scaleY;
      this.scene.tweens.add({
        targets: burst,
        alpha: 0,
        scaleX: burstScaleX * 1.12,
        scaleY: burstScaleY * 1.12,
        duration: 340,
        onComplete: function () {
          burst.destroy();
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
    arc.lineStyle(3, 0xd5be96, .8);
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

    if (!this.scene || this.reducedMotion) {
      return;
    }

    if (this.scene.textures.exists("paperRoutePuddleSplashAsset")) {
      splash = this.scene.add.image(x, y, "paperRoutePuddleSplashAsset");
      splash.setDepth(23);
      splash.setDisplaySize(104, 58);
      splash.setTint(cleared ? 0xffffff : 0xd5be96);
      splashScaleX = splash.scaleX;
      splashScaleY = splash.scaleY;
      this.scene.tweens.add({
        targets: splash,
        alpha: 0,
        scaleX: splashScaleX * 1.18,
        scaleY: splashScaleY * 1.18,
        duration: 300,
        onComplete: function () {
          splash.destroy();
        }
      });
      return;
    }

    splash = this.scene.add.graphics({ x: x, y: y });
    splash.lineStyle(2, cleared ? 0x99adbf : 0xfff5d6, .72);
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
        self.floatText("+" + effect.points, self.player.x, self.player.y - 62, "#d5be96");
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
      this.player.setTint(0xd5be96);
      pose = state.elapsed < this.poseHoldUntil && this.heldPose ? this.heldPose : "airborne";
    } else if (state.wheelie) {
      displayScale = 1;
      this.player.setAngle(-9);
      this.player.setTint(0xfff5d6);
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
    var self = this;
    var effects;

    if (!this.scene || !this.rules.state.running || this.rules.state.paused) {
      return;
    }

    this.throwCooldown = Math.max(0, this.throwCooldown - deltaSeconds);
    this.targetTimer -= deltaSeconds;
    this.puddleTimer -= deltaSeconds;
    this.rampTimer -= deltaSeconds;
    this.handleKeyboard(deltaSeconds);
    speed = this.currentSpeed();
    this.routeOffset += speed * deltaSeconds;
    this.redrawBackground();

    this.targets.children.each(function (target) {
      target.setVelocityY(speed * .92);
      if (target.y > self.height + 90) {
        target.destroy();
      }
    });
    this.ramps.children.each(function (ramp) {
      ramp.setVelocityY(speed);
      if (ramp.y > self.height + 90) {
        ramp.destroy();
      }
    });
    this.puddles.children.each(function (puddle) {
      puddle.setVelocityY(speed * .98);
      if (puddle.y > self.height + 90) {
        puddle.destroy();
      }
    });
    this.papers.children.each(function (paper) {
      paper.x += (paper.getData("velocityX") || 0) * deltaSeconds;
      paper.y += (paper.getData("velocityY") || 0) * deltaSeconds;
      paper.angle += (paper.getData("spin") || 0) * deltaSeconds;
      if (paper.body && paper.body.updateFromGameObject) {
        paper.body.updateFromGameObject();
      }
      if (paper.x < -80 || paper.x > self.width + 80 || paper.y < -90 || paper.y > self.height + 80) {
        self.applyEffects(self.rules.missPaper());
        self.playSound("miss");
        paper.destroy();
      }
    });

    if (this.targetTimer <= 0) {
      this.spawnTarget();
      this.targetTimer = this.nextTargetInterval();
    }
    if (this.puddleTimer <= 0) {
      this.spawnPuddle();
      this.puddleTimer = this.nextPuddleInterval();
    }
    if (this.rampTimer <= 0) {
      this.spawnRamp();
      this.rampTimer = this.nextRampInterval();
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
    var showDelay = this.reducedMotion ? 80 : 1550;

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
    if (this.stage) {
      this.stage.classList.remove("paper-route-stage--paused");
    }

    title = effect && effect.newBest ? "New Paper-Bob record" : "Route complete";
    copy = "Score " + state.score + ". Papers left " + state.papers + ". Mailboxes " + state.deliveries.mailbox + ", doorsteps " + state.deliveries.doorstep + ", windows " + state.deliveries.window + ". Ramps " + state.rampsTaken + ", puddles cleared " + state.puddlesCleared + ".";
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
    this.syncHud("Route closed. Reading final edition.");

    this.scene.time.delayedCall(showDelay, function () {
      if (self.finishSequenceId !== sequenceId) {
        return;
      }

      if (self.summaryTitle) {
        self.summaryTitle.textContent = title;
      }
      if (self.summaryCopy) {
        self.summaryCopy.textContent = copy;
      }
      if (self.summaryCard) {
        self.summaryCard.hidden = false;
      }
      self.syncHud(effect && effect.newBest ? "New high score saved in this browser." : "Route closed.");

      if (self.summaryRestart) {
        self.scene.time.delayedCall(20, function () {
          if (self.finishSequenceId === sequenceId) {
            self.summaryRestart.focus({ preventScroll: true });
          }
        });
      }
    });
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
      this.syncHud("Paused.");
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
      this.syncHud("Route open.");
    }
  };

  PaperRouteGame.prototype.renderStateText = function () {
    var self = this;

    function snapshot(group) {
      var items = [];

      if (!group) {
        return items;
      }

      group.children.each(function (child) {
        if (child.active && items.length < 8) {
          items.push({
            x: Math.round(child.x),
            y: Math.round(child.y),
            type: child.getData ? child.getData("type") || child.texture.key : null,
            side: child.getData ? child.getData("side") : null
          });
        }
      });

      return items;
    }

    return JSON.stringify({
      coordinateSystem: "origin top-left; x right; y down; route scrolls downward toward Paper Bob",
      mode: this.rules.state.running ? (this.rules.state.paused ? "paused" : "running") : (this.summaryCard && !this.summaryCard.hidden ? "complete" : (this.rules.state.finishReason ? "run-end" : "ready")),
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
      speed: Math.round(this.currentSpeed()),
      bobPose: this.playerPose,
      bobSpriteSheetLoaded: this.hasBobSheet(),
      player: {
        x: this.player ? Math.round(this.player.x) : 0,
        y: this.player ? Math.round(this.player.y) : 0,
        roadLeft: Math.round(self.roadLeft),
        roadRight: Math.round(self.roadRight)
      },
      visibleTargets: snapshot(this.targets),
      visibleRamps: snapshot(this.ramps),
      visiblePuddles: snapshot(this.puddles),
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
}());
