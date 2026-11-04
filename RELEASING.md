# Releasing

Releases are published to npm from GitHub Actions with npm trusted publishing. The workflow uses short-lived OpenID Connect credentials, so the repository does not store an npm access token.

## One-time npm setup

An npm owner of `homebridge-mpower-ssh` must configure a trusted publisher on the package's npm settings page with these values:

- Provider: GitHub Actions
- Organization or user: `Veritas413`
- Repository: `homebridge-mpower-ssh`
- Workflow filename: `release.yml`
- Environment: leave blank

The trusted-publisher configuration must exist before publishing the first automated release.

## Prepare a release

1. Start from an up-to-date `main` branch with a clean working tree.
2. Choose the next semantic version and update both package files without creating a local tag:

   ```bash
   npm version patch --no-git-tag-version
   ```

   Use `minor` or `major` instead when the release warrants it.
3. Add a dated entry to `CHANGELOG.md` describing user-visible changes and compatibility requirements.
4. Run the same checks as CI:

   ```bash
   npm ci
   npm run build
   npm test -- --runInBand
   npm run lint
   npm pack --dry-run
   npm audit --omit=dev
   ```

5. Open and merge a pull request containing the version and changelog changes.

## Publish

1. From the GitHub repository, create a new release targeting `main`.
2. Create a tag that exactly matches the package version with a `v` prefix, such as `v1.0.1`.
3. Copy the matching changelog entry into the release notes and publish the GitHub release.
4. The `Publish` workflow verifies that the tag and package version agree, repeats the build and validation checks, and publishes the package to npm.
5. Confirm the workflow succeeded and verify the new version:

   ```bash
   npm view homebridge-mpower-ssh version
   ```

Do not reuse or move a published version tag. If publishing fails after npm accepts the version, prepare a new patch version; npm will not allow the same package version to be published again.
