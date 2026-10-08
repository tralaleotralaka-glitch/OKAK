#!/usr/bin/env bash
# Запуск «Шёпота» — анонимного SMS-мессенджера
cd "$(dirname "$0")/app"
exec python3 server.py
