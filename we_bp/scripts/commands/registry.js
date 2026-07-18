import { CustomCommandRegistry } from "@minecraft/server";
import { DIRECTIONS } from "../actions/common.js";
import { pos1Command } from "./pos1.js";
import { pos2Command } from "./pos2.js";
import { wandCommand } from "./wand.js";
import { selCommand } from "./sel.js";
import { sizeCommand } from "./size.js";
import { expandCommand } from "./expand.js";
import { contractCommand } from "./contract.js";
import { shiftCommand } from "./shift.js";
import { outsetCommand } from "./outset.js";
import { insetCommand } from "./inset.js";
import { setCommand, esetCommand } from "./set.js";
import { cubeCommand, ecubeCommand } from "./cube.js";
import { hcubeCommand, ehcubeCommand } from "./hcube.js";
import { wallsCommand, ewallsCommand } from "./walls.js";
import { replaceCommand, ereplaceCommand } from "./replace.js";
import { hollowCommand } from "./hollow.js";
import { overlayCommand, eoverlayCommand } from "./overlay.js";
import { moveCommand } from "./move.js";
import { countCommand } from "./count.js";
import { copyCommand } from "./copy.js";
import { cutCommand } from "./cut.js";
import { pasteCommand } from "./paste.js";
import { rotateCommand } from "./rotate.js";
import { flipCommand } from "./flip.js";
import { clearClipboardCommand } from "./clearclipboard.js";
import { stackCommand } from "./stack.js";
import { sphereCommand, esphereCommand, hsphereCommand, ehsphereCommand } from "./sphere.js";
import { cylCommand, ecylCommand, hcylCommand, ehcylCommand } from "./cyl.js";
import { pyramidCommand, epyramidCommand, hpyramidCommand, ehpyramidCommand } from "./pyramid.js";
import { replaceNearCommand, ereplaceNearCommand } from "./replacenear.js";
import { removeNearCommand } from "./removenear.js";
import { drainCommand } from "./drain.js";
import { undoCommand } from "./undo.js";
import { redoCommand } from "./redo.js";
import { clearHistoryCommand } from "./clearhistory.js";
import { historyCommand } from "./history.js";
import { upCommand } from "./up.js";
import { unstuckCommand } from "./unstuck.js";
import { ascendCommand } from "./ascend.js";
import { descendCommand } from "./descend.js";
import { ceilCommand } from "./ceil.js";
import { thruCommand } from "./thru.js";
import { jumpToCommand } from "./jumpto.js";
import { debugCommand } from "./debug.js";
import { brushCommand, ebrushCommand } from "./brush.js";
import { generateCommand } from "./generate.js";
import { cancelCommand } from "./cancel.js";
import { centerCommand } from "./center.js";
import { symmetryCommand } from "./symmetry.js";
import { gradientCommand } from "./gradient.js";
import { bridgeCommand, ebridgeCommand } from "./bridge.js";
import { terrainCommand } from "./terrain.js";
import { drawCommand } from "./draw.js";
import { smoothCommand } from "./smooth.js";
import { setBrushCommand } from "./setbrush.js";
import { clearBrushCommand } from "./clearbrush.js";
import { brushesCommand } from "./brushes.js";
import { floodFillCommand } from "./floodfill.js";
import { bookCommand } from "./book.js";
import { pathCommand } from "./path.js";
import { maskCommand, emaskCommand } from "./mask.js";
import { posCommand } from "./pos.js";
import { maskPresetNames } from "../actions/mask.js";

const COMMANDS = [
    pos1Command,
    pos2Command,
    wandCommand,
    selCommand,
    sizeCommand,
    expandCommand,
    contractCommand,
    shiftCommand,
    outsetCommand,
    insetCommand,
    setCommand,
    esetCommand,
    cubeCommand,
    ecubeCommand,
    hcubeCommand,
    ehcubeCommand,
    wallsCommand,
    ewallsCommand,
    replaceCommand,
    ereplaceCommand,
    hollowCommand,
    overlayCommand,
    eoverlayCommand,
    moveCommand,
    countCommand,
    copyCommand,
    cutCommand,
    pasteCommand,
    rotateCommand,
    flipCommand,
    clearClipboardCommand,
    stackCommand,
    sphereCommand,
    esphereCommand,
    hsphereCommand,
    ehsphereCommand,
    cylCommand,
    ecylCommand,
    hcylCommand,
    ehcylCommand,
    pyramidCommand,
    epyramidCommand,
    hpyramidCommand,
    ehpyramidCommand,
    replaceNearCommand,
    ereplaceNearCommand,
    removeNearCommand,
    drainCommand,
    undoCommand,
    redoCommand,
    clearHistoryCommand,
    historyCommand,
    upCommand,
    unstuckCommand,
    ascendCommand,
    descendCommand,
    ceilCommand,
    thruCommand,
    jumpToCommand,
    debugCommand,
    brushCommand,
    ebrushCommand,
    generateCommand,
    cancelCommand,
    centerCommand,
    symmetryCommand,
    gradientCommand,
    bridgeCommand,
    ebridgeCommand,
    terrainCommand,
    drawCommand,
    smoothCommand,
    setBrushCommand,
    clearBrushCommand,
    brushesCommand,
    floodFillCommand,
    bookCommand,
    pathCommand,
    maskCommand,
    emaskCommand,
    posCommand
];

/**
 * Registers every world-edit enum and command on the custom command registry.
 * @param {CustomCommandRegistry} registry The startup command registry.
 * @returns {void}
 */
function registerCommands(registry) {
    registry.registerEnum("we:direction", Object.keys(DIRECTIONS));
    registry.registerEnum("we:axis", ["x", "z"]);
    registry.registerEnum("we:brushshape", ["sphere", "cylinder", "hsphere", "hcylinder", "none"]);
    registry.registerEnum("we:brushtype", ["sculpt", "paint", "erase", "gradient", "noise"]);
    registry.registerEnum("we:symmetryaction", ["set", "flip", "rotate", "radial", "status", "clear"]);
    registry.registerEnum("we:flipaxis", ["x", "y", "z"]);
    registry.registerEnum("we:gradientaction", ["start", "stop", "delete", "list"]);
    registry.registerEnum("we:gradienttype", ["planar", "spherical"]);
    registry.registerEnum("we:gradientinterp", ["nearest", "linear", "bezier"]);
    registry.registerEnum("we:terrainop", ["raise", "lower", "flatten", "smooth", "extrude", "roughen", "distort"]);
    registry.registerEnum("we:smoothmode", ["stable", "melt", "grow"]);
    registry.registerEnum("we:pathcurve", ["line", "arch", "catenary", "bezier"]);
    registry.registerEnum("we:pathaction", ["add", "build", "paste", "clear", "list"]);
    registry.registerEnum("we:maskpreset", maskPresetNames());
    registry.registerEnum("we:pathshape", ["deck", "tube"]);
    for (const command of COMMANDS) {
        registry.registerCommand(command.definition, command.handler);
    }
}

export { registerCommands };
