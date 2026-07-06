import { shellVariant } from "./walls.js";

const hcubeCommand = shellVariant("we:hcube", "faces", false);
const ehcubeCommand = shellVariant("we:ehcube", "faces", true);

export { hcubeCommand, ehcubeCommand };
