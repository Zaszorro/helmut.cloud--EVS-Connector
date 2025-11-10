import type { StreamNodeSpecification } from "hcloud-sdk/lib/interfaces/high5/wave";
import Wave from "wave-engine/helpers/Wave";


export default abstract class Node {
    public static _isWaveNode = true;
    wave!: Wave; // This property will be inserted at runtime don't implement it
    abstract specification: StreamNodeSpecification;
    abstract execute(): Promise<void>;
}