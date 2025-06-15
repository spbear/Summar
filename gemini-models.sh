#!/bin/bash

# Check script usage
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <GEMINI_API_KEY>"
    echo "Example: $0 your-api-key"
    exit 1
fi

API_KEY="$1"
ENDPOINT="https://generativelanguage.googleapis.com/v1beta/models"

# Call Gemini API using curl
echo "Retrieving Gemini models list..."
curl -s -X GET "$ENDPOINT" \
     -H "Content-Type: application/json" \
     -H "x-goog-api-key: $API_KEY" \
     -H "user-agent: Obsidian-Summar/1.1.19" | jq '.models[] | {name, version, displayName, description}'
     
# Check exit status
if [ $? -ne 0 ]; then
    echo "Error: API request failed"
    exit 2
fi

echo -e "\nGemini model list retrieval completed"