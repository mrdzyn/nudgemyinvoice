# Huawei AppGallery Submission Profile

Official references:

- AppGallery Connect: https://developer.huawei.com/consumer/en/service/josp/agc/index.html
- AppGalleryKit getting started / IAP setup: https://developer.huawei.com/consumer/en/doc/appgallery-connect-guides/appgallerykit-getting-started-0000001055756858

## Android signing gate

For Android APK/AAB submissions, follow `release/android-signing.md`.

Preserve the app's existing production signing identity for updates. Never use debug signing for a production AppGallery artifact, and never commit the release/upload keystore or passwords.

## Submission gate

Confirm:
- AppGallery package identity/version/signing are correct;
- app information, screenshots, category, age/content declarations, and supported devices are accurate;
- privacy statement/policy and permissions match actual behavior;
- required Huawei services are enabled only when used;
- reviewer can exercise paid features.

## Paid/subscription products

When Huawei IAP/subscriptions are used:
- configure IAP parameters/agreements as required in AppGallery Connect;
- configure product IDs and subscription products in the console;
- use sandbox/test accounts for payment testing;
- configure server callback handling when the architecture depends on subscription lifecycle notifications;
- test initial purchase, renewal, cancellation, entitlement, and recovery;
- clearly describe price, period, renewal, trial/promotion, and benefits.

## Legal/support links

Record:
```text
Privacy Policy: <PUBLIC PRIVACY URL>
Terms of Use: <PUBLIC TERMS URL>
Support: <PUBLIC SUPPORT URL OR CONTACT>
```

Do not assume Apple or Google legal/commerce terms apply to AppGallery.
