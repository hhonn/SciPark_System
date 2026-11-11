#!/usr/bin/env bash
# Amazon SES helper.
#
#   ./infra/scripts/ses-verify.sh status              # sandbox or production? verified addresses
#   ./infra/scripts/ses-verify.sh add a@b.com c@d.com # let SES deliver to these (sandbox)
#
# While the account is in the SES sandbox, mail is only delivered to verified
# addresses. "add" makes AWS send each address a verification link; once it is
# clicked, that person receives SciPark's OTP and password-reset mail. After
# AWS grants production access (SES console -> Account dashboard -> Request
# production access) anyone can receive mail and this is no longer needed.
set -euo pipefail

REGION=${AWS_REGION:-ap-southeast-2}
CMD=${1:-status}
shift || true

case "$CMD" in
  status)
    aws sesv2 get-account --region "$REGION" \
      --query '{ProductionAccess: ProductionAccessEnabled, SendingEnabled: SendingEnabled, Max24h: SendQuota.Max24HourSend, SentLast24h: SendQuota.SentLast24Hours}' \
      --output table
    echo "Verified addresses:"
    aws sesv2 list-email-identities --region "$REGION" \
      --query 'EmailIdentities[].[IdentityName, VerificationStatus]' --output table
    ;;
  add)
    [ $# -gt 0 ] || { echo "usage: ses-verify.sh add <email> [email...]"; exit 1; }
    for EMAIL in "$@"; do
      aws sesv2 create-email-identity --region "$REGION" --email-identity "$EMAIL" >/dev/null \
        && echo "Verification link sent to $EMAIL (check spam too)"
    done
    ;;
  *)
    echo "usage: ses-verify.sh status | add <email>..."; exit 1 ;;
esac
