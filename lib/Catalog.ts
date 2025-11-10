import type Node from "./Node";

export default class Catalog {
    name: string;
    description: string;
    logoUrl: string;
    minimumEngineVersion: string;
    nodes: (new () => Node)[];
    nodeCatalog: Record<string, new () => Node>;

    constructor(
        name: string,
        description: string,
        logoUrl: string,
        minimumEngineVersion: string,
        ...nodes: (new () => Node)[]
    ) {
        this.name = name;
        this.description = description;
        this.logoUrl = logoUrl;
        this.minimumEngineVersion = minimumEngineVersion;
        this.nodes = nodes;
        this.nodeCatalog = {};
        for (const node of nodes) {
            this.nodeCatalog[node.name] = node;
        }
    }
}
