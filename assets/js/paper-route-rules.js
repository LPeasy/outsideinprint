(function (root, factory) {
  root.OipPaperRouteRules = factory();
}(typeof window !== "undefined" ? window : globalThis, function () {
  var RUN_SECONDS = 75;
  var STARTING_PAPERS = 30;
  var SLOW_SECONDS = 1.5;
  var WHEELIE_TICK_SECONDS = .25;
  var WHEELIE_TICK_POINTS = 5;
  var WHEELIE_CAP = 40;
  var SCORES = {
    mailbox: 100,
    doorstep: 150,
    window: 250,
    airborneDelivery: 75,
    ramp: 100,
    puddleClear: 75,
    streakStep: 25
  };

  function createEffect(type, message, details) {
    var effect = details || {};
    effect.type = type;
    if (message) {
      effect.message = message;
    }
    return effect;
  }

  function initialDeliveries() {
    return {
      mailbox: 0,
      doorstep: 0,
      window: 0
    };
  }

  function RouteRules(options) {
    options = options || {};
    this.highScore = options.highScore || 0;
    this.reset();
  }

  RouteRules.prototype.reset = function () {
    this.state = {
      score: 0,
      highScore: this.highScore,
      papers: STARTING_PAPERS,
      timeRemaining: RUN_SECONDS,
      elapsed: 0,
      streak: 0,
      airborne: false,
      airborneStartedAt: 0,
      airborneUntil: 0,
      wheelie: false,
      wheelieAccumulator: 0,
      wheelieScore: 0,
      slowUntil: 0,
      running: false,
      paused: false,
      deliveries: initialDeliveries(),
      missed: 0,
      puddleHits: 0,
      puddlesCleared: 0,
      rampsTaken: 0,
      finishReason: ""
    };
  };

  RouteRules.prototype.start = function (highScore) {
    if (typeof highScore === "number") {
      this.highScore = Math.max(0, Math.round(highScore));
    }
    this.reset();
    this.state.highScore = this.highScore;
    this.state.running = true;
    return [createEffect("start", "Bag packed. The street is open.")];
  };

  RouteRules.prototype.setPaused = function (paused) {
    this.state.paused = !!paused;
    return [createEffect(paused ? "pause" : "resume", paused ? "Deadline hold." : "Back on the route.")];
  };

  RouteRules.prototype.isSlowed = function () {
    return this.state.running && this.state.elapsed < this.state.slowUntil;
  };

  RouteRules.prototype.startAirborne = function (durationSeconds, source) {
    this.state.airborne = true;
    this.state.airborneStartedAt = this.state.elapsed;
    this.state.airborneUntil = Math.max(this.state.airborneUntil, this.state.elapsed + durationSeconds);
    this.state.wheelie = false;
    return createEffect(source || "airborne", "Bob is airborne.");
  };

  RouteRules.prototype.startHop = function () {
    if (!this.state.running || this.state.paused || this.state.airborne) {
      return [];
    }
    return [this.startAirborne(.62, "hop")];
  };

  RouteRules.prototype.landJump = function () {
    if (!this.state.airborne) {
      return [];
    }
    this.state.airborne = false;
    this.state.airborneUntil = 0;
    this.state.airborneStartedAt = 0;
    return [createEffect("land", "Wheels down.")];
  };

  RouteRules.prototype.takeRamp = function () {
    if (!this.state.running || this.state.paused) {
      return [];
    }
    this.state.score += SCORES.ramp;
    this.state.rampsTaken += 1;
    return [
      createEffect("ramp", "Ramp clip +" + SCORES.ramp + ".", { points: SCORES.ramp }),
      this.startAirborne(.95, "ramp-air")
    ];
  };

  RouteRules.prototype.startWheelie = function () {
    if (!this.state.running || this.state.paused || this.state.airborne || this.state.wheelie) {
      return [];
    }
    this.state.wheelie = true;
    this.state.wheelieAccumulator = 0;
    this.state.wheelieScore = 0;
    return [createEffect("wheelie-start", "Wheelie held.")];
  };

  RouteRules.prototype.stopWheelie = function () {
    if (!this.state.wheelie) {
      return [];
    }
    this.state.wheelie = false;
    this.state.wheelieAccumulator = 0;
    return [createEffect("wheelie-stop", "Front wheel down.")];
  };

  RouteRules.prototype.consumePaper = function () {
    if (this.state.papers <= 0) {
      return false;
    }
    this.state.papers -= 1;
    return true;
  };

  RouteRules.prototype.throwPaper = function (direction) {
    if (!this.state.running || this.state.paused) {
      return { ok: false, effects: [] };
    }
    if (!this.consumePaper()) {
      return { ok: false, effects: [createEffect("empty", "Bag empty.")] };
    }
    return {
      ok: true,
      direction: direction,
      airborne: this.state.airborne,
      effects: [createEffect("throw", direction === "left" ? "Left toss away." : "Right toss away.", {
        direction: direction,
        papers: this.state.papers,
        airborne: this.state.airborne
      })]
    };
  };

  RouteRules.prototype.throwLeft = function () {
    return this.throwPaper("left");
  };

  RouteRules.prototype.throwRight = function () {
    return this.throwPaper("right");
  };

  RouteRules.prototype.scoreDelivery = function (kind, airborneThrow) {
    var base = SCORES[kind] || SCORES.mailbox;
    var airborneBonus = airborneThrow ? SCORES.airborneDelivery : 0;
    var streakBonus;
    var total;

    if (!this.state.running || this.state.paused) {
      return [];
    }

    this.state.streak += 1;
    streakBonus = this.state.streak > 0 && this.state.streak % 3 === 0 ? SCORES.streakStep : 0;
    total = base + airborneBonus + streakBonus;
    this.state.score += total;
    this.state.deliveries[kind] = (this.state.deliveries[kind] || 0) + 1;

    return [createEffect("delivery", kind + " filed +" + total + ".", {
      kind: kind,
      points: total,
      base: base,
      airborneBonus: airborneBonus,
      streakBonus: streakBonus,
      streak: this.state.streak
    })];
  };

  RouteRules.prototype.hitMailbox = function (airborneThrow) {
    return this.scoreDelivery("mailbox", airborneThrow);
  };

  RouteRules.prototype.hitDoorstep = function (airborneThrow) {
    return this.scoreDelivery("doorstep", airborneThrow);
  };

  RouteRules.prototype.hitWindow = function (airborneThrow) {
    return this.scoreDelivery("window", airborneThrow);
  };

  RouteRules.prototype.missPaper = function () {
    if (!this.state.running || this.state.paused) {
      return [];
    }
    this.state.missed += 1;
    this.state.streak = 0;
    return [createEffect("miss", "Paper sailed wide.")];
  };

  RouteRules.prototype.clearPuddle = function () {
    if (!this.state.running || this.state.paused) {
      return [];
    }
    this.state.puddlesCleared += 1;
    this.state.score += SCORES.puddleClear;
    return [createEffect("puddle-clear", "Clean hop +" + SCORES.puddleClear + ".", { points: SCORES.puddleClear })];
  };

  RouteRules.prototype.hitPuddle = function () {
    if (!this.state.running || this.state.paused) {
      return [];
    }
    if (this.state.airborne) {
      return this.clearPuddle();
    }
    this.state.puddleHits += 1;
    this.state.streak = 0;
    this.state.slowUntil = Math.max(this.state.slowUntil, this.state.elapsed + SLOW_SECONDS);
    if (this.state.papers > 0) {
      this.state.papers -= 1;
    }
    return [createEffect("puddle-hit", "Puddle splash. One paper gone.", {
      papers: this.state.papers,
      slowUntil: this.state.slowUntil
    })];
  };

  RouteRules.prototype.finish = function (reason) {
    var newBest;

    if (!this.state.running) {
      return [];
    }
    this.state.running = false;
    this.state.paused = false;
    this.state.airborne = false;
    this.state.wheelie = false;
    this.state.finishReason = reason || "complete";
    newBest = this.state.score > this.highScore;
    if (newBest) {
      this.highScore = this.state.score;
      this.state.highScore = this.highScore;
    }
    return [createEffect("finish", newBest ? "New Paper-Bob record." : "Run filed.", {
      reason: this.state.finishReason,
      newBest: newBest,
      score: this.state.score
    })];
  };

  RouteRules.prototype.tick = function (deltaSeconds, activePapers) {
    var effects = [];
    var wheeliePoints;

    if (!this.state.running || this.state.paused) {
      return effects;
    }

    this.state.elapsed += Math.max(0, deltaSeconds || 0);
    this.state.timeRemaining = Math.max(0, RUN_SECONDS - this.state.elapsed);

    if (this.state.airborne && this.state.elapsed >= this.state.airborneUntil) {
      effects = effects.concat(this.landJump());
    }

    if (this.state.wheelie && !this.state.airborne) {
      this.state.wheelieAccumulator += deltaSeconds;
      while (this.state.wheelieAccumulator >= WHEELIE_TICK_SECONDS && this.state.wheelieScore < WHEELIE_CAP) {
        this.state.wheelieAccumulator -= WHEELIE_TICK_SECONDS;
        wheeliePoints = Math.min(WHEELIE_TICK_POINTS, WHEELIE_CAP - this.state.wheelieScore);
        this.state.wheelieScore += wheeliePoints;
        this.state.score += wheeliePoints;
        effects.push(createEffect("wheelie-score", "Wheelie bonus +" + wheeliePoints + ".", { points: wheeliePoints }));
      }
    }

    if (this.state.timeRemaining <= 0) {
      effects = effects.concat(this.finish("time"));
    } else if (this.state.papers <= 0 && (activePapers || 0) <= 0) {
      effects = effects.concat(this.finish("papers"));
    }

    return effects;
  };

  return {
    RUN_SECONDS: RUN_SECONDS,
    STARTING_PAPERS: STARTING_PAPERS,
    SCORES: SCORES,
    create: function (options) {
      return new RouteRules(options);
    },
    RouteRules: RouteRules
  };
}));
