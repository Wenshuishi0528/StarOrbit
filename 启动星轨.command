#!/bin/zsh
cd -- "${0:A:h}" || exit 1
/usr/bin/env python3 scripts/serve.py --background --open
