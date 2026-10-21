#!/bin/zsh
cd -- "${0:A:h}" || exit 1
/usr/bin/env python3 scripts/update-orbit.py
printf '\n按回车关闭窗口。'
read -r reply
