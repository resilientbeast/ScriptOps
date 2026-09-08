# Synthetic screenplay fixtures

All files in this directory are original synthetic test data created for ScriptOps. They contain no third-party screenplay text and may be committed under this repository's MIT license.

| Fixture | Purpose |
| --- | --- |
| `final-draft-basic.fdx` | Valid FDX: pre-scene text, numbered `12A` heading, unnumbered heading, action, character, and dialogue paragraphs. |
| `final-draft-doctype.fdx` | Reject DTD/entity declarations before XML parsing. |
| `final-draft-malformed.fdx` | Reject malformed XML before scene extraction. |
| `pdf-fixture.ts` | Builds text-based, blank, mixed-page, and 150+/page PDFs in memory for parser verification; it is not a committed binary. |
