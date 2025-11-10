import type { ExtendedHigh5ExecutionPackage as ExtendedSdkHigh5ExecutionPackage } from "hcloud-sdk/lib/interfaces/high5/space/execution";

interface ExtendedHigh5ExecutionPackage extends ExtendedSdkHigh5ExecutionPackage {
    hcl: any;
}

export { ExtendedHigh5ExecutionPackage };
