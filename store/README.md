# Store Submission Kit

This directory is the reusable release-readiness layer for products distributed through application stores or software directories such as WordPress.org.

It is a **checklist and metadata contract**, not a substitute for the current rules in App Store Connect, Google Play Console, Microsoft Partner Center, Huawei AppGallery Connect, or applicable law.

Store rules change. Before each submission, verify the current official policy and console requirements.

## Included profiles

- `apple.md` — Apple App Store / Mac App Store, including paid apps and auto-renewable subscriptions.
- `google-play.md` — Google Play.
- `microsoft-store.md` — Microsoft Store.
- `huawei-appgallery.md` — Huawei AppGallery.
- `wordpress-org.md` — official WordPress.org Plugin Directory submission/release profile.
- `SUBMISSION-METADATA.md` — reusable product/store metadata worksheet.
- `DATA-PRIVACY-DECLARATION.md` — data-type/privacy declaration inventory and store cross-check.
- `AGE-CONTENT-RATINGS.md` — age suitability, Apple ratings, Google Play/IARC, and minors checkpoint.
- `JURISDICTION-MATRIX.md` — per-store/per-country regulatory release matrix.
- `china-mainland-games.md` — explicit mainland-China game-publishing stop gate and preflight.

Projects should keep product-specific URLs, IDs, prices, reviewer credentials, screenshots, declarations, and release notes in their own repository or release system.

Android app projects must also use `release/android-signing.md` for cross-stack release/upload signing, secret naming, artifact verification, and key-recovery requirements.

## Universal pre-submission gate

Before submission, confirm:

- release version/build number is correct;
- production signing/package identity is correct;
- Android AAB/APK signatures and expected upload/signing certificate are verified where applicable;
- store listing accurately represents the shipped build;
- privacy policy is public, current, and matches actual data handling;
- terms/EULA choice is documented;
- support URL/contact is live;
- account deletion and data-rights flows exist where required;
- permissions/capabilities are justified and match the listing/privacy declarations;
- paid features and subscriptions are testable by reviewers;
- purchase, restore, entitlement, cancellation/management, and expiration behavior are tested;
- pricing, billing period, renewal terms, trial terms, and included benefits are clear;
- screenshots and feature graphics reflect the current product;
- data-type/privacy declarations match the shipped app and third-party SDKs;
- content/age rating declarations are accurate;
- IARC questionnaire/certificate is current where the store uses IARC, including Microsoft Store where applicable;
- jurisdiction-specific publishing/permit requirements are resolved for selected territories;
- Apple export-compliance determination is complete where applicable;
- Apple Accessibility Nutrition Label status/declarations are reviewed against the current requirement;
- Google Play's current target API requirement is verified rather than copied from a stale template value;
- reviewer notes explain non-obvious setup, hardware/model downloads, degraded modes, or external dependencies;
- no production secrets or personal reviewer credentials are committed to Git.

## Legal-link pattern

Every project should define canonical public URLs, for example:

```text
Privacy Policy: https://example.com/privacy
Terms of Use: https://example.com/terms
Support: https://example.com/support
```

For Apple products, explicitly record whether the app uses:

1. Apple's Standard EULA:
   https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

or

2. a custom EULA configured through App Store Connect.

A product may still maintain its own Terms of Use even when Apple's Standard EULA governs the licensed app relationship. Do not treat the two documents as automatically interchangeable; document the intended legal role and have product-specific legal text reviewed when necessary.

## Subscription rule

A subscription is not just a billing SKU. The shipped app, store metadata, and paywall must consistently describe:
- subscription name;
- duration/billing period;
- what the subscriber receives;
- full amount charged;
- renewal behavior;
- trial/introductory-offer terms when present;
- how existing subscribers restore/access purchases;
- links to Privacy Policy and Terms of Use where required.

Never generate or publish prices from a stale document when the store console is authoritative.
