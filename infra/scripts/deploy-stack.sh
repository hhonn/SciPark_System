#!/usr/bin/env bash
# Create or update the SciPark stack.
#
#   ./infra/scripts/deploy-stack.sh you@example.com
#
# Run from AWS CloudShell or any shell with the AWS CLI logged in.
# On the first run the app tier starts at 0 instances: there is no release to
# run yet. Push to main (or run the Deploy workflow), then ./scale.sh 2.
set -euo pipefail

STACK=${STACK:-scipark-prod}
REGION=${AWS_REGION:-ap-southeast-2}
EMAIL=${1:?usage: deploy-stack.sh <alert-email>}
HERE=$(cd "$(dirname "$0")/.." && pwd)
. "$HERE/scripts/ami-pins.sh"

if aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" >/dev/null 2>&1; then
  echo "Updating $STACK (unchanged parameters keep their current values)"
  # The instances stay on the AMIs they run (see ami-pins.sh).
  read -r -a EXTRA <<< "$(ami_pins "$STACK" "$REGION")"
else
  echo "Creating $STACK in $REGION"
  # Lets only CloudFront reach the load balancer.
  PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists --region "$REGION" \
    --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
    --query 'PrefixLists[0].PrefixListId' --output text)
  EXTRA=(
    "OriginVerifyValue=$(openssl rand -hex 24)"
    "CloudFrontPrefixListId=$PREFIX_LIST"
    "AppMinSize=0"
    "AppDesiredCapacity=0"
  )
fi

# KEEP_ON_FAILURE=1 keeps whatever was created if something fails, so a broken
# instance can be inspected (Session Manager, console output) instead of being
# rolled back and deleted. Fix, then run this script again to continue.
ROLLBACK=()
[ "${KEEP_ON_FAILURE:-0}" = "1" ] && ROLLBACK=(--disable-rollback)

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file "$HERE/scipark.yaml" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  "${ROLLBACK[@]}" \
  --parameter-overrides "AlertEmail=$EMAIL" "${EXTRA[@]}"

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table

echo
echo "Confirm the SNS subscription email sent to $EMAIL to receive alarms."
