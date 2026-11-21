"""Report one desktop cloud download to the local library service."""
import json
import sys


def run(build):
    def emit(value):
        print(json.dumps(value), flush=True)

    last = None
    def transfer(received, total):
        nonlocal last
        if not 0 <= received <= total or total <= 0:
            return
        percent = 100 * received // total
        if percent != last:
            last = percent
            emit({'downloadPercent': percent})

    try:
        result = build(*sys.argv[1:4], progress=lambda s: emit({'status': s}), on_transfer=transfer)
        emit({'result': result})
    except Exception as error:
        emit({'error': str(error), 'retryable': getattr(error, 'retryable', False)})
        sys.exit(1)
