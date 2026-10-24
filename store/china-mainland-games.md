# Mainland China Game Publishing Notice

> **Regulatory checkpoint:** Do not plan or enable mainland-China distribution of a game merely by selecting China mainland in a global store console. Verify current official requirements and obtain qualified local publishing/legal guidance before release.

Requirements can change and differ by game, publisher/operator, distribution channel, monetization, and service model. This file is a release gate and issue-spotting checklist, not legal advice.

## Apple App Store — China mainland

Apple's current App Store Connect guidance states that China mainland availability can require additional documentation. It states that:
- some apps require a valid MIIT Internet Content Provider (ICP) Filing Number;
- games must secure an approval number from China's National Press and Publication Administration (NPPA);
- Apple may require supporting documentation such as the game's ISBN Issuing Letter or Approval Reply and a current Business License;
- other regulated content categories can require separate permits.

Official Apple reference:
https://developer.apple.com/help/app-store-connect/reference/app-information/app-information

NPPA publishes game-approval results, including approval document numbers and publication/ISBN numbers:
https://www.nppa.gov.cn/

## Game-specific preflight

Before mainland-China game distribution, verify current requirements for:

- [ ] NPPA game approval / publication number (commonly referred to operationally as a game approval number/ISBN-related approval).
- [ ] Required publishing entity and operating entity arrangements.
- [ ] MIIT ICP filing/license applicability and metadata matching.
- [ ] Store/channel-specific supporting documents.
- [ ] Simplified-Chinese metadata consistency with filed/approved information.
- [ ] Real-name registration requirements.
- [ ] Minor-protection and anti-addiction requirements.
- [ ] Play-time/payment restrictions for minors where applicable.
- [ ] Content review/censorship requirements.
- [ ] In-game monetization/payment rules.
- [ ] Privacy, personal-information, cybersecurity, and cross-border/data-localization requirements.
- [ ] Server/network/service-location requirements where applicable.
- [ ] Version/update/change implications for the approval.
- [ ] Local publisher/operator contractual responsibility.
- [ ] Current requirements verified immediately before submission.

## Stop condition

If a project cannot identify the required approval/filing route, publisher/operator arrangement, or current minor-protection/data obligations, mark **China mainland distribution BLOCKED**. Exclude the territory from release until the requirements are resolved.

Never treat:
- an Apple/Google/Microsoft/Huawei approval in another territory;
- an IARC age rating;
- a privacy policy;
- or a global store account

as a substitute for mainland-China publishing authorization.
