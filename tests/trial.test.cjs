const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const plain = (value) => JSON.parse(JSON.stringify(value));
function load(context, files) {
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context, { filename: file });
  }
}
function model() {
  const context = vm.createContext({ window: {} });
  load(context, ["game.js", "sgf.js"]);
  return { game: new context.window.GoGame(19), SGF: context.window.SGF };
}
function play(game, x, y) {
  assert.equal(game.playMove(x, y).ok, true, `Expected legal move at ${x},${y}`);
}
function formalRecord(count) {
  const { game, SGF } = model();
  for (let y = 0; game.getMoveCount() < count; y += 1) {
    for (let x = 0; x < 19 && game.getMoveCount() < count; x += 1) {
      play(game, x, y);
    }
  }
  return { game, SGF };
}
function trialLine(game, count) {
  for (let x = 0; x < count; x += 1) play(game, x + 2, 16);
}
function capturePosition() {
  const { game, SGF } = model();
  for (const [x, y] of [[0, 1], [0, 0], [10, 10], [12, 12]]) play(game, x, y);
  return { game, SGF };
}
function koPosition() {
  const { game } = model();
  // Black's next move at (1,2) captures only the white stone at (1,1).
  for (const [x, y] of [[0, 1], [1, 1], [1, 0], [0, 2], [2, 1], [2, 2], [10, 10], [1, 3]]) {
    play(game, x, y);
  }
  return game;
}

test("scenario 1: six numbered trial moves from move 20 restore the exact position", () => {
  const { game } = formalRecord(20);
  const before = plain(game.toSerializable());
  const board = plain(game.getBoard());
  game.startTrial();
  trialLine(game, 6);
  assert.deepEqual(plain(game.getActiveTrialMoves().map((move) => move.number)), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(plain(game.getActiveTrialMoves().map((move) => move.color)), ["B", "W", "B", "W", "B", "W"]);
  assert.equal(game.currentMove, 20);
  game.endTrial();
  assert.equal(game.currentMove, 20);
  assert.deepEqual(plain(game.getBoard()), board);
  assert.deepEqual(plain(game.toSerializable()), before);
  assert.equal(game.trialMoves.length, 0);
  assert.equal(game.trialSnapshots.length, 0);
});

test("scenario 2: a captured formal stone is restored on trial undo and exit", () => {
  const { game } = capturePosition();
  const snapshots = plain(game.snapshots);
  const board = plain(game.getBoard());
  game.startTrial();
  play(game, 1, 0);
  assert.equal(game.getBoard()[0][0], null);
  game.undo();
  assert.deepEqual(plain(game.getBoard()), board);
  game.redo();
  assert.equal(game.getBoard()[0][0], null);
  game.endTrial();
  assert.deepEqual(plain(game.getBoard()), board);
  assert.deepEqual(plain(game.snapshots), snapshots);
});

test("scenario 3: ten trial moves never enter the 50-move record, SGF or saved data", () => {
  const { game, SGF } = formalRecord(50);
  game.setCommentForCurrentMove("正式备注 ] \\");
  const before = plain(game.toSerializable());
  const sgf = SGF.exportSgf(game);
  game.startTrial();
  trialLine(game, 10);
  game.setCommentForCurrentMove("试下不得覆盖备注");
  assert.equal(game.getMoveCount(), 50);
  assert.equal(SGF.exportSgf(game), sgf);
  assert.equal(SGF.parseSgf(SGF.exportSgf(game)).moves.length, 50);
  assert.deepEqual(plain(game.toSerializable()), before);
  const restored = model().game;
  restored.loadFromSerializable(plain(game.toSerializable()));
  assert.equal(restored.isTrialMode, false);
  assert.equal(restored.currentMove, 50);
  assert.deepEqual(plain(restored.getBoard()), plain(game.snapshots[50]));
  game.endTrial();
  assert.equal(game.getMoveCount(), 50);
  assert.equal(SGF.exportSgf(game), sgf);
});

test("scenario 4: a trial at move 40 preserves all 100 formal moves and their future", () => {
  const { game } = formalRecord(100);
  game.goToMove(40);
  const before = plain(game.toSerializable());
  const snapshots = plain(game.snapshots);
  const board = plain(game.getBoard());
  game.startTrial();
  trialLine(game, 5);
  for (const navigate of [() => game.goToMove(80), () => game.prev(), () => game.next(), () => game.goFirst(), () => game.goLast()]) {
    navigate();
    assert.equal(game.currentMove, 40);
    assert.equal(game.trialCurrentMove, 5);
  }
  game.endTrial();
  assert.equal(game.currentMove, 40);
  assert.deepEqual(plain(game.getBoard()), board);
  assert.deepEqual(plain(game.toSerializable()), before);
  assert.deepEqual(plain(game.snapshots), snapshots);
  game.goLast();
  assert.equal(game.currentMove, 100);
});

test("scenario 5: trials from moves 40 and 60 start independently with number one", () => {
  const { game } = formalRecord(100);
  for (const [start, count] of [[40, 5], [60, 8]]) {
    game.goToMove(start);
    const board = plain(game.getBoard());
    game.startTrial();
    assert.equal(game.trialStartMove, start);
    assert.equal(game.trialCurrentMove, 0);
    assert.equal(game.trialMoves.length, 0);
    trialLine(game, count);
    assert.equal(game.trialMoves[0].number, 1);
    assert.equal(game.getLastMove().number, count);
    game.endTrial();
    assert.equal(game.currentMove, start);
    assert.deepEqual(plain(game.getBoard()), board);
  }
});

test("trial undo/redo is bounded; replay after undo discards only the trial future", () => {
  const { game } = formalRecord(50);
  game.goToMove(21);
  const before = plain(game.toSerializable());
  game.startTrial();
  trialLine(game, 3);
  assert.equal(game.trialMoves[0].color, "W");
  game.undo();
  const board = plain(game.getBoard());
  assert.equal(game.getActiveTrialMoves().length, 2);
  game.redo();
  game.redo();
  assert.equal(game.trialCurrentMove, 3);
  game.undo();
  assert.equal(game.playMove(2, 16).ok, false);
  assert.equal(game.trialMoves.length, 3, "Illegal attempts keep redo available");
  assert.deepEqual(plain(game.getBoard()), board);
  play(game, 12, 16);
  assert.equal(game.getLastMove().number, 3);
  assert.equal(game.getBoard()[16][4], null);
  for (let i = 0; i < 5; i += 1) game.undo();
  assert.equal(game.trialCurrentMove, 0);
  assert.equal(game.currentMove, 21);
  assert.deepEqual(plain(game.toSerializable()), before);
  game.endTrial();
  assert.equal(game.currentMove, 21);
});

test("trial rejects occupied points, suicide and out-of-bounds without changing any state", () => {
  const { game } = model();
  for (const [x, y] of [[0, 1], [10, 10], [1, 0]]) play(game, x, y);
  game.startTrial();
  const board = plain(game.getBoard());
  for (const [x, y, error] of [[0, 1, /已有棋子/], [0, 0, /自杀/], [-1, 0, /越界/]]) {
    const result = game.playMove(x, y);
    assert.equal(result.ok, false);
    assert.match(result.error, error);
    assert.equal(game.trialCurrentMove, 0);
    assert.equal(game.getCurrentColor(), "W");
    assert.deepEqual(plain(game.getBoard()), board);
  }
});

test("ko checks span both the formal/trial boundary and the trial's own history", () => {
  const formalKo = koPosition();
  play(formalKo, 1, 2);
  formalKo.startTrial();
  assert.match(formalKo.playMove(1, 1).error, /打劫/);
  assert.equal(formalKo.trialMoves.length, 0);

  const trialKo = koPosition();
  trialKo.startTrial();
  play(trialKo, 1, 2);
  const captured = plain(trialKo.getBoard());
  assert.match(trialKo.playMove(1, 1).error, /打劫/);
  assert.deepEqual(plain(trialKo.getBoard()), captured);
  trialKo.undo();
  trialKo.redo();
  assert.match(trialKo.playMove(1, 1).error, /打劫/);
  play(trialKo, 15, 15);
  play(trialKo, 16, 15);
  play(trialKo, 1, 1);
  assert.equal(trialKo.getBoard()[2][1], null);
});

function canvasFixture() {
  const texts = [];
  const ctx = {
    clearRect() { texts.length = 0; }, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, arc() {}, fill() {}, save() {}, restore() {},
    createRadialGradient() { return { addColorStop() {} }; },
    fillText(text, x, y) { texts.push({ text, x, y, color: this.fillStyle }); },
  };
  const canvas = {
    width: 760, height: 760, listeners: {},
    getContext: () => ctx,
    addEventListener(event, handler) { this.listeners[event] = handler; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 760, height: 760 }),
  };
  return { canvas, texts, numbers: () => texts.filter(({ x, y }) => x >= 44 && x <= 716 && y >= 44 && y <= 716) };
}

test("real renderer draws trial numbers 1–6, retains them on hover, and removes them on exit", () => {
  const { game } = formalRecord(20);
  const context = vm.createContext({ window: { addEventListener() {} } });
  load(context, ["board.js"]);
  const fixture = canvasFixture();
  const view = new context.window.BoardView(fixture.canvas, 19, () => {});
  game.startTrial();
  trialLine(game, 6);
  view.render(game.getBoard(), game.getLastMove(), game.getCurrentColor(), game.getActiveTrialMoves());
  assert.deepEqual(fixture.numbers().map(({ text }) => text), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(fixture.numbers().map(({ color }) => color), ["#fff", "#111", "#fff", "#111", "#fff", "#111"]);
  view.setHoverIntersection({ x: 15, y: 15 });
  assert.equal(fixture.numbers().length, 6);
  game.endTrial();
  view.render(game.getBoard(), game.getLastMove(), game.getCurrentColor(), game.getActiveTrialMoves());
  assert.equal(fixture.numbers().length, 0);
});

test("renderer omits captured trial stones and numbers a replacement by its latest move", () => {
  const game = koPosition();
  const context = vm.createContext({ window: { addEventListener() {} } });
  load(context, ["board.js"]);
  const fixture = canvasFixture();
  const view = new context.window.BoardView(fixture.canvas, 19, () => {});
  game.startTrial();
  play(game, 1, 2); // 1: capture
  play(game, 15, 15); // 2: ko threat
  play(game, 16, 15); // 3: answer
  play(game, 1, 1); // 4: recapture trial stone 1
  view.render(game.getBoard(), game.getLastMove(), game.getCurrentColor(), game.getActiveTrialMoves());
  assert.deepEqual(fixture.numbers().map(({ text }) => text), ["2", "3", "4"]);
  play(game, 17, 15); // 5: ko threat
  play(game, 18, 15); // 6: answer
  play(game, 1, 2); // 7: recapture at trial stone 1's old point
  view.render(game.getBoard(), game.getLastMove(), game.getCurrentColor(), game.getActiveTrialMoves());
  assert.deepEqual(fixture.numbers().map(({ text }) => text), ["7", "2", "3", "5", "6"]);
});

function appFixture(saved) {
  const elements = new Map();
  const fixture = canvasFixture();
  elements.set("boardCanvas", fixture.canvas);
  const storage = new Map([["go-recorder-mvp-v1", JSON.stringify(saved)]]);
  const downloads = [];
  const readers = [];
  const context = vm.createContext({
    Blob, Date,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {
          value: "", textContent: "", disabled: false, hidden: false, listeners: {}, attributes: {},
          classList: { toggle() {}, remove() {} },
          setAttribute(key, value) { this.attributes[key] = value; },
          addEventListener(event, handler) { this.listeners[event] = handler; },
          click() { if (!this.disabled) this.listeners.click?.(); },
        });
        return elements.get(id);
      },
      createElement: () => ({ click() {} }),
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    URL: { createObjectURL(blob) { downloads.push(blob); return "blob:trial-test"; }, revokeObjectURL() {} },
    FileReader: class {
      constructor() { readers.push(this); }
      readAsText() {}
    },
    setTimeout: () => 1, clearTimeout() {},
    window: { addEventListener() {}, prompt: () => "正式棋谱", confirm: () => true },
  });
  load(context, ["game.js", "sgf.js", "board.js"]);
  let game;
  const GoGame = context.window.GoGame;
  context.window.GoGame = class extends GoGame { constructor(size) { super(size); game = this; } };
  load(context, ["app.js"]);
  return {
    game, storage, downloads, readers,
    el: (id) => elements.get(id),
    click: (id) => elements.get(id).click(),
    place(x, y) {
      fixture.canvas.listeners.click({ clientX: 44 + x * (672 / 18), clientY: 44 + y * (672 / 18) });
    },
    numbers: fixture.numbers,
  };
}

test("real application locks navigation/comments, renders trial status and exports/saves only formal data", async () => {
  const { game, SGF } = formalRecord(100);
  game.goToMove(40);
  game.setCommentForCurrentMove("正式第40手备注");
  const saved = plain(game.toSerializable());
  const app = appFixture(saved);
  app.click("trialBtn");
  assert.equal(app.el("trialBtn").textContent, "结束试下");
  assert.equal(app.el("trialBtn").attributes["aria-pressed"], "true");
  assert.equal(app.el("trialInfo").hidden, false);
  for (const id of ["firstBtn", "prevBtn", "nextBtn", "lastBtn", "newGameBtn", "importBtn", "importFile", "commentInput", "undoBtn", "redoBtn"]) {
    assert.equal(app.el(id).disabled, true, id);
  }
  for (let x = 2; x < 7; x += 1) app.place(x, 16);
  assert.equal(app.el("trialInfo").textContent, "试下中 · 从第40手开始 · 当前试下第5手");
  assert.equal(app.el("moveInfo").textContent, "第 40 手 / 共 100 手");
  assert.equal(app.numbers().length, 5);
  app.click("nextBtn");
  assert.equal(app.game.currentMove, 40);
  app.click("undoBtn");
  assert.equal(app.game.trialCurrentMove, 4);
  assert.equal(app.el("redoBtn").disabled, false);
  assert.equal(app.numbers().length, 4);
  app.click("redoBtn");
  assert.equal(app.game.trialCurrentMove, 5);
  app.el("commentInput").value = "不应该保存";
  app.el("commentInput").listeners.input();
  assert.deepEqual(JSON.parse(app.storage.get("go-recorder-mvp-v1")), saved);
  app.click("exportBtn");
  assert.equal(await app.downloads[0].text(), SGF.exportSgf(game));
  const refreshed = appFixture(JSON.parse(app.storage.get("go-recorder-mvp-v1")));
  assert.equal(refreshed.game.isTrialMode, false);
  assert.equal(refreshed.game.currentMove, 40);
  assert.deepEqual(plain(refreshed.game.getBoard()), plain(game.getBoard()));
  app.click("trialBtn");
  assert.equal(app.el("trialBtn").textContent, "开始试下");
  assert.equal(app.el("trialInfo").hidden, true);
  assert.equal(app.el("commentInput").disabled, false);
  assert.equal(app.el("commentInput").value, "正式第40手备注");
  assert.equal(app.el("nextBtn").disabled, false);
  assert.equal(app.numbers().length, 0);
  assert.deepEqual(plain(app.game.getBoard()), plain(game.getBoard()));
  app.click("nextBtn");
  assert.equal(app.game.currentMove, 41);
});

test("an SGF file read finishing during trial cannot replace the formal record", () => {
  const { game } = formalRecord(20);
  const saved = plain(game.toSerializable());
  const app = appFixture(saved);
  app.el("importFile").files = [{}];
  app.el("importFile").listeners.change();
  assert.equal(app.readers.length, 1);
  app.click("trialBtn");
  app.place(2, 16);
  app.readers[0].result = "(;GM[1]FF[4]SZ[19];B[aa])";
  app.readers[0].onload();
  assert.equal(app.game.isTrialMode, true);
  assert.equal(app.game.trialCurrentMove, 1);
  assert.deepEqual(plain(app.game.toSerializable()), saved);
});

test("empty-board trials and repeated start/end calls keep the trial boundary intact", () => {
  const { game } = model();
  game.endTrial();
  game.startTrial();
  play(game, 3, 3);
  game.startTrial();
  assert.equal(game.trialCurrentMove, 1);
  game.undo();
  game.undo();
  assert.equal(game.trialCurrentMove, 0);
  assert.equal(game.getLastMove(), null);
  game.endTrial();
  game.endTrial();
  assert.equal(game.currentMove, 0);
  assert.equal(game.getMoveCount(), 0);
  assert.equal(game.getBoard()[3][3], null);
});
