# Google Play Submission Profile

Official references:

- Android app signing / Play App Signing: https://developer.android.com/studio/publish/app-signing
- Android build/signing configuration: https://developer.android.com/build/build-variants
- Subscription policy/help: https://support.google.com/googleplay/android-developer/answer/9900533
- Play Console: https://play.google.com/console/
- Target API requirements: https://support.google.com/googleplay/android-developer/answer/11926878

## Android signing gate

Follow `release/android-signing.md`.

For Google Play:
- when Play App Signing is used, sign the upload AAB/APK with the app-specific **upload key**;
- for legacy/self-managed signing models, preserve the existing registered app signing identity and do not rotate it merely to adopt this template;
- use Play App Signing according to current Google Play requirements;
- keep the upload key separate from the Play-managed app signing key where supported;
- record and verify the expected upload certificate fingerprint;
- never use debug signing for a production upload;
- never commit the upload keystore or signing passwords;
- do not replace an existing production signing identity solely to normalize configuration names.

For new projects, use the canonical signing property/secret names from the Android signing contract. For brownfield apps, preserve update continuity first.

## Submission gate

Confirm:
- package/application ID and signing are production-correct;
- the AAB/APK signature and expected upload certificate are verified;
- the build satisfies the **current** Google Play target API / SDK requirement for its form factor;
- Data safety declarations match actual SDKs and data flows;
- Privacy Policy URL is public and current where required;
- content rating, target audience, permissions, ads, and other declarations are accurate;
- store listing and screenshots match the shipped build;
- paid/subscription functionality is testable.

## Subscription gate

Google requires subscription offers to be transparent and not misleading. Clearly disclose:
- subscription benefits;
- price;
- billing frequency;
- automatic renewal;
- whether subscription is required for material functionality;
- trial/introductory terms;
- other material conditions.

Subscriptions should provide sustained or recurring value rather than disguising a one-time benefit as recurring billing.

Test purchase, acknowledgement/entitlement, restore, renewal, cancellation/expiration handling, and account/device recovery as applicable.

## Legal/support links

Record:
```text
Privacy Policy: <PUBLIC PRIVACY URL>
Terms of Use: <PUBLIC TERMS URL>
Support: <PUBLIC SUPPORT URL OR CONTACT>
```

Do not hard-code a target API level into this template; Google updates the requirement over time. Verify the current official requirement at release time.

Do not assume Apple's Standard EULA applies to Google Play distribution.
