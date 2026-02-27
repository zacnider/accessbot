#!/bin/bash
set -euo pipefail

# AccessBot - Google Cloud Run Deployment Script

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT env var}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="accessbot"

echo "==> Deploying AccessBot to Cloud Run"
echo "    Project: $PROJECT_ID"
echo "    Region:  $REGION"
echo "    Service: $SERVICE_NAME"

# Build and deploy from source
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --timeout=3600 \
  --concurrency=100 \
  --session-affinity \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_VERTEXAI=TRUE" \
  --min-instances=0 \
  --max-instances=10 \
  --cpu=2 \
  --memory=1Gi

echo "==> Deployment complete!"
echo "    Service URL:"
gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format="value(status.url)"
