(function () {
  const STORAGE_KEY = "go-recorder-mvp-v1";

  const canvas = document.getElementById("boardCanvas");
  const moveInfo = document.getElementById("moveInfo");
  const turnInfo = document.getElementById("turnInfo");
  const trialInfo = document.getElementById("trialInfo");
  const trialBtn = document.getElementById("trialBtn");
  const commentInput = document.getElementById("commentInput");
  const messageEl = document.getElementById("message");

  const firstBtn = document.getElementById("firstBtn");
  const lastBtn = document.getElementById("lastBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const newGameBtn = document.getElementById("newGameBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const exportBtn = document.getElementById("exportBtn");

  const game = new window.GoGame(19);
  const boardView = new window.BoardView(canvas, 19, handleBoardClick);
  let messageTimer = null;

  function showMessage(text, isError) {
    messageEl.textContent = text || "";
    messageEl.classList.toggle("error", Boolean(isError));

    if (messageTimer) {
      clearTimeout(messageTimer);
      messageTimer = null;
    }
    if (text) {
      messageTimer = setTimeout(() => {
        messageEl.textContent = "";
        messageEl.classList.remove("error");
      }, 2800);
    }
  }

  function saveToLocal() {
    try {
      const payload = JSON.stringify(game.toSerializable());
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (error) {
      showMessage(`本地保存失败：${error.message}`, true);
    }
  }

  function loadFromLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const data = JSON.parse(raw);
      game.loadFromSerializable(data);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
      showMessage("检测到损坏存档，已重置棋局", true);
    }
  }

  function render() {
    boardView.render(game.getBoard(), game.getLastMove(), game.getCurrentColor(), game.getActiveTrialMoves());

    moveInfo.textContent = `第 ${game.currentMove} 手 / 共 ${game.getMoveCount()} 手`;
    turnInfo.textContent = `当前轮到：${game.getCurrentColor() === "B" ? "黑" : "白"}`;
    const inTrial = game.isTrialMode;
    trialBtn.textContent = inTrial ? "结束试下" : "开始试下";
    trialBtn.setAttribute("aria-pressed", String(inTrial));
    trialInfo.hidden = !inTrial;
    trialInfo.textContent = inTrial
      ? `试下中 · 从第${game.trialStartMove}手开始 · 当前试下第${game.trialCurrentMove}手`
      : "";

    if (game.currentMove === 0) {
      commentInput.disabled = true;
      commentInput.value = "";
      commentInput.placeholder = "从第 1 手开始记录备注";
    } else {
      commentInput.disabled = false;
      commentInput.placeholder = "请输入当前手的复盘备注";
      commentInput.value = game.moves[game.currentMove - 1].comment || "";
    }
    if (inTrial) {
      commentInput.disabled = true;
    }

    const atStart = game.currentMove === 0;
    const atEnd = game.currentMove === game.getMoveCount();
    firstBtn.disabled = inTrial || atStart;
    prevBtn.disabled = inTrial || atStart;
    undoBtn.disabled = inTrial ? game.trialCurrentMove === 0 : atStart;
    nextBtn.disabled = inTrial || atEnd;
    redoBtn.disabled = inTrial ? game.trialCurrentMove === game.trialMoves.length : atEnd;
    lastBtn.disabled = inTrial || atEnd;
    newGameBtn.disabled = inTrial;
    importBtn.disabled = inTrial;
    importFile.disabled = inTrial;
  }

  function mutateAndRefresh(mutator) {
    mutator();
    saveToLocal();
    render();
  }

  function handleBoardClick(x, y) {
    const result = game.playMove(x, y);
    if (!result.ok) {
      showMessage(result.error, true);
      return;
    }
    saveToLocal();
    render();
  }

  function downloadTextFile(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  firstBtn.addEventListener("click", () => mutateAndRefresh(() => game.goFirst()));
  trialBtn.addEventListener("click", () => mutateAndRefresh(() => {
    if (game.isTrialMode) {
      game.endTrial();
    } else {
      game.startTrial();
    }
  }));
  lastBtn.addEventListener("click", () => mutateAndRefresh(() => game.goLast()));
  prevBtn.addEventListener("click", () => mutateAndRefresh(() => game.prev()));
  nextBtn.addEventListener("click", () => mutateAndRefresh(() => game.next()));
  undoBtn.addEventListener("click", () => mutateAndRefresh(() => game.undo()));
  redoBtn.addEventListener("click", () => mutateAndRefresh(() => game.redo()));

  newGameBtn.addEventListener("click", () => {
    if (game.isTrialMode) {
      return;
    }
    const confirmed = window.confirm("确定新建棋局吗？当前棋谱将被清空。");
    if (!confirmed) {
      return;
    }
    mutateAndRefresh(() => game.reset());
    showMessage("已新建棋局");
  });

  commentInput.addEventListener("input", () => {
    game.setCommentForCurrentMove(commentInput.value);
    saveToLocal();
  });

  importBtn.addEventListener("click", () => {
    if (!game.isTrialMode) {
      importFile.click();
    }
  });
  importFile.addEventListener("change", () => {
    if (game.isTrialMode) {
      importFile.value = "";
      return;
    }
    const file = importFile.files && importFile.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // A file read may finish after the user has started a trial.
      if (game.isTrialMode) {
        importFile.value = "";
        showMessage("请先结束试下再导入 SGF", true);
        return;
      }
      try {
        const parsed = window.SGF.parseSgf(String(reader.result || ""));
        if (parsed.boardSize !== 19) {
          throw new Error("当前 MVP 仅支持 19 路棋盘（SZ[19]）");
        }
        game.importMoves(parsed.moves, parsed.moves.length);
        saveToLocal();
        render();
        showMessage(`导入成功：共 ${parsed.moves.length} 手`);
      } catch (error) {
        showMessage(`导入失败：${error.message}`, true);
      } finally {
        importFile.value = "";
      }
    };
    reader.onerror = () => {
      showMessage("读取文件失败", true);
      importFile.value = "";
    };
    reader.readAsText(file, "UTF-8");
  });

  exportBtn.addEventListener("click", () => {
    const stamp = new Date().toISOString().replace(/[.:]/g, "-");
    let suggestedName = `go-record-${stamp}.sgf`;
    let promptText = "请输入导出文件名（可省略 .sgf 扩展名）：";

    while (true) {
      const input = window.prompt(promptText, suggestedName);
      if (input === null) {
        return;
      }

      const name = input.trim().replace(/\.sgf$/i, "");
      let error = "";
      if (!name) {
        error = "文件名不能为空。";
      } else if (/[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name)) {
        error = "文件名不能包含 < > : \" / \\ | ? * 或控制字符，也不能以空格或句点结尾。";
      } else if (/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)) {
        error = "请勿使用 Windows 保留名称（如 CON、NUL、COM1）。";
      }

      if (error) {
        suggestedName = input;
        promptText = `${error}\n请输入导出文件名（可省略 .sgf 扩展名）：`;
        continue;
      }

      const filename = `${name}.sgf`;
      const sgf = window.SGF.exportSgf(game);
      downloadTextFile(sgf, filename, "application/x-go-sgf;charset=utf-8");
      showMessage(`SGF 已导出：${filename}`);
      return;
    }
  });

  loadFromLocal();
  render();
})();
