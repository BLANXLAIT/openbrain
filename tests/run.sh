#!/usr/bin/env bash
# Run integration tests against the deployed Open Brain API.
#
# Local usage:
#   AWS_PROFILE=platdev-developer ./tests/run.sh
#
# CI usage (credentials injected as env vars from Secrets Manager):
#   OPENBRAIN_API_URL=https://... \
#   OPENBRAIN_USERNAME=brain-ci@helix.com \
#   OPENBRAIN_PASSWORD=... \
#   OPENBRAIN_CLIENT_ID=... \
#   OPENBRAIN_USER_POOL_ID=... \
#   ./tests/run.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

if [ ! -d node_modules ]; then
  echo "Installing test dependencies..."
  npm install
fi

echo "Running Open Brain integration tests..."
npm test
