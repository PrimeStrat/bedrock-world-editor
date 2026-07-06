const FUNCTIONS = {
    abs: Math.abs,
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    exp: Math.exp,
    log: Math.log,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    random: Math.random
};

const CONSTANTS = {
    pi: Math.PI,
    e: Math.E
};

/**
 * @typedef {function(number, number, number): number} Evaluator
 * @typedef {{ok: boolean, evaluate: Evaluator|null, message: string}} CompiledExpression
 */

/**
 * Splits an expression into number, identifier, and operator tokens.
 * @param {string} text The expression text.
 * @returns {string[]|null} The tokens, or null on an invalid character.
 */
function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === " " || ch === "\t") {
            i += 1;
            continue;
        }
        if (ch >= "0" && ch <= "9" || ch === ".") {
            let num = "";
            while (i < text.length && (text[i] >= "0" && text[i] <= "9" || text[i] === ".")) {
                num += text[i];
                i += 1;
            }
            tokens.push(num);
            continue;
        }
        if (/[a-z_]/i.test(ch)) {
            let name = "";
            while (i < text.length && /[a-z0-9_]/i.test(text[i])) {
                name += text[i];
                i += 1;
            }
            tokens.push(name.toLowerCase());
            continue;
        }
        const two = text.slice(i, i + 2);
        if (two === "&&" || two === "||" || two === "<=" || two === ">=" || two === "==" || two === "!=") {
            tokens.push(two);
            i += 2;
            continue;
        }
        if ("+-*/%^(),<>!".includes(ch)) {
            tokens.push(ch);
            i += 1;
            continue;
        }
        return null;
    }
    return tokens;
}

/**
 * Parses a primary: a number, x/y/z, a constant, a function call, or a
 * parenthesized expression.
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parsePrimary(tokens, cursor) {
    const token = tokens[cursor.i];
    if (token === undefined) {
        return null;
    }
    if (token === "(") {
        cursor.i += 1;
        const inner = parseOr(tokens, cursor);
        if (!inner || tokens[cursor.i] !== ")") {
            return null;
        }
        cursor.i += 1;
        return inner;
    }
    if (token >= "0" && token <= "9" || token[0] === "." || (token[0] >= "0" && token[0] <= "9")) {
        const value = Number(token);
        if (Number.isNaN(value)) {
            return null;
        }
        cursor.i += 1;
        return () => value;
    }
    if (token === "x") {
        cursor.i += 1;
        return (x) => x;
    }
    if (token === "y") {
        cursor.i += 1;
        return (x, y) => y;
    }
    if (token === "z") {
        cursor.i += 1;
        return (x, y, z) => z;
    }
    if (token in CONSTANTS) {
        const value = CONSTANTS[token];
        cursor.i += 1;
        return () => value;
    }
    if (token in FUNCTIONS) {
        const fn = FUNCTIONS[token];
        cursor.i += 1;
        if (tokens[cursor.i] !== "(") {
            return null;
        }
        cursor.i += 1;
        const args = [];
        if (tokens[cursor.i] !== ")") {
            const first = parseOr(tokens, cursor);
            if (!first) {
                return null;
            }
            args.push(first);
            while (tokens[cursor.i] === ",") {
                cursor.i += 1;
                const next = parseOr(tokens, cursor);
                if (!next) {
                    return null;
                }
                args.push(next);
            }
        }
        if (tokens[cursor.i] !== ")") {
            return null;
        }
        cursor.i += 1;
        return (x, y, z) => fn(...args.map((arg) => arg(x, y, z)));
    }
    return null;
}

/**
 * Parses a power expression (right associative).
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parsePower(tokens, cursor) {
    const base = parsePrimary(tokens, cursor);
    if (!base || tokens[cursor.i] !== "^") {
        return base;
    }
    cursor.i += 1;
    const exponent = parseUnary(tokens, cursor);
    if (!exponent) {
        return null;
    }
    return (x, y, z) => Math.pow(base(x, y, z), exponent(x, y, z));
}

/**
 * Parses a unary negation or logical not.
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parseUnary(tokens, cursor) {
    const token = tokens[cursor.i];
    if (token === "-") {
        cursor.i += 1;
        const operand = parseUnary(tokens, cursor);
        return operand ? (x, y, z) => -operand(x, y, z) : null;
    }
    if (token === "!") {
        cursor.i += 1;
        const operand = parseUnary(tokens, cursor);
        return operand ? (x, y, z) => (operand(x, y, z) === 0 ? 1 : 0) : null;
    }
    return parsePower(tokens, cursor);
}

/**
 * Parses multiplication, division, and modulo.
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parseMultiplicative(tokens, cursor) {
    let left = parseUnary(tokens, cursor);
    while (left && (tokens[cursor.i] === "*" || tokens[cursor.i] === "/" || tokens[cursor.i] === "%")) {
        const op = tokens[cursor.i];
        cursor.i += 1;
        const right = parseUnary(tokens, cursor);
        if (!right) {
            return null;
        }
        const l = left;
        if (op === "*") {
            left = (x, y, z) => l(x, y, z) * right(x, y, z);
        } else if (op === "/") {
            left = (x, y, z) => l(x, y, z) / right(x, y, z);
        } else {
            left = (x, y, z) => l(x, y, z) % right(x, y, z);
        }
    }
    return left;
}

/**
 * Parses addition and subtraction.
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parseAdditive(tokens, cursor) {
    let left = parseMultiplicative(tokens, cursor);
    while (left && (tokens[cursor.i] === "+" || tokens[cursor.i] === "-")) {
        const op = tokens[cursor.i];
        cursor.i += 1;
        const right = parseMultiplicative(tokens, cursor);
        if (!right) {
            return null;
        }
        const l = left;
        left = op === "+" ? (x, y, z) => l(x, y, z) + right(x, y, z) : (x, y, z) => l(x, y, z) - right(x, y, z);
    }
    return left;
}

/**
 * Parses comparisons and equality, yielding 1 or 0.
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parseComparison(tokens, cursor) {
    let left = parseAdditive(tokens, cursor);
    while (left && ["<", ">", "<=", ">=", "==", "!="].includes(tokens[cursor.i])) {
        const op = tokens[cursor.i];
        cursor.i += 1;
        const right = parseAdditive(tokens, cursor);
        if (!right) {
            return null;
        }
        const l = left;
        if (op === "<") {
            left = (x, y, z) => (l(x, y, z) < right(x, y, z) ? 1 : 0);
        } else if (op === ">") {
            left = (x, y, z) => (l(x, y, z) > right(x, y, z) ? 1 : 0);
        } else if (op === "<=") {
            left = (x, y, z) => (l(x, y, z) <= right(x, y, z) ? 1 : 0);
        } else if (op === ">=") {
            left = (x, y, z) => (l(x, y, z) >= right(x, y, z) ? 1 : 0);
        } else if (op === "==") {
            left = (x, y, z) => (l(x, y, z) === right(x, y, z) ? 1 : 0);
        } else {
            left = (x, y, z) => (l(x, y, z) !== right(x, y, z) ? 1 : 0);
        }
    }
    return left;
}

/**
 * Parses logical and.
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parseAnd(tokens, cursor) {
    let left = parseComparison(tokens, cursor);
    while (left && tokens[cursor.i] === "&&") {
        cursor.i += 1;
        const right = parseComparison(tokens, cursor);
        if (!right) {
            return null;
        }
        const l = left;
        left = (x, y, z) => (l(x, y, z) !== 0 && right(x, y, z) !== 0 ? 1 : 0);
    }
    return left;
}

/**
 * Parses logical or.
 * @param {string[]} tokens The token list.
 * @param {{i: number}} cursor The parse position.
 * @returns {Evaluator|null} The evaluator, or null on error.
 */
function parseOr(tokens, cursor) {
    let left = parseAnd(tokens, cursor);
    while (left && tokens[cursor.i] === "||") {
        cursor.i += 1;
        const right = parseAnd(tokens, cursor);
        if (!right) {
            return null;
        }
        const l = left;
        left = (x, y, z) => (l(x, y, z) !== 0 || right(x, y, z) !== 0 ? 1 : 0);
    }
    return left;
}

/**
 * Compiles a math expression over x, y, and z into an evaluator. Supports
 * numbers, pi and e, + - * / % ^, comparisons, && || !, and common math
 * functions.
 * @param {string} text The expression text.
 * @returns {CompiledExpression} The compiled expression or a failure.
 */
function compileExpression(text) {
    const tokens = tokenize(String(text));
    if (!tokens || tokens.length === 0) {
        return { ok: false, evaluate: null, message: "empty or invalid expression" };
    }
    const cursor = { i: 0 };
    const evaluate = parseOr(tokens, cursor);
    if (!evaluate || cursor.i !== tokens.length) {
        return { ok: false, evaluate: null, message: "syntax error near '" + (tokens[cursor.i] ?? "end") + "'" };
    }
    return { ok: true, evaluate, message: "" };
}

export { compileExpression };
