#!/usr/bin/env bash
# Set how many app instances run.
#
#   ./infra/scripts/scale.sh 2   # one per AZ: high availability (demo, real use)
#   ./infra/scripts/scale.sh 1   # cheaper, single instance
#   ./infra/scripts/scale.sh 0   # no app instances (see pause.sh)
#
# Goes through CloudFormation, not straight to the Auto Scaling group: otherwise
# the next stack update would quietly put the old number back.
set -euo pipefail

STACK=${STACK:-scipark-prod}
REGION=${AWS_REGION:-ap-southeast-1}
N=${1:?usage: scale.sh <instances>}
MIN=$(( N > 0 ? 1 : 0 ))
HERE=$(cd "$(dirname "$0")/.." && pwd)

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$HERE/scipark.yaml" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "AppMinSize=$MIN" "AppDesiredCapacity=$N"

echo "App tier: min $MIN, desired $N"
