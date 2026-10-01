(function () {
  const SGF_LETTERS = "abcdefghijklmnopqrstuvwxyz";

  function pointToSgfCoord(x, y) {
    return `${SGF_LETTERS[x]}${SGF_LETTERS[y]}`;
  }

  function sgfCoordToPoint(coord) {
    if (coord == null || coord === "") {
      return { pass: true, x: null, y: null };
    }
    const value = String(coord).toLowerCase();
    if (value.length < 2) {
      return null;
    }
    const x = SGF_LETTERS.indexOf(value[0]);
    const y = SGF_LETTERS.indexOf(value[1]);
    if (x < 0 || y < 0 || x >= 19 || y >= 19) {
      return null;
    }
    return { pass: false, x, y };
  }

  function escapeSgfValue(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\]/g, "\\]");
  }

  function exportSgf(game) {
    const lines = [`(;GM[1]FF[4]SZ[${game.boardSize}]`];
    for (const move of game.moves) {
      const coord = move.pass ? "" : pointToSgfCoord(move.x, move.y);
      let node = `;${move.color}[${coord}]`;
      if (move.comment && move.comment.length > 0) {
        node += `C[${escapeSgfValue(move.comment)}]`;
      }
      lines.push(node);
    }
    lines.push(")");
    return lines.join("\n");
  }

  function parseSgf(sgfText) {
    if (typeof sgfText !== "string" || sgfText.trim().length === 0) {
      throw new Error("SGF 内容为空");
    }

    const sgf = sgfText.replace(/^\uFEFF/, "");
    let index = 0;

    function skipWhitespace() {
      while (index < sgf.length && /\s/.test(sgf[index])) {
        index += 1;
      }
    }

    function parsePropertyValue() {
      if (sgf[index] !== "[") {
        return "";
      }
      index += 1;
      let value = "";

      while (index < sgf.length) {
        const ch = sgf[index];
        if (ch === "\\") {
          index += 1;
          if (index < sgf.length) {
            value += sgf[index];
            index += 1;
          }
        } else if (ch === "]") {
          index += 1;
          break;
        } else {
          value += ch;
          index += 1;
        }
      }

      return value;
    }

    function parseNode() {
      if (sgf[index] !== ";") {
        throw new Error("SGF 节点格式错误");
      }
      index += 1;

      const node = {};
      while (index < sgf.length) {
        skipWhitespace();
        const ch = sgf[index];
        if (!ch || ch === ";" || ch === "(" || ch === ")") {
          break;
        }

        let name = "";
        while (index < sgf.length && /[A-Za-z]/.test(sgf[index])) {
          name += sgf[index];
          index += 1;
        }

        if (!name) {
          index += 1;
          continue;
        }

        skipWhitespace();
        const values = [];
        while (sgf[index] === "[") {
          values.push(parsePropertyValue());
          skipWhitespace();
        }

        if (values.length > 0) {
          node[name] = values;
        }
      }

      return node;
    }

    function parseGameTree() {
      skipWhitespace();
      if (sgf[index] !== "(") {
        throw new Error("SGF 缺少 '('");
      }
      index += 1;

      const sequence = [];
      const variations = [];

      while (index < sgf.length) {
        skipWhitespace();
        const ch = sgf[index];
        if (!ch) {
          break;
        }
        if (ch === ";") {
          sequence.push(parseNode());
        } else if (ch === "(") {
          variations.push(parseGameTree());
        } else if (ch === ")") {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }

      return { sequence, variations };
    }

    const tree = parseGameTree();
    const mainLine = [...tree.sequence];
    let branch = tree;
    while (branch.variations && branch.variations.length > 0) {
      branch = branch.variations[0];
      mainLine.push(...branch.sequence);
    }

    if (mainLine.length === 0) {
      throw new Error("SGF 中没有可读取的节点");
    }

    const root = mainLine[0] || {};
    const size = root.SZ && root.SZ[0] ? parseInt(root.SZ[0], 10) : 19;
    const boardSize = Number.isInteger(size) ? size : 19;

    const moves = [];
    let lastMove = null;
    for (let i = 1; i < mainLine.length; i += 1) {
      const node = mainLine[i];
      const comment = node.C && node.C[0] ? node.C[0] : "";

      let color = null;
      let coord = null;
      if (node.B && node.B.length > 0) {
        color = "B";
        coord = node.B[0];
      } else if (node.W && node.W.length > 0) {
        color = "W";
        coord = node.W[0];
      }

      if (!color) {
        if (comment && lastMove) {
          lastMove.comment = lastMove.comment ? `${lastMove.comment}\n${comment}` : comment;
        }
        continue;
      }

      const point = sgfCoordToPoint(coord || "");
      if (!point) {
        throw new Error(`SGF 坐标非法：${coord}`);
      }

      const move = {
        color,
        pass: point.pass,
        x: point.x,
        y: point.y,
        comment,
      };
      moves.push(move);
      lastMove = move;
    }

    return {
      boardSize,
      moves,
    };
  }

  window.SGF = {
    exportSgf,
    parseSgf,
  };
})();
