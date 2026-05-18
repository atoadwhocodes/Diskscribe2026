# DiskScribe2026 Legal and Distribution Policy

Effective date: May 18, 2026

## 1. Purpose

This policy documents the intended legal and distribution posture for DiskScribe2026. DiskScribe2026 is a standalone desktop utility for inspecting user-supplied legacy disk images and assisting with translation workflows.

The project is designed to support lawful preservation, research, interoperability, and translation work while avoiding distribution of proprietary game data, proprietary code, complete disk images, or other copyrighted source material supplied by users.

## 2. No Legal Advice

This document is a product and distribution policy. It is not legal advice, does not create an attorney-client relationship, and does not guarantee that any specific use is lawful or qualifies as fair use. Copyright, contract, anti-circumvention, and local law may vary by jurisdiction and by facts. Users and distributors should consult qualified counsel for specific legal questions.

This document does not modify the project license. Source code licensing remains governed by `LICENSE`.

## 3. Definitions

For purposes of this policy:

- "Application" means DiskScribe2026 and its packaged desktop builds.
- "User-supplied media" means disk images, files, or other media selected by a user at runtime.
- "Original source material" means proprietary game data, original game text, original source bytes, executable code, art, sound, fonts, full disk images, or other copyrighted material from user-supplied media.
- "Private project export" means a local translation project file intended for translators, reviewers, and project maintainers.
- "Clean patch export" means a public release artifact intended for distribution without original source text, original source bytes, or complete disk images.
- "Patched output" means a modified copy created locally from a user's own source image.

## 4. Application Commitments

DiskScribe2026 should be developed and distributed according to the following commitments:

1. The Application must not ship with commercial ROMs, disk images, proprietary game data, proprietary game code, copyrighted scripts, fonts, art, sound, or other third-party source material unless the project has express permission to do so.
2. The Application should require users to provide their own lawfully obtained source media.
3. The Application should inspect, extract, decode, and patch data locally on the user's machine.
4. The Application should not require a hosted backend for disk image processing or translation project handling.
5. The Application should avoid features whose primary purpose is bypassing access controls, DRM, copy protection, or other technological protection measures.
6. The Application should prefer patch-based distribution over redistribution of modified or unmodified game images.

## 5. Translation Workflow

DiskScribe2026 may maintain rich private translation data during active work. Private project files may include decoded source text, captured original bytes, offsets, encodings, categories, notes, QA metadata, review status, and translator attribution because translators and reviewers need context to produce accurate work.

Private project exports should be treated as project-internal files. They may contain original source material and should not be published as public patch releases unless separately reviewed and sanitized.

## 6. Public Release Artifacts

Public patch releases should use the clean export path. A clean patch export should contain only the information needed to apply a translation to a user's own source image, such as:

1. Application and patch format metadata.
2. Disk or source identifiers that do not expose private local paths.
3. Offset ranges and byte lengths.
4. Encodings and patch compatibility metadata.
5. Replacement text or replacement bytes created by the translation project.
6. Source-byte fingerprints or hashes for validation, when available.
7. Patch status, fit information, and nonproprietary notes.

A clean patch export must not intentionally include:

1. Complete disk images.
2. Original proprietary executable code.
3. Captured original source byte blobs.
4. Large dumps of original source text.
5. Proprietary art, sound, font, or other media assets.
6. Private local filesystem paths beyond minimal source identifiers.

## 7. Patched Output

The Application may create patched disk images locally by copying a user's own source image and applying reviewed or final translation entries to that copy.

Patched output should not be treated as a public release artifact unless the distributor has the legal right to distribute the resulting image. Public distribution should ordinarily use clean patch exports rather than patched disk images.

## 8. Verification and Safety Controls

Clean patch exports should support validation before patching. Where original source bytes are available in a private project, the clean export may include non-reversible fingerprints, hashes, byte lengths, and offset metadata so the patcher can verify that the user's source image appears to match the expected version.

The clean export should avoid embedding the original bytes themselves. If an entry cannot be validated without including original material, the export should prefer a hash or mark the entry as requiring manual verification.

## 9. User Responsibilities

Users are responsible for:

1. Obtaining source media lawfully.
2. Complying with copyright law, license agreements, platform rules, and local law.
3. Keeping private project exports private when they contain original source material.
4. Sharing clean patch exports rather than complete game images or proprietary data.
5. Avoiding use of DiskScribe2026 to bypass access controls or distribute unauthorized copies.

## 10. Distributor Responsibilities

Packaged physical media and digital packages should include:

1. The Application.
2. The project license.
3. This policy document.
4. Any release notes, checksums, or installer metadata.

Packaged releases should not include user-supplied disk images, proprietary game assets, extracted source text databases, or patched game images unless the distributor has documented permission or another clear legal basis.

## 11. Engineering Requirements

The codebase should preserve the following product boundaries:

1. Keep private project export and clean patch export as separate workflows.
2. Label the public release workflow as "Clean Patch" or equivalent.
3. Filter clean patch exports to reviewed or final entries.
4. Strip `sourceText` from clean patch entries.
5. Strip `sourceBytesBase64` and other original byte blobs from clean patch entries.
6. Sanitize local source paths in clean patch exports.
7. Include source verification hashes where useful and available.
8. Keep patched disk generation local to the user's machine.
9. Maintain tests proving that clean patch exports do not contain original source text or original source byte blobs.

## 12. Fair Use and Anti-Circumvention Notes

Fair use in the United States is a case-specific doctrine evaluated under Section 107 of the Copyright Act. No software feature or export format can guarantee that a particular use qualifies as fair use.

Software backup and archival rights may be addressed by Section 117 in some circumstances, but those rules are limited and fact-dependent.

Anti-circumvention rules under DMCA Section 1201 are separate from ordinary copyright infringement analysis. Exemptions may exist for certain classes of works and uses, but they are limited, temporary, and fact-specific. DiskScribe2026 should not be positioned as a tool for bypassing access controls.

## 13. Official Informational References

The following references are provided for general orientation only:

- U.S. Copyright Office, Fair Use: https://www.copyright.gov/fair-use/
- U.S. Copyright Office, Fair Use FAQ: https://www.copyright.gov/help/faq/faq-fairuse.html
- U.S. Copyright Office, Copyright and Digital Files FAQ: https://www.copyright.gov/help/faq/faq-digital.html
- U.S. Copyright Office, Section 1201: https://www.copyright.gov/1201/

## 14. Review

This policy should be reviewed before public releases, before major export-format changes, and before distributing any package that includes translation data, sample media, or patched output.
