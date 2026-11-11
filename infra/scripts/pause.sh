#!/usr/bin/env bash
# Stop paying for compute while nobody is using the system (nights, weekends).
#
#   ./infra/scripts/pause.sh
#   ./infra/scripts/resume.sh 2
#
# Stops: app instances (scaled to 0), MongoDB and NAT instances (stopped; data
# stays on its EBS volume). Still billed while paused: the load balancer
# (~US$0.6/day), EBS storage and public IPv4 addresses. To stop all charges,
# delete the stack - the database volume is kept as a final snapshot.
set -euo pipefail

STACK=${STACK:-scipark-prod}
REGION=${AWS_REGION:-ap-southeast-1}
HERE=$(cd "$(dirname "$0")" && pwd)

resource() {
  aws cloudformation describe-stack-resource --region "$REGION" --stack-name "$STACK" \
    --logical-resource-id "$1" --query StackResourceDetail.PhysicalResourceId --output text
}

"$HERE/scale.sh" 0

ALARMS=$(aws cloudwatch describe-alarms --region "$REGION" --alarm-name-prefix "$STACK-" \
  --query 'MetricAlarms[].AlarmName' --output text)
# "No healthy hosts" is expected now; do not email about it.
[ -n "$ALARMS" ] && aws cloudwatch disable-alarm-actions --region "$REGION" --alarm-names $ALARMS

aws ec2 stop-instances --region "$REGION" --instance-ids "$(resource DbInstance)" "$(resource NatInstance)" >/dev/null
echo "Paused. Resume with: ./infra/scripts/resume.sh 2"
