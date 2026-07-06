import { setVariant } from "./set.js";

const cubeCommand = setVariant("we:cube", "Cube", false);
const ecubeCommand = setVariant("we:ecube", "Cube", true);

export { cubeCommand, ecubeCommand };
