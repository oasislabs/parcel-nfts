#!/bin/sh
apt install gcc libsodium-dev make autoconf
cd /home/ubuntu
git clone https://github.com/cathugger/mkp224o --depth 1
cd mkp244o
./autogen.sh
./configure --enable-amd64-64-24k --enable-intfilter
make -j
mkdir keys
chown -R ubuntu:ubuntu *
./mkp224o barnstar -B -d keys -S 300 > mining.log & disown
