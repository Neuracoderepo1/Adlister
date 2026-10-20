# Marketplace integrations: access and launch gates

No live marketplace adapter is enabled in this codebase. The dashboard intentionally labels channels as unconfigured and the job endpoint only records durable requests. This is not evidence that any marketplace API is publicly available to this project.

Before implementing a channel:
1. Verify the marketplace's current official developer/partner documentation and seller terms.
2. Obtain written approval or the appropriate seller/partner account access.
3. Confirm supported listing operations, allowed rate limits, image/content requirements, update semantics, sandbox availability, webhook/signature mechanisms, and token refresh rules.
4. Store secrets in server-side Supabase Edge Function secrets or a dedicated secret manager. Store only secret references and non-sensitive status metadata in the database.
5. Build and test an adapter against a sandbox or authorized test account.
6. Use idempotency, request correlation IDs, exponential backoff with jitter for retryable responses, strict rate limits, and audit logs.
7. Verify remote success before marking a job item successful; capture external listing IDs and remote status.
8. Add monitoring and a manual kill switch before production rollout.

## Channel checklist

- **Tonaton** — adapter disabled. Verify whether a supported API or approved partner integration exists for the intended seller account. If not, do not automate browser interactions or claim a listing was updated.
- **Jiji** — adapter disabled. Confirm seller/API access and permitted automation with the platform first.
- **Jumia** — adapter disabled. Request the appropriate seller/partner API access and credentials; verify country-specific marketplace coverage.
- **Konga** — adapter disabled. Verify current partner API access, credentials, and allowed listing lifecycle operations.
- **Takealot** — adapter disabled. Verify approved seller integration access and South Africa-specific requirements.

The checklist is a request-for-verification, not a claim about each platform's current API availability. Never use proxy rotation, stealth automation, EXIF manipulation, or anti-detection tactics to evade marketplace rules.
