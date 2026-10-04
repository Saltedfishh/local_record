(function () {
  class GoGame {
    constructor(boardSize) {
      this.boardSize = boardSize || 19;
      this.reset();
    }

    reset() {
      this.moves = [];
      this.currentMove = 0;
      this.snapshots = [this.createEmptyBoard()];
      this.clearTrialState();
    }

    clearTrialState() {
      this.isTrialMode = false;
      this.trialStartMove = null;
      this.trialMoves = [];
      this.trialSnapshots = [];
      this.trialCurrentMove = 0;
    }

    startTrial() {
      if (this.isTrialMode) {
        return;
      }
      this.trialStartMove = this.currentMove;
      this.trialMoves = [];
      // Rules always clone their input; the formal snapshots remain untouched.
      this.trialSnapshots = [this.cloneBoard(this.getBoard())];
      this.trialCurrentMove = 0;
      this.isTrialMode = true;
    }

    endTrial() {
      if (!this.isTrialMode) {
        return;
      }
      this.currentMove = this.trialStartMove;
      // getBoard() now returns the complete, unchanged formal snapshot,
      // including any formal stones captured during the trial.
      this.clearTrialState();
    }

    getActiveTrialMoves() {
      return this.isTrialMode ? this.trialMoves.slice(0, this.trialCurrentMove) : [];
    }

    createEmptyBoard() {
      return Array.from({ length: this.boardSize }, () => Array(this.boardSize).fill(null));
    }

    cloneBoard(board) {
      return board.map((row) => row.slice());
    }

    boardsEqual(boardA, boardB) {
      for (let y = 0; y < this.boardSize; y += 1) {
        for (let x = 0; x < this.boardSize; x += 1) {
          if (boardA[y][x] !== boardB[y][x]) {
            return false;
          }
        }
      }
      return true;
    }

    getBoard() {
      if (this.isTrialMode) {
        return this.trialSnapshots[this.trialCurrentMove];
      }
      return this.snapshots[this.currentMove];
    }

    getMoveCount() {
      return this.moves.length;
    }

    getCurrentColor() {
      const moveNumber = this.currentMove + (this.isTrialMode ? this.trialCurrentMove : 0);
      return moveNumber % 2 === 0 ? "B" : "W";
    }

    getLastMove() {
      if (this.isTrialMode && this.trialCurrentMove > 0) {
        return this.trialMoves[this.trialCurrentMove - 1];
      }
      if (this.currentMove === 0) {
        return null;
      }
      return this.moves[this.currentMove - 1];
    }

    truncateFutureIfNeeded() {
      if (this.isTrialMode) {
        return;
      }
      if (this.currentMove < this.moves.length) {
        this.moves = this.moves.slice(0, this.currentMove);
        this.snapshots = this.snapshots.slice(0, this.currentMove + 1);
      }
    }

    neighbors(x, y) {
      const points = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      return points.filter(([px, py]) => px >= 0 && py >= 0 && px < this.boardSize && py < this.boardSize);
    }

    collectGroup(board, startX, startY, color, visited) {
      const keyOf = (x, y) => `${x},${y}`;
      const stack = [[startX, startY]];
      const group = [];

      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = keyOf(x, y);
        if (visited.has(key)) {
          continue;
        }
        visited.add(key);

        if (board[y][x] !== color) {
          continue;
        }

        group.push([x, y]);
        for (const [nx, ny] of this.neighbors(x, y)) {
          const nKey = keyOf(nx, ny);
          if (!visited.has(nKey) && board[ny][nx] === color) {
            stack.push([nx, ny]);
          }
        }
      }

      return group;
    }

    countLiberties(board, group) {
      const liberties = new Set();
      for (const [x, y] of group) {
        for (const [nx, ny] of this.neighbors(x, y)) {
          if (!board[ny][nx]) {
            liberties.add(`${nx},${ny}`);
          }
        }
      }
      return liberties.size;
    }

    removeGroup(board, group) {
      for (const [x, y] of group) {
        board[y][x] = null;
      }
    }

    isKoViolation(nextBoard) {
      if (this.isTrialMode && this.trialCurrentMove > 0) {
        return this.boardsEqual(nextBoard, this.trialSnapshots[this.trialCurrentMove - 1]);
      }
      // The first trial move must also respect a ko in the formal history.
      if (this.currentMove < 1) {
        return false;
      }
      const previousBoard = this.snapshots[this.currentMove - 1];
      return this.boardsEqual(nextBoard, previousBoard);
    }

    applyMoveToBoard(baseBoard, move) {
      const board = this.cloneBoard(baseBoard);

      if (move.pass) {
        return { ok: true, board };
      }

      const { x, y, color } = move;
      if (x == null || y == null || x < 0 || y < 0 || x >= this.boardSize || y >= this.boardSize) {
        return { ok: false, error: "落子坐标越界" };
      }
      if (board[y][x]) {
        return { ok: false, error: "该交叉点已有棋子" };
      }

      board[y][x] = color;
      const opponent = color === "B" ? "W" : "B";

      for (const [nx, ny] of this.neighbors(x, y)) {
        if (board[ny][nx] !== opponent) {
          continue;
        }
        const group = this.collectGroup(board, nx, ny, opponent, new Set());
        if (this.countLiberties(board, group) === 0) {
          this.removeGroup(board, group);
        }
      }

      const ownGroup = this.collectGroup(board, x, y, color, new Set());
      if (this.countLiberties(board, ownGroup) === 0) {
        return { ok: false, error: "不允许自杀棋" };
      }

      return { ok: true, board };
    }

    playMove(x, y) {
      const move = {
        number: (this.isTrialMode ? this.trialCurrentMove : this.currentMove) + 1,
        color: this.getCurrentColor(),
        x,
        y,
        pass: false,
        comment: "",
      };

      const result = this.applyMoveToBoard(this.getBoard(), move);
      if (!result.ok) {
        return result;
      }
      if (this.isKoViolation(result.board)) {
        return { ok: false, error: "打劫：不能立即还原到上一盘面" };
      }

      if (this.isTrialMode) {
        this.trialMoves = this.trialMoves.slice(0, this.trialCurrentMove);
        this.trialSnapshots = this.trialSnapshots.slice(0, this.trialCurrentMove + 1);
        this.trialMoves.push(move);
        this.trialSnapshots.push(result.board);
        this.trialCurrentMove = this.trialMoves.length;
      } else {
        this.truncateFutureIfNeeded();
        this.moves.push(move);
        this.snapshots.push(result.board);
        this.currentMove = this.moves.length;
      }
      return { ok: true };
    }

    setCommentForCurrentMove(comment) {
      if (this.isTrialMode || this.currentMove === 0) {
        return;
      }
      this.moves[this.currentMove - 1].comment = comment || "";
    }

    goToMove(moveNumber) {
      if (this.isTrialMode) {
        return;
      }
      this.currentMove = Math.max(0, Math.min(moveNumber, this.moves.length));
    }

    goFirst() {
      this.goToMove(0);
    }

    goLast() {
      this.goToMove(this.moves.length);
    }

    prev() {
      this.goToMove(this.currentMove - 1);
    }

    next() {
      this.goToMove(this.currentMove + 1);
    }

    undo() {
      if (this.isTrialMode) {
        this.trialCurrentMove = Math.max(0, this.trialCurrentMove - 1);
        return;
      }
      this.prev();
    }

    redo() {
      if (this.isTrialMode) {
        this.trialCurrentMove = Math.min(this.trialMoves.length, this.trialCurrentMove + 1);
        return;
      }
      this.next();
    }

    importMoves(moves, currentMove) {
      this.reset();

      const importedMoves = Array.isArray(moves) ? moves : [];
      for (let i = 0; i < importedMoves.length; i += 1) {
        const source = importedMoves[i] || {};
        const move = {
          number: i + 1,
          color: source.color === "W" ? "W" : "B",
          pass: Boolean(source.pass || source.x == null || source.y == null),
          x: source.x == null ? null : Number(source.x),
          y: source.y == null ? null : Number(source.y),
          comment: typeof source.comment === "string" ? source.comment : "",
        };

        const result = this.applyMoveToBoard(this.getBoard(), move);
        if (!result.ok) {
          throw new Error(`导入失败：第 ${i + 1} 手非法（${result.error}）`);
        }
        if (this.isKoViolation(result.board)) {
          throw new Error(`导入失败：第 ${i + 1} 手违反打劫规则`);
        }

        this.moves.push(move);
        this.snapshots.push(result.board);
        this.currentMove = this.moves.length;
      }

      if (typeof currentMove === "number") {
        this.goToMove(currentMove);
      }
    }

    toSerializable() {
      return {
        version: 1,
        boardSize: this.boardSize,
        currentMove: this.currentMove,
        moves: this.moves.map((move) => ({
          number: move.number,
          color: move.color,
          x: move.x,
          y: move.y,
          pass: move.pass,
          comment: move.comment || "",
        })),
      };
    }

    loadFromSerializable(data) {
      if (!data || data.boardSize !== this.boardSize || !Array.isArray(data.moves)) {
        throw new Error("存档格式不正确");
      }
      this.importMoves(data.moves, data.currentMove);
    }
  }

  window.GoGame = GoGame;
})();
