# Microsoft Store Submission Profile

Official references:

- Publishing overview: https://learn.microsoft.com/en-us/windows/apps/publish/get-started
- Microsoft Store policies: https://learn.microsoft.com/en-us/windows/apps/publish/store-policies-and-code-of-conduct
- Current Store policy / IARC requirements: https://learn.microsoft.com/en-us/windows/apps/publish/store-policies
- MSIX privacy/support information: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/support-info

## Submission gate

Confirm:
- package identity/version/architecture are correct;
- app starts, remains responsive, and behaves correctly on supported Windows versions;
- listing accurately describes features and important limitations;
- privacy declarations match actual behavior and capabilities;
- support information is current;
- external dependencies are disclosed where required;
- reviewer/certification notes explain unusual prerequisites;
- accessibility and Windows platform behavior have been validated;
- the current Microsoft Store IARC questionnaire is completed accurately.

Microsoft requires a privacy policy for products that access, collect, or transmit personal information, and certain desktop product types may inherently require one.

## Paid/subscription products

For subscription or other paid functionality:
- document whether Microsoft commerce or an allowed secure third-party commerce path is used;
- make purchase initiation clear;
- state price/period/benefits accurately;
- preserve purchased entitlement for the paid period;
- test renewal, cancellation/expiration, and recovery;
- keep the current Store policy authoritative because permitted commerce models can change.

## Legal/support links

Record:
```text
Privacy Policy: <PUBLIC PRIVACY URL>
Terms of Use: <PUBLIC TERMS URL>
Website: <PUBLIC PRODUCT URL>
Support: <PUBLIC SUPPORT URL OR CONTACT>
```
