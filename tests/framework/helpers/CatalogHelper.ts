import Node from "wave-engine/nodes/Node";
import { NodeConstructor } from "../definitions/application/NodeConstructor";

const initCatalog = async (catalogPath: string): Promise<Record<string, NodeConstructor>> => {
    const catalogModule = await import(catalogPath);
    return new catalogModule.Catalog(Node).nodeCatalog;
};

export { initCatalog as default };
