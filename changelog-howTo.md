Before releasing a new version of your catalog by pushing a tag to the repository, the changelog.json file must
be updated to include the changes accompanying the new release. There are specific rules for writing the changelog
to ensure it can be parsed and displayed in Stream Designer Studio and remains consistent with the changelogs
of other catalogs. Below, you can find an example of a correctly formatted changelog.

We adhere to the [Conventional Commits Specification](https://www.conventionalcommits.org), which defines how to
determine the new version based on the type of code changes made. When writing the changelog, you must categorize
your changes into predefined types (be sure to use the exact names listed here):

- Bug Fixes (correspond to PATCH in Semantic Versioning)
- Features (correspond to MINOR in Semantic Versioning)
- Code Refactoring (do not lead to a new release by default)
- Performance Improvements (do not lead to a new release by default)
- Miscellaneous Chores (do not lead to a new release by default)

The only types of interest to the end user of your catalog are bug fixes and new features. Other types of changes
are only relevant if they are breaking and thus should not appear in the changelog by default.

In addition to listing your changes, you also need to specify the date of the release and the new version number.
Determining the version number works as follows: If you have one or more breaking changes, increase the first digit
(major) and reset the other two digits to zero, regardless of whether you have bug fixes or features. If you introduce
new features without breaking changes, increment the second digit (minor) and set the third digit (patch) to zero. If
there are no breaking changes and no new features, but there are bug fixes, only increment the minor version.

While providing a changelog entry for a main release is mandatory, changelog entries for dev releases (e.g. v1.2.3-dev-1) are optional. In the Stream Designer Studio, a toggle switch button allows the user to display dev release changelogs.

Additional notes:

- New releases must always be included at the top of the changelog
- Order of changes inside the releases doesn't matter
- Do not remove older releases
- The first release must be version 1.0.0

Here is an example of how a correctly formatted changelog can look like after the third release:

```json
[
  {
    "version": "2.1.0",
    "date": "2024-09-28",
    "changes": [
      {
        "description": "Short description (one sentence) of your change in present tense",
        "type": "Features",
        "breaking": false
      },
      {
        "description": "Short description (one sentence) of your change in present tense",
        "type": "Bug Fixes",
        "breaking": false
      }
    ]
  },
  {
    "version": "2.0.0",
    "date": "2024-09-17",
    "changes": [
      {
        "description": "Short description (one sentence) of your change in present tense",
        "type": "Features",
        "breaking": false
      },
      {
        "description": "Short description (one sentence) of your change in present tense",
        "type": "Bug Fixes",
        "breaking": true
      },
      {
        "description": "Short description (one sentence) of your change in present tense",
        "type": "Code Refactoring",
        "breaking": true
      }
    ]
  },
  {
    "version": "1.0.0",
    "date": "2024-09-04",
    "changes": [
      {
        "description": "Initial release",
        "type": "Features",
        "breaking": false
      }
    ]
  }
]
```
