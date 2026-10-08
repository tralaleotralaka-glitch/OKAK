"""Математический модуль: вычисления, проценты, корни, уравнения, производные и интегралы.

Безопасность: вычисления идут через ast-интерпретатор с белым списком функций.
Символьная часть (sympy) получает только токены из белого списка (см. _validate),
поэтому пользовательский ввод никогда не попадает в произвольный Python-код.
"""

from __future__ import annotations

import ast
import io
import math
import re
import tokenize

from .textutil import format_number, normalize

try:  # sympy нужен только для уравнений, производных и интегралов
    import sympy as sp
    from sympy.parsing.sympy_parser import (
        convert_xor,
        implicit_multiplication_application,
        parse_expr,
        standard_transformations,
    )

    _SYMPY_OK = True
except ImportError:  # pragma: no cover - зависит от окружения
    sp = None
    _SYMPY_OK = False

MAX_INPUT = 300
MAX_EXPONENT = 2000

_FUNCS = {
    "sqrt": math.sqrt,
    "cbrt": lambda x: math.copysign(abs(x) ** (1 / 3), x),
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "exp": math.exp,
    "ln": math.log,
    "lg": math.log10,
    "log": lambda x, base=10: math.log(x, base),
    "abs": abs,
    "factorial": lambda n: math.factorial(int(n)) if n == int(n) and 0 <= n <= 170 else _raise("Факториал определён для целых чисел от 0 до 170."),
    "round": lambda x, n=0: round(x, int(n)),
}
_CONSTS = {"pi": math.pi, "e": math.e}
_ALLOWED_NAMES = set(_FUNCS) | set(_CONSTS) | {"x", "y", "z", "t"}
_ALLOWED_OPS = {"+", "-", "*", "/", "^", "**", "(", ")", ",", "=", "."}


class MathError(ValueError):
    """Ошибка, которую можно показать пользователю как есть."""


def _raise(message: str):
    raise MathError(message)


# ---------------------------------------------------------------- предобработка

_PERCENT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:%|процент\w*)\s*от\s*(\d+(?:[.,]\d+)?)")
_WORD_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"кубическ\w*\s+корен\w*\s+из\s*(-?\d+(?:[.,]\d+)?)"), r"cbrt(\1)"),
    (re.compile(r"кубическ\w*\s+корен\w*\s+из\s*\(([^()]*)\)"), r"cbrt(\1)"),
    (re.compile(r"(?:квадратн\w*\s+)?корен\w*\s+из\s*\(([^()]*)\)"), r"sqrt(\1)"),
    (re.compile(r"(?:квадратн\w*\s+)?корен\w*\s+из\s*(-?\d+(?:[.,]\d+)?)"), r"sqrt(\1)"),
    (re.compile(r"натуральн\w*\s+логарифм\w*\s*(?:от\s*)?"), "ln"),
    (re.compile(r"логарифм\w*\s*(?:от\s*)?"), "log"),
    (re.compile(r"факториал\w*\s*(?:от\s*)?(\d+)"), r"factorial(\1)"),
    (re.compile(r"(\d+)\s*!"), r"factorial(\1)"),
    (re.compile(r"косинус\w*\s*"), "cos"),
    (re.compile(r"синус\w*\s*"), "sin"),
    (re.compile(r"тангенс\w*\s*"), "tan"),
    (re.compile(r"модул\w*\s*"), "abs"),
    (re.compile(r"число пи|\bпи\b"), "pi"),
    (re.compile(r"в квадрате"), "^2"),
    (re.compile(r"в кубе"), "^3"),
    (re.compile(r"(?:возвести в |в )?степен[ьи]|степень"), "^"),
    (re.compile(r"(?:по)?умнож\w*(?:\s+на)?"), "*"),
    (re.compile(r"(?:раз|по)?делит\w*(?:\s+на)?|(?:раз|по)?дел[иь]\w*\s+на"), "/"),
    (re.compile(r"\bплюс\b|\bприбав\w*\s*(?:на)?\s*"), "+"),
    (re.compile(r"\bминус\b|\bотним\w*\s*(?:на)?\s*|\bвычест\w*\s*(?:на)?\s*"), "-"),
    (re.compile(r"[×хx](?=\s*\d)|(?<=\d\s)[×хx](?=\s*[\d(])"), "*"),
    (re.compile(r"[×⋅·]"), "*"),
    (re.compile(r"÷"), "/"),
    (re.compile(r"[–—]"), "-"),
]

_COMMAND_RE = re.compile(
    r"(сколько будет|сколько равно|чему равн\w*|чему равен|посчита\w*|вычисл\w*|"
    r"реши\w*|найди\w*|помоги\w*|подскажи|пожалуйста|скажи|равно|равняется|"
    r"ответ|по-твоему)"
)
_TRIGGER_RE = re.compile(
    r"(сколько будет|сколько равно|чему равн|посчита|вычисл|реши|уравнени|производн|"
    r"интеграл|корен|квадратн|факториал|процент|степен|умнож|делит|делить|плюс|минус|"
    r"синус|косинус|тангенс|логарифм|модул|упрости|разложи|раскрой|sqrt|cbrt|factorial|"
    r"\bsin|\bcos|\btan|\blog|\bln\b|\blg\b|\bpi\b|=)"
)
_PURE_MATH_RE = re.compile(r"^[\d\s\+\-\*/\^\(\)\.,%=×÷x!]+$")
_CHUNK_RE = re.compile(r"[a-z0-9\.\(\)\s\+\-\*/\^%,!=]*\d[a-z0-9\.\(\)\s\+\-\*/\^%,!=]*")


def _preprocess(text: str) -> str:
    """Переводит русскую речь в математическую запись (только латиница и символы)."""
    text = normalize(text)
    text = re.sub(r"(\d),(\d)", r"\1.\2", text)
    for pattern, repl in _WORD_REPLACEMENTS:
        text = pattern.sub(repl, text)
    text = _COMMAND_RE.sub(" ", text)
    text = text.replace("?", " ").replace("!", "!")
    return re.sub(r"\s+", " ", text).strip()


def _best_chunk(text: str) -> str | None:
    """Выбирает самый длинный фрагмент, похожий на математическое выражение."""
    chunks = [c.strip() for c in _CHUNK_RE.findall(text)]
    chunks = [c.rstrip("=").strip() for c in chunks if c]
    chunks = [c for c in chunks if re.search(r"[\+\-\*/\^\(]|sqrt|cbrt|sin|cos|tan|log|ln|lg|factorial|pi|=", c) or c.isdigit()]
    if not chunks:
        return None
    return max(chunks, key=len)


# ---------------------------------------------------------------- безопасная проверка

def _validate(expr: str) -> None:
    """Пропускает только токены из белого списка. Бросает MathError при нарушении."""
    expr = expr.strip()
    if len(expr) > MAX_INPUT:
        raise MathError("Выражение слишком длинное.")
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(expr).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        raise MathError("Не удалось разобрать выражение.")
    for tok in toks:
        if tok.type == tokenize.NAME:
            if tok.string not in _ALLOWED_NAMES:
                raise MathError("Я не умею работать с этим словом в формуле.")
        elif tok.type == tokenize.NUMBER:
            continue
        elif tok.type == tokenize.OP:
            if tok.string not in _ALLOWED_OPS:
                raise MathError("В выражении есть недопустимый символ.")
        elif tok.type in (tokenize.NEWLINE, tokenize.ENDMARKER, tokenize.NL):
            continue
        else:
            raise MathError("В выражении есть недопустимый символ.")


# ---------------------------------------------------------------- численные вычисления

def _to_python_expr(expr: str) -> str:
    expr = expr.replace("^", "**").replace(",", ".")
    expr = re.sub(r"(\d|\))\s*(?=[\(a-z])", r"\1*", expr)  # 2(3) -> 2*(3), 2pi -> 2*pi
    expr = re.sub(r"\)\s*(?=\d)", ")*", expr)
    return expr


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in _CONSTS:
            return _CONSTS[node.id]
        raise MathError(f"Неизвестное имя: {node.id}")
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _eval_node(node.operand)
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp):
        left, right = _eval_node(node.left), _eval_node(node.right)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            if right == 0:
                raise MathError("На ноль делить нельзя.")
            return left / right
        if isinstance(node.op, ast.Pow):
            if isinstance(right, (int, float)) and abs(right) > MAX_EXPONENT:
                raise MathError("Слишком большая степень.")
            if left == 0 and right < 0:
                raise MathError("На ноль делить нельзя.")
            result = left ** right
            if isinstance(result, complex):
                raise MathError("Результат не является действительным числом.")
            return result
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS:
        args = [_eval_node(a) for a in node.args]
        try:
            return _FUNCS[node.func.id](*args)
        except (ValueError, OverflowError):
            raise MathError("Значение вне области определения функции.")
    raise MathError("Не удалось вычислить выражение.")


def evaluate(expr: str) -> float:
    """Вычисляет числовое выражение, например '2+2*3' или 'sqrt(16)'."""
    _validate(expr)
    py = _to_python_expr(expr)
    if re.search(r"[a-z]", re.sub(r"\b(sqrt|cbrt|sin|cos|tan|asin|acos|atan|exp|ln|lg|log|abs|factorial|round|pi)\b", "", py)):
        raise MathError("В выражении есть переменная — для такого нужно уравнение.")
    try:
        tree = ast.parse(py, mode="eval")
    except SyntaxError:
        raise MathError("Не удалось разобрать выражение.")
    return _eval_node(tree)


# ---------------------------------------------------------------- символьные вычисления

def _sympify(expr: str):
    if not _SYMPY_OK:
        raise MathError("Символьные вычисления недоступны: установите sympy.")
    _validate(expr)
    expr = expr.replace("^", "**").replace(",", ".")
    transformations = standard_transformations + (implicit_multiplication_application, convert_xor)
    namespace = {name: getattr(sp, name) for name in ("sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "exp", "pi")}
    namespace["ln"] = sp.log
    namespace["lg"] = lambda v: sp.log(v, 10)
    namespace["log"] = sp.log
    namespace["e"] = sp.E
    namespace["abs"] = sp.Abs
    namespace["factorial"] = sp.factorial
    try:
        # global_dict: только внутренние классы sympy, нужные парсеру; никаких builtins.
        safe_globals = {"__builtins__": {}, "Symbol": sp.Symbol, "Integer": sp.Integer,
                        "Float": sp.Float, "Rational": sp.Rational, "Function": sp.Function}
        return parse_expr(expr, local_dict=namespace, global_dict=safe_globals,
                          transformations=transformations, evaluate=True)
    except Exception:  # sympy бросает разные исключения на кривом вводе
        raise MathError("Не удалось разобрать формулу.")


def _pretty(text: str) -> str:
    text = text.replace("**", "^").replace("*", "·").replace("sqrt(", "√(").replace("cbrt(", "∛(")
    return re.sub(r"(?<![A-Za-z])I(?![A-Za-z])", "i", text)


def _solve_equation(expr: str) -> str:
    lhs_s, _, rhs_s = expr.partition("=")
    lhs = _sympify(lhs_s)
    rhs = _sympify(rhs_s) if rhs_s.strip() else 0
    eq = lhs - rhs
    free = sorted(eq.free_symbols, key=lambda s: s.name)
    if not free:
        return f"Это равенство {'верно' if sp.simplify(eq) == 0 else 'неверно'}."
    var = sp.Symbol("x") if sp.Symbol("x") in free else free[0]
    solutions = sp.solve(eq, var)
    if not solutions:
        return f"У уравнения нет решений относительно {var}."
    if len(solutions) == 1:
        return f"{var} = {_pretty(_round_sym(solutions[0]))}"
    subs = "₁₂₃₄₅₆₇₈₉"
    joined = "; ".join(
        f"{var}{subs[i] if i < len(subs) else i} = {_pretty(_round_sym(s))}" for i, s in enumerate(solutions)
    )
    return f"Корни уравнения: {joined}"


def _round_sym(value) -> str:
    try:
        num = complex(sp.N(value, 12))
        if abs(num.imag) < 1e-12:
            return format_number(round(num.real, 10)).replace(" ", "")
    except (TypeError, ValueError):
        pass
    return str(value)


def _derivative_or_integral(kind: str, expr: str) -> str:
    expr_obj = _sympify(expr)
    free = sorted(expr_obj.free_symbols, key=lambda s: s.name)
    var = sp.Symbol("x") if (not free or sp.Symbol("x") in free) else free[0]
    if kind == "diff":
        result = sp.diff(expr_obj, var)
        return f"f'({var}) = {_pretty(str(sp.simplify(result)))}"
    result = sp.integrate(expr_obj, var)
    return f"∫ {_pretty(str(expr_obj))} d{var} = {_pretty(str(result))} + C"


def _symbolic_transform(kind: str, expr: str) -> str:
    expr_obj = _sympify(expr)
    if kind == "simplify":
        return f"{_pretty(str(sp.simplify(expr_obj)))}"
    if kind == "expand":
        return f"{_pretty(str(sp.expand(expr_obj)))}"
    return f"{_pretty(str(sp.factor(expr_obj)))}"


# ---------------------------------------------------------------- точка входа

def answer_math_question(message: str) -> str | None:
    """Возвращает ответ на математический вопрос или None, если это не математика."""
    raw = normalize(message)
    if len(raw) > MAX_INPUT:
        return None

    # 1. Проценты: «15% от 200», «сколько будет 12 процентов от 350».
    m = _PERCENT_RE.search(raw)
    if m:
        a = float(m.group(1).replace(",", "."))
        b = float(m.group(2).replace(",", "."))
        return f"{format_number(a)}% от {format_number(b)} = {format_number(round(a * b / 100, 10))}"

    text = _preprocess(raw)
    triggered = bool(_TRIGGER_RE.search(raw)) or bool(_TRIGGER_RE.search(text))
    pure = bool(_PURE_MATH_RE.match(text)) and bool(re.search(r"\d", text)) and bool(re.search(r"[\+\-\*/\^]", text))

    if not triggered and not pure:
        return None

    # 2. Символьные задачи: упрощение, раскрытие скобок, разложение на множители.
    if _SYMPY_OK:
        if re.search(r"производн", raw):
            body = _strip_words(text, r"производн\w*(?:\s+функции)?|по x|от\b")
            if _looks_like_formula(body):
                try:
                    return _derivative_or_integral("diff", body)
                except MathError as exc:
                    return str(exc)
                except Exception:
                    return "Не удалось взять производную от этого выражения."
        if re.search(r"интеграл", raw):
            body = _strip_words(text, r"интеграл\w*|от\b|по x|\bdx\b|d x|dx")
            body = re.sub(r"\bdx\b", "", body).strip()
            if _looks_like_formula(body):
                try:
                    return _derivative_or_integral("int", body)
                except MathError as exc:
                    return str(exc)
                except Exception:
                    return "Не удалось вычислить интеграл."
        for kind, pattern in (("simplify", r"упрости"), ("expand", r"раскро\w* скобки"), ("factor", r"разложи\w*")):
            if re.search(pattern, raw):
                body = _best_chunk(text) or ""
                if _looks_like_formula(body):
                    try:
                        return _symbolic_transform(kind, body)
                    except MathError as exc:
                        return str(exc)
                    except Exception:
                        return "Не удалось выполнить преобразование."

    chunk = _best_chunk(text)
    if not chunk:
        return None

    # 3. Уравнения: «реши 2x + 3 = 7», «x^2 - 4 = 0».
    if "=" in chunk and re.search(r"[a-z]", chunk.replace("sqrt", "").replace("sin", "").replace("cos", "")):
        if _SYMPY_OK:
            try:
                return _solve_equation(chunk)
            except MathError as exc:
                return str(exc)
            except Exception:
                return "Не удалось решить уравнение."
        return "Для решения уравнений нужен sympy."

    if "=" in chunk:
        chunk = chunk.split("=")[0].strip()

    # 4. Числовое вычисление.
    if not chunk or not re.search(r"\d", chunk):
        return None
    if not (triggered or pure):
        return None
    try:
        value = evaluate(chunk)
    except MathError as exc:
        return str(exc) if (triggered or pure) else None
    except (OverflowError, ZeroDivisionError):
        return "Число получилось слишком большим или выражение некорректно."
    note = " (аргументы тригонометрических функций — в радианах)" if re.search(r"sin|cos|tan", chunk) else ""
    return f"{_pretty_expr(chunk)} = {format_number(value)}{note}"


def _looks_like_formula(body: str) -> bool:
    """Есть ли в фрагменте формула (латиница/цифры), а не обычные русские слова."""
    return bool(body) and bool(re.search(r"[a-z0-9]", body)) and not re.search(r"[а-я]", body)


def _strip_words(text: str, pattern: str) -> str:
    return re.sub(pattern, " ", text).strip(" :,.")


def _pretty_expr(expr: str) -> str:
    expr = expr.replace("**", "^").replace("*", "·")
    expr = re.sub(r"sqrt\((-?[\d.]+)\)", r"√\1", expr)
    expr = re.sub(r"cbrt\((-?[\d.]+)\)", r"∛\1", expr)
    expr = re.sub(r"\s*\^\s*", "^", expr)
    expr = re.sub(r"\s+", " ", expr).strip()
    return re.sub(r"(?<=\S) - (?=\S)", " − ", expr)
