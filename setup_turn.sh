#!/bin/bash
sudo apt-get update
sudo apt-get install -y coturn

sudo tee /etc/turnserver.conf <<EOF
listening-port=3478
tls-listening-port=5349
external-ip=138.2.92.182
realm=priyochat.com
user=shahed:123456
fingerprint
lt-cred-mech
no-cli
EOF

sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

sudo systemctl restart coturn
sudo systemctl enable coturn
sudo systemctl status coturn --no-pager
