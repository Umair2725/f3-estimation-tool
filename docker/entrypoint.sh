#!/bin/sh
# Container start: refuse to start with bad settings, apply database migrations, start the app.
set -e

node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /app/scripts/check-env.ts

cd /migrate
./node_modules/.bin/prisma migrate deploy

cd /app
exec node server.js
