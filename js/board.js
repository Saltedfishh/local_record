(function () {
  class BoardView {
    constructor(canvas, boardSize, onIntersectionClick) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.boardSize = boardSize || 19;
      this.onIntersectionClick = onIntersectionClick;
      this.padding = 44;
      this.gridColor = "#2a2212";
      this.hoverIntersection = null;
      this.board = null;
      this.lastMove = null;
      this.currentColor = "B";
      this.trialMoves = [];

      this.bindEvents();
    }

    getCellSize() {
      return (this.canvas.width - this.padding * 2) / (this.boardSize - 1);
    }

    bindEvents() {
      this.canvas.addEventListener("click", (event) => {
        if (typeof this.onIntersectionClick !== "function") {
          return;
        }

        const intersection = this.getIntersection(event);
        if (intersection) {
          this.onIntersectionClick(intersection.x, intersection.y);
        }
      });

      this.canvas.addEventListener("mousemove", (event) => {
        this.setHoverIntersection(this.getIntersection(event));
      });
      this.canvas.addEventListener("mouseleave", () => this.setHoverIntersection(null));
      window.addEventListener("blur", () => this.setHoverIntersection(null));
    }

    getIntersection(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
      const cell = this.getCellSize();
      const ix = Math.round((x - this.padding) / cell);
      const iy = Math.round((y - this.padding) / cell);

      if (ix < 0 || iy < 0 || ix >= this.boardSize || iy >= this.boardSize) {
        return null;
      }

      const cx = this.padding + ix * cell;
      const cy = this.padding + iy * cell;
      if (Math.hypot(x - cx, y - cy) > cell * 0.45) {
        return null;
      }
      return { x: ix, y: iy };
    }

    setHoverIntersection(intersection) {
      if (this.hoverIntersection?.x === intersection?.x &&
          this.hoverIntersection?.y === intersection?.y) {
        return;
      }
      this.hoverIntersection = intersection;
      if (this.board) {
        this.render(this.board, this.lastMove, this.currentColor, this.trialMoves);
      }
    }

    drawBoardBase() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "#deb768";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const cell = this.getCellSize();
      const start = this.padding;
      const end = this.canvas.width - this.padding;

      ctx.strokeStyle = this.gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < this.boardSize; i += 1) {
        const p = start + i * cell;
        ctx.beginPath();
        ctx.moveTo(start, p);
        ctx.lineTo(end, p);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p, start);
        ctx.lineTo(p, end);
        ctx.stroke();
      }

      this.drawStarPoints();
      this.drawCoordinates();
    }

    drawCoordinates() {
      const ctx = this.ctx;
      const cell = this.getCellSize();
      const letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
      const labelOffset = this.padding / 3;

      ctx.save();
      ctx.fillStyle = this.gridColor;
      ctx.font = '16px "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let i = 0; i < this.boardSize; i += 1) {
        const position = this.padding + i * cell;
        const row = String(this.boardSize - i);
        ctx.fillText(letters[i], position, labelOffset);
        ctx.fillText(letters[i], position, this.canvas.height - labelOffset);
        ctx.fillText(row, labelOffset, position);
        ctx.fillText(row, this.canvas.width - labelOffset, position);
      }

      ctx.restore();
    }

    drawStarPoints() {
      const points = [3, 9, 15];
      const cell = this.getCellSize();
      const radius = Math.max(3, cell * 0.1);
      const ctx = this.ctx;

      ctx.fillStyle = this.gridColor;
      for (const y of points) {
        for (const x of points) {
          const px = this.padding + x * cell;
          const py = this.padding + y * cell;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawStone(x, y, color) {
      const ctx = this.ctx;
      const cell = this.getCellSize();
      const px = this.padding + x * cell;
      const py = this.padding + y * cell;
      const radius = cell * 0.45;

      const gradient = ctx.createRadialGradient(
        px - radius * 0.25,
        py - radius * 0.25,
        radius * 0.2,
        px,
        py,
        radius
      );
      if (color === "B") {
        gradient.addColorStop(0, "#666");
        gradient.addColorStop(1, "#111");
      } else {
        gradient.addColorStop(0, "#fff");
        gradient.addColorStop(1, "#ddd");
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color === "B" ? "#000" : "#999";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    drawLastMoveMarker(lastMove) {
      if (!lastMove || lastMove.pass || lastMove.x == null || lastMove.y == null) {
        return;
      }

      const ctx = this.ctx;
      const cell = this.getCellSize();
      const px = this.padding + lastMove.x * cell;
      const py = this.padding + lastMove.y * cell;
      const radius = Math.max(3, cell * 0.11);

      ctx.fillStyle = lastMove.color === "B" ? "#ffed62" : "#e74c3c";
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    drawHoverPreview() {
      const point = this.hoverIntersection;
      if (!point || this.board[point.y][point.x]) {
        return;
      }

      const cell = this.getCellSize();
      const size = cell * 0.45;
      const px = this.padding + point.x * cell;
      const py = this.padding + point.y * cell;
      this.ctx.fillStyle = this.currentColor === "B" ? "#000" : "#fff";
      this.ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }

    drawTrialMoveNumbers() {
      // Keep only the latest move at each point, so captures and replays
      // never leave old labels on an empty point or a replacement stone.
      const stones = new Map();
      for (const move of this.trialMoves) {
        if (!move.pass) {
          stones.set(`${move.x},${move.y}`, move);
        }
      }
      const ctx = this.ctx;
      const cell = this.getCellSize();
      ctx.save();
      ctx.font = `bold ${Math.floor(cell * 0.46)}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const move of stones.values()) {
        if (this.board[move.y][move.x] !== move.color) {
          continue;
        }
        ctx.fillStyle = move.color === "B" ? "#fff" : "#111";
        ctx.fillText(String(move.number), this.padding + move.x * cell, this.padding + move.y * cell);
      }
      ctx.restore();
    }

    render(board, lastMove, currentColor, trialMoves) {
      this.board = board;
      this.lastMove = lastMove;
      this.currentColor = currentColor || "B";
      this.trialMoves = trialMoves || [];
      this.drawBoardBase();
      for (let y = 0; y < this.boardSize; y += 1) {
        for (let x = 0; x < this.boardSize; x += 1) {
          const color = board[y][x];
          if (color) {
            this.drawStone(x, y, color);
          }
        }
      }
      // A trial stone's number occupies the usual last-move marker position.
      if (this.trialMoves.length === 0) {
        this.drawLastMoveMarker(lastMove);
      }
      this.drawTrialMoveNumbers();
      this.drawHoverPreview();
    }
  }

  window.BoardView = BoardView;
})();
