async function printSpec(nodeName) {
    const catalog = (await import("../bundle.js")).default.default;

    const node = new catalog.nodeCatalog[nodeName]();
    const path = `name://${node.constructor.name}`;
    node.specification.path = path;

    const data = JSON.stringify({ path, specification: node.specification });

    console.log(data);
}

const path = process.argv[2];

if (!path || !path.length) {
    console.error("No path provided");
    process.exit(1);
}

printSpec(path);
