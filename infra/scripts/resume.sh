#!/usr/bin/env bash
# Undo pause.sh: start the database and NAT, then the app instances.
#
#   ./infra/scripts/resume.sh 2
set -euo pipefail

STACK=${STACK:-scipark-prod}
REGION=${AWS_REGION:-ap-southeast-1}
N=${1:-2}
HERE=$(cd "$(dirname "$0")" && pwd)

resource() {
  aws cloudformation describe-stack-resource --region "$REGION" --stack-name "$STACK" \
    --logical-resource-id "$1" --query StackResourceDetail.PhysicalResourceId --output text
}

DB=$(resource DbInstance)
NAT=$(resource NatInstance)
aws ec2 start-instances --region "$REGION" --instance-ids "$DB" "$NAT" >/dev/null
echo "Waiting for MongoDB and NAT to pass status checks..."
aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$DB" "$NAT"

"$HERE/scale.sh" "$N"

ALARMS=$(aws cloudwatch describe-alarms --region "$REGION" --alarm-name-prefix "$STACK-" \
  --query 'MetricAlarms[].AlarmName' --output text)
[ -n "$ALARMS" ] && aws cloudwatch enable-alarm-actions --region "$REGION" --alarm-names $ALARMS
echo "Resumed with $N app instance(s)."
