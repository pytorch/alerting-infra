# TODO

- [x] Move webhook shared token from env vars to AWS Secrets Manager ✅
- [ ] Add 30-second timeout to GitHub API fetch calls
- [ ] Fix DynamoDB race condition using transactions instead of conditional checks
- [ ] Implement parallel processing for SQS batch records with Promise.allSettled()
- [ ] Add integration tests for end-to-end SNS→SQS→Lambda→DynamoDB→GitHub flow
- [ ] Create test suite for webhook Lambda authentication and SNS publishing