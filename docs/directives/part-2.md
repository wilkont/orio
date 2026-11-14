# CODEX MASTER DIRECTIVE — ORIO-SPC 3.0

## Continuation from Section 11 Through Final Production Acceptance

Project: ORIO Stable Progressive Currency\
Organization: ORIO.IO Lab\
Infrastructure: Google Cloud Platform\
GCP account: `Wilfried.k@ColomboAI.com`\
Domain: `ORIO.IO`\
Blockchain candidate: Base\
Priority: Critical\
Execution mandate: Build the complete production platform, with mandatory legal, security, reserve, and financial activation gates.

The following continues directly from Section 11 of the master directive.

# 11. ORIO IDENTITY AND ACCOUNT ABSTRACTION

ORIO must be usable by people who have never interacted with cryptocurrency.

Users should not need to understand:

- Public keys.
- Private keys.
- Seed phrases.
- Wallet addresses.
- Blockchain networks.
- Gas fees.
- Smart contracts.
- Token standards.
- Stablecoin contract addresses.
- Blockchain bridges.
- RPC endpoints.
- Transaction signing formats.

The user should experience ORIO as a modern, beautifully designed financial application—not as a complicated cryptocurrency wallet.

## 11.1 Identity architecture

Build ORIO Identity as a unified authentication and account-management system.

Support:

1. Phone number registration.
2. Email registration.
3. Passkey authentication.
4. Biometric authentication through supported devices.
5. Secure device enrollment.
6. Verified usernames.
7. Account recovery.
8. Multi-device access.
9. Business accounts.
10. Risk-based identity verification.

Use open standards where appropriate, including WebAuthn and OAuth 2.0/OpenID Connect.

Phone numbers and email addresses are identifiers, not sufficient authorization factors for transferring funds.

## 11.2 Account abstraction

Implement smart-account infrastructure compatible with the selected blockchain.

Evaluate established account-abstraction standards, including ERC-4337 where appropriate.

Required capabilities:

- Invisible wallet creation.
- Passkey-based transaction authorization.
- Sponsored network fees.
- Session keys with limited permissions.
- Spending limits.
- Transaction simulation.
- Transaction batching.
- Secure account recovery.
- Multi-device authorization.
- Emergency account protection.

### Wallet ownership model

Clearly distinguish between:

Noncustodial accounts: Users retain effective cryptographic control.

Custodial accounts: A regulated provider controls assets for customers.

Shared-control accounts: Transaction authorization is distributed across user and recovery mechanisms.

Do not market a custodial arrangement as noncustodial.

The default architecture should minimize unilateral company control over customer assets.

## 11.3 Phone number payments

Allow users to send ORIO to verified phone numbers.

Example:

A user selects a contact, enters $50 worth of ORIO, reviews the transaction, and authorizes payment.

The system resolves the verified phone number to the appropriate account without revealing the recipient's personal information publicly.

Protect against:

- SIM swapping.
- Phone number recycling.
- Contact enumeration.
- Unauthorized account linking.
- Social engineering.
- Recipient substitution.

## 11.4 Email payments

Support payments using verified email addresses.

The system must validate recipient ownership before allowing funds to be claimed.

Unclaimed payments must follow a documented expiration and refund policy.

## 11.5 ORIO usernames

Implement unique, human-readable identifiers.

Examples:

`@alex`\
`@businessname`

Users should be able to receive ORIO without sharing blockchain addresses.

Prevent impersonation, deceptive usernames, and unauthorized account transfers.

## 11.6 Account recovery

Build secure recovery for:

- Lost devices.
- Changed phone numbers.
- Lost passkeys.
- Compromised accounts.
- Device theft.
- Account takeover.
- Deceased-account-holder procedures.

Recovery must not permit an ORIO employee to unilaterally transfer customer assets.

Use cryptographically controlled recovery procedures with independent authorization where appropriate.

## 11.7 Authentication security

Implement:

- Device-bound passkeys.
- Phishing-resistant authentication.
- Transaction-specific authorization.
- Risk-based step-up verification.
- Session revocation.
- Security notifications.
- Device management.
- Suspicious-login detection.
- Withdrawal restrictions after high-risk account changes.

# 12. BUILD THE COMPLETE ORIO CONSUMER APPLICATION

Develop a beautiful, modern, accessible consumer financial application.

The experience should compete in simplicity with leading consumer payment applications.

## 12.1 Product design principles

The interface must be:

- Visually appealing.
- Extremely simple.
- Fast.
- Mobile-first.
- Responsive.
- Accessible.
- Multilingual.
- Consistent.
- Trustworthy.
- Easy to navigate.

Use elegant typography, balanced spacing, rounded components, meaningful icons, clear hierarchy, subtle animations, and intuitive interactions.

Avoid excessive technical terminology.

The interface should feel like a premium financial product, not a blockchain developer dashboard.

## 12.2 Core navigation

Implement five primary navigation areas.

| Navigation | Function                      |
| ---------- | ----------------------------- |
| Home       | Balance, value, appreciation  |
| Send       | Transfer ORIO                 |
| Receive    | Payment requests and QR codes |
| Convert    | Buy or redeem ORIO            |
| Activity   | Transactions and statements   |

Additional settings and security controls should be accessible without cluttering the primary interface.

## 12.3 Home dashboard

Display:

- Total ORIO holdings.
- Current dollar-equivalent redemption value.
- Current ORIO price.
- Appreciation history.
- Estimated net redemption proceeds.
- Recent transactions.
- Quick actions.
- Security alerts.

Distinguish protocol appreciation from the user's actual investment gains or losses.

## 12.4 Purchase experience

A user should be able to:

1. Select an approved stablecoin.
2. Enter the amount.
3. Review the conversion quotation.
4. See the 1% fee.
5. See the exact ORIO quantity expected.
6. Authorize payment.
7. Receive confirmation.
8. View the transaction receipt.

Do not hide conversion fees or exchange-rate effects.

## 12.5 Redemption experience

Display:

- ORIO quantity.
- Applicable redemption price.
- Gross redemption value.
- Mandatory 1% fee.
- Net settlement amount.
- Selected payout stablecoin.
- Network charges, if applicable.
- Settlement status.

The user must explicitly authorize the redemption.

## 12.6 Transfer experience

Enable transfers using:

- Phone numbers.
- Email addresses.
- ORIO usernames.
- QR codes.
- Payment links.
- Wallet addresses for advanced users.

Transfers must have no additional ORIO protocol fee.

If ORIO sponsors the blockchain network fee, display the actual user charge accurately.

## 12.7 Appreciation experience

Create an educational, visually engaging appreciation dashboard.

Show:

- Historical ORIO redemption price.
- Dollar-equivalent value of holdings.
- Appreciation events.
- Fees paid.
- Net economic performance.
- Historical conversion activity.

Do not imply that historical appreciation predicts future appreciation.

## 12.8 Activity and statements

Support:

- Transaction search.
- Filters.
- Receipts.
- CSV exports.
- PDF statements.
- Monthly summaries.
- Conversion history.
- Transfer history.
- Security events.

## 12.9 Accessibility

Meet WCAG 2.2 AA as the target accessibility standard.

Support:

- Screen readers.
- Keyboard navigation.
- Appropriate contrast.
- Scalable text.
- Reduced-motion settings.
- Accessible forms.
- Clear error messages.
- Touch-friendly controls.

## 12.10 Localization

Build internationalization into the architecture.

Initial language targets:

- English.
- French.

Design the system for future support of additional African and international languages.

Do not hardcode currencies, date formats, or regional assumptions.

# 13. ORIO MOBILE APPLICATIONS AND PWA

Build a complete mobile experience.

## 13.1 Recommended approach

Develop:

- A responsive web application.
- An installable progressive web application.
- Native or cross-platform iOS and Android applications where justified.

Evaluate a shared application architecture to reduce maintenance costs.

## 13.2 Mobile functionality

Support:

- Passkeys.
- Biometric authorization.
- Push notifications.
- QR payments.
- Contact-based transfers.
- Device security.
- Account recovery.
- Transaction history.
- Conversion.
- Redemption.
- Wallet management.

## 13.3 Offline behavior

The application may display securely cached, clearly labeled information while offline.

Do not represent an offline transaction as settled.

Any offline payment capability must have explicit risk limits and a separately verified settlement model.

## 13.4 Mobile security

Implement:

- Secure device storage.
- Certificate validation.
- Device integrity signals.
- Session expiration.
- Transaction authorization.
- Anti-tampering controls.
- Sensitive-data protection.

## 13.5 Application distribution

Prepare production builds, store metadata, privacy disclosures, screenshots, and release pipelines.

Do not submit or publish financial applications until applicable legal and platform requirements are satisfied.

# 14. ORIO WEBSITE — ORIO.IO

Rebuild ORIO.IO as the official consumer, developer, and institutional gateway to the ORIO ecosystem.

The website must be exceptionally attractive, fast, trustworthy, and easy to understand.

## 14.1 Design direction

Use a premium financial technology aesthetic.

Prioritize:

- Beautiful typography.
- Sophisticated color system.
- Modern illustrations and graphics.
- Elegant transitions.
- Responsive layouts.
- Clear messaging.
- Accessible navigation.
- Strong product demonstrations.

Maintain consistency across every page.

## 14.2 Required pages

Build:

1. Homepage.
2. How ORIO Works.
3. Stable Progressive Currency.
4. ORIO Wallet.
5. Send and Receive.
6. Convert.
7. ORIO for Businesses.
8. ORIO for Developers.
9. ORIO Protocol.
10. Monetary Economics.
11. Reserve Transparency.
12. Security.
13. Governance.
14. Documentation.
15. Pricing and Fees.
16. Supported Stablecoins.
17. Legal and Compliance.
18. Terms of Service.
19. Privacy Policy.
20. Risk Disclosures.
21. Help Center.
22. Contact.
23. Status Page.
24. Download the App.
25. User Sign In.
26. User Registration.

## 14.3 Homepage positioning

The homepage should explain ORIO immediately.

Suggested positioning:

ORIO — Money Designed to Progress.

Supporting explanation:

A digital currency designed for seamless payments and transparent, conversion-funded appreciation.

Avoid guaranteed-return claims.

## 14.4 Website functionality

Every visible button, link, form, and interactive component must work.

No fake dashboards.

No placeholder conversion tools presented as live.

No broken navigation.

No misleading claims about supported countries, licenses, reserves, or partnerships.

## 14.5 Transparency portal

Create a public transparency experience showing:

- Circulating supply.
- Current redemption price.
- Eligible reserve value.
- Reserve coverage.
- Approved stablecoins.
- Reserve composition.
- Protocol parameters.
- Smart-contract addresses.
- Security audit status.
- Settlement statistics.
- Governance proposals.

Clearly distinguish verified data from pending or unavailable data.

# 15. ORIO BUSINESS AND MERCHANT PLATFORM

Build a dedicated business experience.

## 15.1 Business accounts

Support:

- Business registration.
- Authorized representatives.
- Team permissions.
- Payment approvals.
- Transaction limits.
- Statements.
- API access.
- Webhook configuration.
- Business identity verification.

## 15.2 Merchant payments

Build:

- Payment links.
- Hosted checkout.
- QR payments.
- Invoices.
- Refund workflows.
- Payment confirmation.
- Transaction reconciliation.
- Accounting exports.

## 15.3 Enterprise controls

Support:

- Role-based permissions.
- Dual approval.
- Spending policies.
- Treasury reporting.
- Audit logs.
- API key management.
- Transaction monitoring.

## 15.4 Settlement clarity

Merchants must know whether they are receiving:

- ORIO.
- An approved stablecoin.
- Local fiat currency through a regulated partner.

Do not imply automatic fiat settlement where no such service exists.

# 16. ORIO DEVELOPER PLATFORM

Build a complete developer ecosystem.

## 16.1 Public APIs

Provide APIs for:

- Account creation.
- Wallet information.
- Conversion quotations.
- Purchases.
- Redemptions.
- Transfers.
- Payment requests.
- Merchant checkout.
- Transaction history.
- Settlement status.
- Protocol price.
- Supply.
- Reserve transparency.
- Webhooks.

## 16.2 API security

Require:

- Scoped credentials.
- Authentication.
- Authorization.
- Idempotency keys.
- Rate limiting.
- Request tracing.
- Audit logs.
- Replay protection.
- Webhook signatures.

## 16.3 SDKs

Deliver maintained SDKs for:

- TypeScript/JavaScript.
- Python.

Evaluate additional languages based on actual developer demand.

## 16.4 Developer documentation

Provide:

- Quick-start guides.
- Authentication documentation.
- API references.
- SDK examples.
- Webhook examples.
- Error handling.
- Sandbox access.
- Test credentials.
- Smart-contract integration guides.

## 16.5 Developer sandbox

Create a fully functional sandbox using test assets.

The sandbox must reproduce monetary calculations without using real customer funds.

Clearly label simulated balances.

# 17. WHATSAPP, EMAIL AND MESSAGING INTEGRATIONS

ORIO should be accessible through familiar communication channels.

## 17.1 WhatsApp

Support, where approved by the platform and applicable rules:

- Balance inquiries.
- Payment requests.
- Payment notifications.
- Transaction status.
- Secure payment initiation.
- Customer support.

Sensitive transactions must require independent secure authorization.

A compromised WhatsApp account must not automatically grant control over funds.

## 17.2 Email

Support:

- Account verification.
- Security notifications.
- Transaction receipts.
- Monthly statements.
- Recovery notifications.
- Service alerts.

## 17.3 SMS

Use SMS for supported notifications and limited verification workflows.

Do not rely on SMS as the sole authorization factor for high-value transactions.

## 17.4 Notification security

Prevent sensitive data leakage.

Implement:

- Notification preferences.
- Opt-in controls.
- Message authenticity protections.
- Rate limiting.
- Anti-phishing guidance.
- Account-security alerts.

# 18. COMPLIANCE AND FINANCIAL RISK INFRASTRUCTURE

Build compliance infrastructure as a first-class product component.

## 18.1 Legal classification

Maintain the ORIO Digital Commodity Classification Dossier.

Implement the technical evidence required to support legal review.

Do not claim that ORIO is officially classified as a digital commodity unless supported by an applicable authoritative determination.

## 18.2 Required compliance capabilities

Build configurable support for:

- KYC.
- KYB.
- AML monitoring.
- Sanctions screening.
- Transaction risk assessment.
- Fraud detection.
- Beneficial ownership checks.
- Suspicious activity workflows.
- Record retention.
- Regulatory reporting where required.
- Jurisdiction restrictions.
- Customer disclosures.

## 18.3 Legal release gate

Public real-money issuance must remain disabled until qualified counsel confirms:

- Applicable classification.
- Required licenses or exemptions.
- Custody legality.
- Redemption arrangements.
- Financial service provider responsibilities.
- Consumer protection requirements.
- Supported jurisdictions.
- Sanctions and AML obligations.

## 18.4 Jurisdiction controls

Implement a jurisdiction policy engine.

It should control:

- Registration eligibility.
- Supported conversions.
- Available payout assets.
- Transaction limits.
- Required identity checks.
- Restricted jurisdictions.
- Applicable disclosures.

Do not assume global legality.

## 18.5 Fraud prevention

Implement risk scoring for:

- Account takeover.
- Suspicious conversions.
- Unusual redemptions.
- Multi-account abuse.
- Payment fraud.
- Sanctions exposure.
- Abnormal transaction patterns.

Do not allow automated fraud scoring alone to permanently confiscate assets.

# 19. ORIO ADMINISTRATIVE AND OPERATIONS CONSOLE

Build a secure internal operations console.

## 19.1 Dashboard

Display:

- Active users.
- Conversion volume.
- Circulating supply.
- Redemption price.
- Reserve coverage.
- Pending redemptions.
- Stablecoin composition.
- Protocol health.
- Blockchain health.
- Revenue.
- Security alerts.

## 19.2 Operations

Provide tools for:

- Customer support.
- Transaction investigation.
- Compliance review.
- Reserve monitoring.
- Incident management.
- Service status.
- Partner management.
- Reporting.

## 19.3 Governance controls

Allow authorized personnel to submit governance proposals.

Do not expose unrestricted monetary control.

All privileged actions must be:

- Authenticated.
- Authorized.
- Logged.
- Reviewable.
- Subject to appropriate approval.

## 19.4 Financial reporting

Provide:

- Conversion fees collected.
- Company fee allocations.
- Holder appreciation allocations.
- Reserve changes.
- Outstanding liabilities.
- Operational expenses.
- Settlement reconciliation.
- Accounting exports.

## 19.5 Incident dashboard

Display:

- Active security incidents.
- Affected services.
- Affected monetary states.
- Recovery checkpoints.
- Investigation evidence.
- Required approvals.
- Recovery status.

# 20. GOOGLE CLOUD PLATFORM INFRASTRUCTURE

Deploy the new ORIO platform to GCP using the authorized organization and project under:

`Wilfried.k@ColomboAI.com`

Do not assume the account has unrestricted permissions.

Discover the actual GCP organization, billing project, IAM policies, quotas, and existing resources.

## 20.1 Recommended GCP architecture

| Component              | GCP service                                 |
| ---------------------- | ------------------------------------------- |
| Application services   | Cloud Run or GKE                            |
| Transactional database | Cloud SQL PostgreSQL or AlloyDB             |
| Event processing       | Pub/Sub                                     |
| Asynchronous workflows | Cloud Tasks / Workflows                     |
| Object storage         | Cloud Storage                               |
| Secrets                | Secret Manager                              |
| Encryption keys        | Cloud KMS                                   |
| Network security       | VPC, Cloud Armor                            |
| Load balancing         | Cloud Load Balancing                        |
| DNS                    | Cloud DNS, subject to migration plan        |
| Monitoring             | Cloud Monitoring                            |
| Logging                | Cloud Logging                               |
| Analytics              | BigQuery                                    |
| Container images       | Artifact Registry                           |
| CI/CD                  | Cloud Build or GitHub Actions               |
| Identity               | Appropriate managed identity infrastructure |

Choose services based on measured workload, cost, security, and operational requirements.

## 20.2 Environment separation

Create isolated:

- Development.
- Testing.
- Staging.
- Production.

Use separate secrets, credentials, databases, and contract deployments.

Never reuse production signing keys in development or testing.

## 20.3 Infrastructure as code

Use Terraform or an equivalent established infrastructure-as-code system.

All resources must be reproducible.

## 20.4 Security

Implement:

- Least-privilege IAM.
- Workload identity.
- Secret rotation.
- Private service connectivity.
- Encryption.
- Audit logging.
- Backup policies.
- Network segmentation.
- Security monitoring.
- Vulnerability scanning.

## 20.5 High availability

Use multi-zone services where appropriate.

Define and test recovery objectives.

Financial ledgers must have stronger durability and recovery requirements than noncritical website components.

## 20.6 Cost controls

Implement:

- Resource budgets.
- Spending alerts.
- Autoscaling limits.
- Capacity monitoring.
- Cost allocation labels.
- Environment-specific quotas.

Do not provision expensive infrastructure without confirming the applicable budget.

## 20.7 AWS migration

Migrate reusable services and data from legacy AWS where appropriate.

Required safeguards:

- Verified backups.
- Data integrity checks.
- Controlled cutover.
- Rollback plan.
- DNS migration plan.
- Monitoring during transition.
- No premature resource deletion.

## 20.