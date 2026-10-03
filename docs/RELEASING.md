# Releases and versioning

## Channels

- **Development:** feature branches and `-dev.N` versions. These are not stable releases.
- **Prerelease:** a tagged `-rc.N` or other prerelease version, published explicitly as a GitHub prerelease after review.
- **Stable GitHub release:** a reviewed numeric version tag with an extension ZIP and checksum.
- **Chrome Web Store:** a separate manual submission and approval. A GitHub release does not imply store availability.

The current source version is the release candidate `0.3.0-rc.1`; the latest published GitHub release is `v0.2.2`. Nothing in this branch publishes a release on a branch push. Landing-page deployment runs only for matching changes on `main` or an explicit manual dispatch.

## Single version command

```sh
npm run version:set -- 0.3.0-dev.1
npm run version:check
```

This synchronizes `package.json`, both lockfile version fields, and the extension manifest. Chrome requires a numeric `version`; `version_name` displays the full development/prerelease identity. For example, `0.3.0-dev.1` maps to numeric `0.3.0` and display name `0.3.0-dev.1`. See [Chrome's version format](https://developer.chrome.com/docs/extensions/reference/manifest/version).

Prerelease suffixes do not create a higher Chrome update version. Test prereleases as unpacked builds or through a separately planned distribution channel; do not submit successive suffix-only changes as store upgrades. This script rejects unsupported formats and components above Chrome's numeric limit.

## Prepare a release

1. Complete the relevant [manual validation](EVALUATION.md#stable-release-validation). Record outcomes and unresolved limitations in release notes.
2. Choose the version and run `npm run version:set -- <version>`.
3. Move completed entries from Unreleased into a dated changelog section. Update the README release table and this document's current status. Keep planned work separate.
4. Run `npm ci`, `npm run package`, the screenshot harness build, and `npm --prefix landing ci && npm --prefix landing run build`.
5. Inspect `artifacts/v<version>/angel-extension.zip`: `manifest.json` must be at the archive root. Load the extracted package in Chrome and verify its displayed version and controls. The adjacent `SHA256SUMS.txt` covers the ZIP.
6. Commit and review the source before creating a tag.

Packaging requires the `zip` utility (available on macOS and the Ubuntu CI runner). `npm run package` runs version checks, tests, and a fresh build including the WASM runtime. Artifacts are ignored by Git. The asset name stays `angel-extension.zip` for compatibility with the website's latest-release download link; the containing tag/directory identifies the version.

## Draft, review, publish

When ready, create and push an annotated tag matching the source exactly:

```sh
git tag -a v0.3.0 -m 'Angel 0.3.0'
git push origin v0.3.0
```

The **Draft release** workflow runs CI, verifies tag/version agreement, downloads the checked artifact, and creates a draft with checksums and generated notes. Suffix versions are marked prerelease. It does not publish the draft or submit anything to the store.

Review the notes, known limitations, artifact contents, and version before manually publishing. Then handle any store submission separately. Never move an existing published tag to a different commit; ship a new version for fixes. Follow stable publication with a development-version bump for the next cycle.

Historical release dates in the changelog come from GitHub release metadata. They are not inferred store approval dates. The private `landing/package.json` version identifies the website package and is not an extension release version. Private store working notes remain local and are not the public release record.
