#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-.env.enc}"
OUTPUT="${2:-.env}"

if [ -z "${ENV_KEY:-}" ]; then
	read -r -s -p "Enter decryption key: " ENV_KEY
	echo
fi

ENV_KEY="$ENV_KEY" ENV_IN="$INPUT" ENV_OUT="$OUTPUT" node -e "const fs=require('fs');const crypto=require('crypto');const pass=process.env.ENV_KEY;const [saltB64,ivB64,tagB64,encB64]=fs.readFileSync(process.env.ENV_IN,'utf8').trim().split(':');const salt=Buffer.from(saltB64,'base64');const iv=Buffer.from(ivB64,'base64');const tag=Buffer.from(tagB64,'base64');const enc=Buffer.from(encB64,'base64');const key=crypto.pbkdf2Sync(pass,salt,100000,32,'sha256');const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);const dec=Buffer.concat([decipher.update(enc),decipher.final()]);fs.writeFileSync(process.env.ENV_OUT,dec);"