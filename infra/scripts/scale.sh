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
REGION=${AWS_REGION:-ap-southeast-2}
N=${1:?usage: scale.sh <instances>}
# N is the floor as well as the starting point. With a floor of 1, the CPU
# target-tracking policy scaled an idle 2-instance fleet back to 1 within
# minutes, leaving a single AZ. Above N it still scales out (up to AppMaxSize).
MIN=$N
HERE=$(cd "$(dirname "$0")/.." && pwd)
. "$HERE/scripts/ami-pins.sh"
# Keep the instances on the AMIs they run, so scaling never replaces the DB or NAT.
read -r -a PINS <<< "$(ami_pins "$STACK" "$REGION")"

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$HERE/scipark.yaml" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "AppMinSize=$MIN" "AppDesiredCapacity=$N" "${PINS[@]}"

echo "App tier: min $MIN, desired $N"
