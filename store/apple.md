# Apple Store Submission Profile

Official references:

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Auto-renewable subscriptions: https://developer.apple.com/app-store/subscriptions/
- Apple Standard EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
- Export compliance overview: https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance
- Accessibility Nutrition Labels: https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels

## Legal and metadata

Record the product's canonical:
- Privacy Policy URL;
- Terms of Use URL;
- Support URL;
- marketing/product URL when used;
- EULA choice: Apple Standard EULA or custom EULA.

For a paid subscription app, keep the Terms of Use link available in App Store metadata and in the app where required. Apple states that subscription sign-up should clearly show the subscription name/duration, included content or service, and full renewal price; App Store metadata must include links to Terms of Use and Privacy Policy.

If the project uses the Apple Standard EULA, use the canonical Apple URL:

```text
Apple Standard EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

A project-specific release record can look like:

```text
Privacy Policy: <PUBLIC PRIVACY URL>
Terms of Use: <PUBLIC TERMS URL>
Apple EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Support: <PUBLIC SUPPORT URL>
```

Do not copy a different product's Terms URL into a new app.

## Encryption / export compliance

Before each submission, determine whether the shipped app uses, accesses, contains, implements, or incorporates encryption and complete the current App Store Connect export-compliance flow. Do not hard-code assumptions from a previous release; encryption libraries, networking changes, and distribution countries can change the answer.

Record:
- export-compliance determination;
- documentation/reference if required;
- build metadata/plist setting used where applicable.

## Accessibility Nutrition Labels

Apple currently provides Accessibility Nutrition Labels so developers can declare support for accessibility features. They are voluntary at present, with Apple indicating they will become required over time.

Treat this as a forward-looking release field:
- verify current requirement status at submission time;
- report only capabilities validated against Apple's criteria;
- keep declarations aligned with the actual shipped build.

## Subscription paywall gate

Before review:
- subscription product/group exists in App Store Connect;
- title, duration, benefits, and full renewal price are visible and not misleading;
- annual plans emphasize the actual amount billed, not only a monthly equivalent;
- trial duration and post-trial charge are explicit;
- restore purchases/sign-in path works;
- entitlement state survives relaunch and device changes as designed;
- upgrade/downgrade/crossgrade behavior is tested when supported;
- Privacy Policy and Terms of Use links work inside the app;
- reviewer can reach and test the subscription flow.

## Review package

Provide accurate review notes for:
- demo/reviewer access where needed;
- unusual hardware requirements;
- model/content downloads;
- external services;
- offline/degraded behavior;
- subscription test path;
- anything that may otherwise appear broken or inaccessible.
