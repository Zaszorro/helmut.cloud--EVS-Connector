import fs from "fs/promises";
import chalk from "chalk";
import path from "path";

async function main() {
    console.log(`Building specification`);

    const mod = await import(process.argv[2]);

    const catalog = mod.default.default; // Need two defaults because this is a mjs file and the bundle has a non-ESM default export

    const spec = { nodes: [] };

    for (const [name, nodeCtor] of Object.entries(catalog.nodeCatalog)) {
        try {
            const node = new nodeCtor();
            const nodeSpec = node.specification;
            console.log(chalk.green(name));
            spec.nodes.push(
                Object.assign(nodeSpec, {
                    path: `name://${name}`,
                })
            );
        } catch (err) {
            console.error(err, name);
        }
    }
    if (spec.nodes.length === 0) {
        console.error("No nodes in the specification. Aborting");
        process.exit(1);
    }
    // Sort to make it easier to compare between catalog versions
    spec.nodes.sort((a, b) => a.name.localeCompare(b.name));

    await fs.writeFile(path.join("./specification.json"), JSON.stringify(spec));
}

main();
