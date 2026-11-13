# Sourced by scale.sh and deploy-stack.sh.
#
# The template's AppAmiId / NatAmiId resolve to the newest Amazon Linux AMI on
# every stack update. When AWS publishes a new one, a routine update (scale,
# pause, resume) would try to replace the MongoDB and NAT instances, and fail:
# the DB keeps a fixed private IP, and Free-plan instance sizes are not always
# available in every zone. ami_pins prints the AMIs the stack's instances run
# now, so an update leaves them where they are.
#
#   PINS=$(ami_pins "$STACK" "$REGION")   # empty for a stack that does not exist yet
#
# UPDATE_APP_AMI=1 leaves the app tier unpinned, so the next app instances get
# the newest AMI (rolled out one at a time). The DB and NAT always stay pinned.

ami_pins() {
  local stack=$1 region=$2
  aws cloudformation describe-stacks --region "$region" --stack-name "$stack" >/dev/null 2>&1 || return 0

  local id ami out=""
  _res() {
    aws cloudformation describe-stack-resource --region "$region" --stack-name "$stack" \
      --logical-resource-id "$1" --query StackResourceDetail.PhysicalResourceId --output text
  }
  _ami() {
    aws ec2 describe-instances --region "$region" --instance-ids "$1" \
      --query 'Reservations[0].Instances[0].ImageId' --output text
  }

  id=$(_res DbInstance); ami=$(_ami "$id"); out+="DbAmiPin=$ami "
  id=$(_res NatInstance); ami=$(_ami "$id"); out+="NatAmiPin=$ami "
  if [ "${UPDATE_APP_AMI:-0}" = "1" ]; then
    out+="AppAmiPin="
  else
    id=$(_res AppLaunchTemplate)
    ami=$(aws ec2 describe-launch-template-versions --region "$region" --launch-template-id "$id" \
      --versions '$Latest' --query 'LaunchTemplateVersions[0].LaunchTemplateData.ImageId' --output text)
    out+="AppAmiPin=$ami"
  fi
  echo "$out"
}
