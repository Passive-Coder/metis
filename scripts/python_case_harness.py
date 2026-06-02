import contextlib
import io
import json
import sys
import traceback


def _normalize(value):
    if isinstance(value, tuple):
        return [_normalize(item) for item in value]
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _normalize(value[key]) for key in sorted(value)}
    return value


def _failed_case(test, expected, error):
    return {
        "testCaseId": test.get("id"),
        "name": test.get("name"),
        "passed": False,
        "actual": None,
        "expected": expected,
        "error": error,
    }


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    source_code = payload.get("sourceCode", "")
    function_name = payload.get("functionName", "")
    tests = payload.get("tests", [])

    namespace = {}
    setup_error = None

    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
            io.StringIO()
        ):
            exec(source_code, namespace)
        if "Solution" not in namespace:
            raise NameError("Expected a class named Solution in submitted code.")
    except BaseException:
        setup_error = traceback.format_exc(limit=6)

    results = []
    for test in tests:
        expected = _normalize(test.get("expected"))
        if setup_error:
            results.append(_failed_case(test, expected, setup_error))
            continue

        try:
            solution = namespace["Solution"]()
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
                io.StringIO()
            ):
                actual = getattr(solution, function_name)(*test.get("args", []))
            actual = _normalize(actual)
            results.append(
                {
                    "testCaseId": test.get("id"),
                    "name": test.get("name"),
                    "passed": actual == expected,
                    "actual": actual,
                    "expected": expected,
                    "error": None,
                }
            )
        except BaseException:
            results.append(_failed_case(test, expected, traceback.format_exc(limit=6)))

    print(json.dumps({"results": results}, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
