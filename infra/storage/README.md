# Private screenplay bucket

Create one regional, private bucket in `us-central1`; do not grant public or browser principal access. Cloud Run's application service account receives object read/write access. The browser uses only the short-lived V4 PUT URL created by the application.

Apply the checked-in CORS policy only after the bucket name is chosen:

```powershell
gcloud storage buckets update gs://BUCKET_NAME --cors-file=infra/storage/cors.json
```

Apply uniform bucket-level access, public-access prevention, versioning, and the checked-in seven-day noncurrent-version lifecycle policy. Configure these with the project infrastructure owner before enabling `PROJECT_UPLOAD_BUCKET` in production.
