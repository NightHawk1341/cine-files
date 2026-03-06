#!/bin/bash

# ============================================================
# Yandex Cloud Secrets Setup Helper
# ============================================================
# This script helps you configure GitHub Secrets for Yandex Cloud deployment
#
# Prerequisites:
# 1. Yandex Cloud account created
# 2. Yandex Cloud CLI installed (yc)
# 3. Service account created with proper permissions
# ============================================================

set -e

echo "🚀 Yandex Cloud GitHub Secrets Setup Helper"
echo "============================================"
echo ""

# Check if yc CLI is installed
if ! command -v yc &> /dev/null; then
    echo "❌ Yandex Cloud CLI (yc) not found"
    echo "📥 Install from: https://cloud.yandex.ru/docs/cli/quickstart"
    exit 1
fi

echo "✅ Yandex Cloud CLI found"
echo ""

# Get current profile
PROFILE=$(yc config get profile.name || echo "none")
echo "📋 Current yc profile: $PROFILE"
echo ""

# Guide user through setup
echo "📝 You'll need to set these GitHub Secrets:"
echo ""
echo "1️⃣  YC_SA_JSON_KEY - Service Account JSON Key"
echo "2️⃣  YC_REGISTRY_ID - Container Registry ID"
echo "3️⃣  YC_CONTAINER_ID - Serverless Container ID"
echo "4️⃣  YC_SERVICE_ACCOUNT_ID - Service Account ID"
echo ""
echo "Let's gather these values..."
echo ""

# Step 1: Get Service Account ID
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Service Account"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Available service accounts:"
yc iam service-account list
echo ""
read -p "Enter Service Account ID (or press Enter to create new): " SA_ID

if [ -z "$SA_ID" ]; then
    echo ""
    echo "Creating new service account..."
    read -p "Enter name for service account (default: tribute-deployer): " SA_NAME
    SA_NAME=${SA_NAME:-tribute-deployer}

    SA_ID=$(yc iam service-account create --name "$SA_NAME" --format json | jq -r '.id')
    echo "✅ Created service account: $SA_ID"

    # Assign roles
    echo "Assigning roles..."
    yc resource-manager folder add-access-binding $(yc config get folder-id) \
        --role container-registry.images.pusher \
        --subject serviceAccount:$SA_ID

    yc resource-manager folder add-access-binding $(yc config get folder-id) \
        --role serverless.containers.admin \
        --subject serviceAccount:$SA_ID

    echo "✅ Roles assigned"
fi

echo ""
echo "📋 YC_SERVICE_ACCOUNT_ID=$SA_ID"
echo ""

# Step 2: Get Service Account Key
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Service Account JSON Key"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Creating service account key..."

KEY_FILE="sa-key-$SA_ID.json"
yc iam key create --service-account-id $SA_ID --output $KEY_FILE

echo "✅ Key saved to: $KEY_FILE"
echo ""
echo "📋 YC_SA_JSON_KEY (copy the content of this file):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat $KEY_FILE
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: Get or Create Container Registry
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Container Registry"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Available registries:"
yc container registry list
echo ""
read -p "Enter Registry ID (or press Enter to create new): " REGISTRY_ID

if [ -z "$REGISTRY_ID" ]; then
    echo ""
    echo "Creating new registry..."
    read -p "Enter name for registry (default: tribute): " REGISTRY_NAME
    REGISTRY_NAME=${REGISTRY_NAME:-tribute}

    REGISTRY_ID=$(yc container registry create --name "$REGISTRY_NAME" --format json | jq -r '.id')
    echo "✅ Created registry: $REGISTRY_ID"
fi

echo ""
echo "📋 YC_REGISTRY_ID=$REGISTRY_ID"
echo ""

# Step 4: Get or Create Serverless Container
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Serverless Container"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Available containers:"
yc serverless container list
echo ""
read -p "Enter Container ID (or press Enter to create new): " CONTAINER_ID

if [ -z "$CONTAINER_ID" ]; then
    echo ""
    echo "Creating new serverless container..."
    read -p "Enter name for container (default: tribute-api): " CONTAINER_NAME
    CONTAINER_NAME=${CONTAINER_NAME:-tribute-api}

    CONTAINER_ID=$(yc serverless container create --name "$CONTAINER_NAME" --format json | jq -r '.id')
    echo "✅ Created container: $CONTAINER_ID"
fi

echo ""
echo "📋 YC_CONTAINER_ID=$CONTAINER_ID"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Add these secrets to GitHub:"
echo "   Repository → Settings → Secrets and variables → Actions"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "YC_SA_JSON_KEY:"
echo "  Copy content from: $KEY_FILE"
echo ""
echo "YC_REGISTRY_ID:"
echo "  $REGISTRY_ID"
echo ""
echo "YC_CONTAINER_ID:"
echo "  $CONTAINER_ID"
echo ""
echo "YC_SERVICE_ACCOUNT_ID:"
echo "  $SA_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANT: Delete the key file after adding to GitHub:"
echo "   rm $KEY_FILE"
echo ""
echo "📚 Next steps:"
echo "   1. Add secrets to GitHub repository"
echo "   2. Configure environment variables in .env.yandex.template"
echo "   3. Push to main branch to trigger deployment"
echo ""
