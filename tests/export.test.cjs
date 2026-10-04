const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Load the real application and SGF codec; emulate only browser services.
function createApp(answers) {
  const elements = new Map();
  const prompts = [];
  const downloads = [];
  const blobs = [];
  const revoked = [];
  const timers = [];
  function element() {
    return {
      value: "", textContent: "", classList: { toggle() {}, remove() {} },
      listeners: {},
      addEventListener(event, handler) { this.listeners[event] = handler; },
      click() { this.listeners.click?.(); },
    };
  }
  const moves = [
    { color: "B", x: 3, y: 3, pass: false, comment: "复盘备注：右边 ] 和反斜杠 \\" },
    { color: "W", x: 15, y: 15, pass: false, comment: "第二手" },
  ];
  const storage = new Map([
    ["go-recorder-mvp-v1", JSON.stringify({ version: 1, boardSize: 19, moves, currentMove: 1 })],
  ]);
  const context = vm.createContext({
    Blob, Date,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement(tag) {
        assert.equal(tag, "a");
        return { click() { downloads.push({ filename: this.download, url: this.href }); } };
      },
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    URL: {
      createObjectURL(blob) { blobs.push(blob); return `blob:test-${blobs.length}`; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
  });
  context.window = {
    BoardView: class { render() {} },
    prompt(message, defaultValue) {
      prompts.push({ message, defaultValue });
      assert.ok(answers.length > 0, "Unexpected extra filename prompt");
      const answer = answers.shift();
      return answer === undefined ? defaultValue : answer;
    },
  };
  for (const file of ["game.js", "sgf.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context, { filename: file });
  }
  return {
    prompts, downloads, blobs, moves, revoked, storage,
    export: () => elements.get("exportBtn").click(),
    message: () => elements.get("message").textContent,
    parse: (sgf) => context.window.SGF.parseSgf(sgf),
    flushTimers: () => timers.forEach((callback) => callback()),
  };
}

for (const [input, expected] of [
  ["周末复盘", "周末复盘.sgf"],
  ["决赛 第 1 局.sgf", "决赛 第 1 局.sgf"],
  ["比赛.SGF", "比赛.sgf"],
  ["  我的棋谱  ", "我的棋谱.sgf"],
  ["review.v2", "review.v2.sgf"],
]) {
  test(`exports with filename ${JSON.stringify(input)}`, () => {
    const app = createApp([input]);
    app.export();
    assert.equal(app.downloads.length, 1);
    assert.equal(app.downloads[0].filename, expected);
    assert.equal(app.message(), `SGF 已导出：${expected}`);
  });
}

test("accepting the default preserves the timestamp filename", () => {
  const app = createApp([undefined]);
  app.export();
  assert.match(app.downloads[0].filename, /^go-record-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sgf$/);
  assert.equal(app.downloads[0].filename, app.prompts[0].defaultValue);
});

test("cancel creates no download or blob and leaves the saved record intact", () => {
  const app = createApp([null]);
  const before = [...app.storage];
  app.export();
  assert.equal(app.downloads.length, 0);
  assert.equal(app.blobs.length, 0);
  assert.deepEqual([...app.storage], before);
  assert.equal(app.message(), "");
});

for (const invalid of ["", "   ", ".sgf", "../棋谱", "a\\b", "a:b", "a?b", "a*b", 'a"b', "a<b", "a>b", "a|b", "a\u0000b", "棋谱.", "棋谱 .sgf", "CON", "nul.SGF", "COM1", "LPT9.txt", "COM¹"]) {
  test(`rejects ${JSON.stringify(invalid)} and allows correction`, () => {
    const app = createApp([invalid, "正确名称"]);
    app.export();
    assert.equal(app.prompts.length, 2);
    assert.equal(app.prompts[1].defaultValue, invalid);
    assert.match(app.prompts[1].message, /不能为空|不能包含|保留名称/);
    assert.equal(app.downloads.length, 1);
    assert.equal(app.downloads[0].filename, "正确名称.sgf");
  });
}

test("cancel after validation failure does not download", () => {
  const app = createApp(["CON", null]);
  app.export();
  assert.equal(app.downloads.length, 0);
  assert.equal(app.blobs.length, 0);
});

test("export preserves all moves and escaped Chinese comments, and releases the blob URL", async () => {
  const app = createApp(["内容验证"]);
  const before = [...app.storage];
  app.export();
  const blob = app.blobs[0];
  assert.equal(blob.type, "application/x-go-sgf;charset=utf-8");
  const parsed = app.parse(await blob.text());
  assert.equal(parsed.boardSize, 19);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.moves)), app.moves);
  assert.deepEqual([...app.storage], before);
  app.flushTimers();
  assert.deepEqual(app.revoked, [app.downloads[0].url]);
});
