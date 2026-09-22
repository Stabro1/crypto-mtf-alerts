#!/usr/bin/env bash
set -euo pipefail
sudo apt-get update
sudo apt-get install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo mkdir -p /opt/wyckoff-worker
sudo chown "$USER":"$USER" /opt/wyckoff-worker
echo 'Copy wyckoff_worker files into /opt/wyckoff-worker, create .env, then run: npm install'
echo 'Install the systemd unit and run: sudo systemctl enable --now wyckoff-worker'
