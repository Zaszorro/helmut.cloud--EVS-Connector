import fs from "fs";

const changelog = JSON.parse(fs.readFileSync("changelog.json", "utf8"));

const convertedChangelog = changelog.map((release) => {
    const convertedRelease = {
        version: release.version,
        date: release.date,
        commitGroups: [],
    };

    const commitGroupsMap = {};

    const breakingChanges = [];

    release.changes.forEach((change) => {
        const commit = { message: change.description };

        if (change.breaking) {
            breakingChanges.push(commit);
        }

        if (!commitGroupsMap[change.type]) {
            commitGroupsMap[change.type] = [];
        }
        commitGroupsMap[change.type].push(commit);
    });

    // If there are breaking changes, add the BREAKING CHANGES group first
    if (breakingChanges.length > 0) {
        convertedRelease.commitGroups.push({
            title: "BREAKING CHANGES",
            commits: breakingChanges,
        });
    }

    // Add the other commit groups
    for (const [type, commits] of Object.entries(commitGroupsMap)) {
        convertedRelease.commitGroups.push({
            title: type,
            commits: commits,
        });
    }

    return convertedRelease;
});

fs.writeFileSync(
    "changelog-converted.json",
    JSON.stringify(convertedChangelog, null, 2)
);

console.log(
    "Changelog has been converted and saved to changelog-converted.json"
);
