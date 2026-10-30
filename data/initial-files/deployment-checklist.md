# Deployment Checklist (EC2)

Required environment variables in `.env`:

    DATABASE_URL="postgresql://user:password@host:5432/dbname"
    S3_BUCKET="your-bucket-name"
    AWS_REGION="ap-south-1"

1. Attach an IAM role to the EC2 instance with S3 access to the bucket.
2. Allow outbound TCP 5432 to the RDS instance in the security group.
3. Run `npm run setup:production` once after first boot.
4. Start the app with `npm run build && npm run preview` or your process manager.

No manual SQL is ever required — the app and the setup script both run the same
idempotent schema definition on every boot.
