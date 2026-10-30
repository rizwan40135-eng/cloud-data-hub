# Getting Started

This document ships as an initial file: `scripts/auto-ingest.mjs` uploads it to
S3 (production) and records its metadata in the `files` table.

On a fresh EC2 box, run:

    npm run setup:production

The script is idempotent — run it as many times as you like.
