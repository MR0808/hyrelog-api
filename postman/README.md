# Postman Collection for HyreLog API

This directory contains Postman collections and environments for testing the HyreLog API.

## Files

- `HyreLog API.postman_collection.json` - Postman collection with all API endpoints
- `HyreLog Local.postman_environment.json` - Local development environment variables

## Import Instructions

1. Open Postman
2. Click **Import** button (top left)
3. Select both JSON files:
   - `HyreLog API.postman_collection.json`
   - `HyreLog Local.postman_environment.json`
4. Select the **HyreLog Local** environment from the environment dropdown (top right)
5. Start making requests!

## Environment Variables

The **HyreLog Local** environment includes:

- `base_url` - API base URL (default: `http://localhost:3000`)
- `internal_token` - Internal authentication token

## Available Endpoints

### Root
- `GET /` - Root endpoint (no auth required)

### Internal (requires `x-internal-token` header)
- `GET /internal/health` - Health check endpoint
- `GET /internal/metrics` - Metrics endpoint

## Updating the Collection

As new endpoints are added in Phase 1 and beyond, this collection will be updated to include:
- Business endpoints (`/v1/events`, etc.)
- API key authentication examples
- Rate limiting test cases
- Error scenario tests

