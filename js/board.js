(function () {
  class BoardView {
    constructor(canvas, boardSize, onIntersectionClick) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.boardSize = boardSize || 19;
      this.onIntersectionClick = onIntersectionClick;
      this.padding = 30;
      this.gridColor = "#2a2212";

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

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        const cell = this.getCellSize();
        const ix = Math.round((x - this.padding) / cell);
        const iy = Math.round((y - this.padding) / cell);

        if (ix < 0 || iy < 0 || ix >= this.boardSize || iy >= this.boardSize) {
          return;
        }

        const cx = this.padding + ix * cell;
        const cy = this.padding + iy * cell;
        const distance = Math.hypot(x - cx, y - cy);
        if (distance > cell * 0.45) {
          return;
        }

        this.onIntersectionClick(ix, iy);
      });
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

    render(board, lastMove) {
      this.drawBoardBase();
      for (let y = 0; y < this.boardSize; y += 1) {
        for (let x = 0; x < this.boardSize; x += 1) {
          const color = board[y][x];
          if (color) {
            this.drawStone(x, y, color);
          }
        }
      }
      this.drawLastMoveMarker(lastMove);
    }
  }

  window.BoardView = BoardView;
})();
