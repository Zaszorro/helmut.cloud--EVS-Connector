import type { NodeInputs } from "./Inputs";

interface Design {
    node: string;
    uuid: number | string;
    inputs: NodeInputs;
    onSuccess?: Design;
}

export { Design };
