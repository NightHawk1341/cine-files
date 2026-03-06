#!/bin/bash

# ============================================================
# Yandex Cloud Container Registry Cleanup Script
# ============================================================
# This script removes old container images to reduce registry usage.
# It keeps the most recent N images and deletes the rest.
#
# Usage:
#   ./scripts/cleanup-registry.sh [OPTIONS]
#
# Options:
#   -r, --registry-id    Registry ID (or set YC_REGISTRY_ID env var)
#   -i, --image-name     Image name to clean up (default: tribute-app)
#   -k, --keep           Number of recent images to keep (default: 5)
#   -d, --dry-run        Show what would be deleted without deleting
#   -a, --all            Clean up all images in registry
#   -h, --help           Show this help message
#
# Prerequisites:
#   - Yandex Cloud CLI (yc) installed and configured
#   - Service account with container-registry.images.deleter role
# ============================================================

set -e

# Default values
KEEP_COUNT=5
DRY_RUN=false
CLEAN_ALL=false
IMAGE_NAME="tribute-app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Help function
show_help() {
    echo "Yandex Cloud Container Registry Cleanup Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -r, --registry-id    Registry ID (or set YC_REGISTRY_ID env var)"
    echo "  -i, --image-name     Image name to clean up (default: tribute-app)"
    echo "  -k, --keep           Number of recent images to keep (default: 5)"
    echo "  -d, --dry-run        Show what would be deleted without deleting"
    echo "  -a, --all            Clean up all images in registry"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -r crp12345 -k 3                    # Keep last 3 images"
    echo "  $0 -r crp12345 -i tribute-app -d       # Dry run for tribute-app"
    echo "  $0 -r crp12345 -a -k 5                 # Clean all images, keep 5 each"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--registry-id)
            REGISTRY_ID="$2"
            shift 2
            ;;
        -i|--image-name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -k|--keep)
            KEEP_COUNT="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -a|--all)
            CLEAN_ALL=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Get registry ID from environment if not provided
REGISTRY_ID=${REGISTRY_ID:-$YC_REGISTRY_ID}

if [ -z "$REGISTRY_ID" ]; then
    echo -e "${RED}Error: Registry ID not provided${NC}"
    echo "Use -r flag or set YC_REGISTRY_ID environment variable"
    exit 1
fi

# Check if yc CLI is installed
if ! command -v yc &> /dev/null; then
    echo -e "${RED}Error: Yandex Cloud CLI (yc) not found${NC}"
    echo "Install from: https://cloud.yandex.ru/docs/cli/quickstart"
    exit 1
fi

echo -e "${BLUE}🧹 Yandex Cloud Container Registry Cleanup${NC}"
echo "============================================"
echo ""
echo -e "Registry ID: ${GREEN}$REGISTRY_ID${NC}"
echo -e "Keep count:  ${GREEN}$KEEP_COUNT${NC}"
echo -e "Dry run:     ${GREEN}$DRY_RUN${NC}"
echo ""

# Function to clean up images for a specific repository
cleanup_repository() {
    local repo_name=$1

    echo -e "${BLUE}Processing repository: $repo_name${NC}"

    # Get all images sorted by creation date (newest first)
    # Use --repository-name to filter directly (format: registry-id/image-name)
    IMAGES=$(yc container image list \
        --repository-name "$REGISTRY_ID/$repo_name" \
        --format json 2>/dev/null | \
        jq -r 'sort_by(.createdAt) | reverse | .[].id')

    if [ -z "$IMAGES" ]; then
        echo -e "${YELLOW}  No images found for $repo_name${NC}"
        return
    fi

    # Convert to array
    IMAGE_ARRAY=($IMAGES)
    TOTAL_COUNT=${#IMAGE_ARRAY[@]}

    echo -e "  Total images: ${GREEN}$TOTAL_COUNT${NC}"

    if [ $TOTAL_COUNT -le $KEEP_COUNT ]; then
        echo -e "  ${GREEN}Nothing to delete (count <= keep threshold)${NC}"
        return
    fi

    # Calculate how many to delete
    DELETE_COUNT=$((TOTAL_COUNT - KEEP_COUNT))
    echo -e "  Images to delete: ${YELLOW}$DELETE_COUNT${NC}"

    # Get images to delete (skip the first KEEP_COUNT)
    DELETED=0
    for ((i=KEEP_COUNT; i<TOTAL_COUNT; i++)); do
        IMAGE_ID=${IMAGE_ARRAY[$i]}

        if [ "$DRY_RUN" = true ]; then
            echo -e "  ${YELLOW}[DRY RUN]${NC} Would delete: $IMAGE_ID"
        else
            echo -e "  Deleting: $IMAGE_ID"
            if yc container image delete "$IMAGE_ID" 2>/dev/null; then
                ((DELETED++))
            else
                echo -e "  ${RED}Failed to delete: $IMAGE_ID${NC}"
            fi
        fi
    done

    if [ "$DRY_RUN" = false ]; then
        echo -e "  ${GREEN}Deleted $DELETED images${NC}"
    fi
    echo ""
}

# Get list of repositories in the registry
if [ "$CLEAN_ALL" = true ]; then
    echo -e "${BLUE}Fetching all repositories...${NC}"
    REPOS=$(yc container repository list \
        --registry-id "$REGISTRY_ID" \
        --format json 2>/dev/null | \
        jq -r '.[].name')

    if [ -z "$REPOS" ]; then
        echo -e "${YELLOW}No repositories found in registry${NC}"
        exit 0
    fi

    echo -e "Found repositories: ${GREEN}$(echo $REPOS | tr '\n' ' ')${NC}"
    echo ""

    for repo in $REPOS; do
        cleanup_repository "$repo"
    done
else
    cleanup_repository "$IMAGE_NAME"
fi

echo -e "${GREEN}✅ Cleanup complete!${NC}"

# Show summary
echo ""
echo "Summary:"
echo "--------"
for repo in $(yc container repository list --registry-id "$REGISTRY_ID" --format json 2>/dev/null | jq -r '.[].name'); do
    count=$(yc container image list --repository-name "$REGISTRY_ID/$repo" --format json 2>/dev/null | jq 'length')
    echo -e "  $repo: ${GREEN}$count images${NC}"
done
