# WordPress.org Plugin Submission Profile

Use this profile for plugins intended for the official WordPress.org Plugin Directory.

Official references:
- Plugin Directory handbook: https://developer.wordpress.org/plugins/wordpress-org/
- Detailed Plugin Guidelines: https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/
- Planning, submitting, and maintaining plugins: https://developer.wordpress.org/plugins/wordpress-org/planning-submitting-and-maintaining-plugins/
- SVN release workflow: https://developer.wordpress.org/plugins/wordpress-org/how-to-use-subversion/
- `readme.txt`: https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/
- Plugin assets: https://developer.wordpress.org/plugins/wordpress-org/plugin-assets/

WordPress.org rules change. Verify the current handbook before submission.

## Pre-submission gate

Confirm:
- the plugin is complete and installable as the submitted ZIP;
- licensing is GPL-compatible for code and bundled assets/libraries;
- name/slug does not violate trademarks or imply unauthorized affiliation;
- source is human-readable and required source/build information is available;
- WordPress-provided libraries are used instead of bundling conflicting copies where required;
- security, capability/nonce validation, sanitization/escaping, and update behavior are reviewed;
- third-party APIs/services and their terms are documented;
- user tracking/telemetry requires appropriate consent;
- no prohibited executable-code delivery pattern is used;
- the plugin is not merely prohibited trialware;
- SaaS functionality, if used, complies with the directory's SaaS rules;
- plugin headers, version, `Requires at least`, `Requires PHP`, and `Tested up to` are current as applicable;
- `readme.txt` meets current WordPress.org expectations;
- privacy/disclosure text matches actual data flows;
- no production credentials, development artifacts, or unrelated files are included.

## Freemium / commercial products

WordPress.org permits commercial and SaaS models but the free directory plugin must still comply with the directory guidelines.

When using Freemius or another monetization/licensing service:
- reconcile SDK behavior with WordPress.org consent/tracking requirements;
- keep premium-only code/distribution consistent with the chosen architecture;
- do not turn the WordPress.org build into prohibited trialware;
- document external-service dependencies and data flows.

See `integrations/freemius.md` when Freemius is selected.

## Submission flow

1. Test the exact release ZIP.
2. Submit the complete ZIP through the current WordPress.org plugin submission process.
3. Resolve Plugin Review Team findings.
4. After approval, publish through the assigned WordPress.org SVN repository.
5. Treat SVN as a **release repository**, not the primary development repository.
6. Keep `trunk`, version tags, `readme.txt`, and stable-tag/version values aligned.
7. Put directory screenshots/icons/banners in the top-level SVN `assets/` location as required.

## Release checklist

- [ ] Git/main release candidate is approved.
- [ ] Exact plugin ZIP installs and activates on supported WordPress/PHP versions.
- [ ] Plugin/static/security checks completed where applicable.
- [ ] No secrets/dev-only files included.
- [ ] `readme.txt` and plugin headers match the release.
- [ ] Changelog/version bumped.
- [ ] SVN `trunk` updated from the approved artifact/source.
- [ ] Release tag created in SVN.
- [ ] Directory assets verified.
- [ ] WordPress.org page/update behavior checked after propagation.
